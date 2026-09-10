import type { StoreApi } from 'zustand/vanilla'
import { repository } from '../data/index.js'
import { evaluate } from '../engine/jumpRules.js'
import {
  applyPresented,
  applyReviewResult,
  applySelfEval,
  applySkip,
  initialProgress,
} from '../engine/srs.js'
import type { Word } from '../types/domain.js'
import type {
  JumpContext,
  JumpDecision,
  Progress,
  SelfEval,
  Session,
  StudySettings,
} from '../types/progress.js'
import type { AppState } from './index.js'
import { createInitialSession } from './persistence.js'

/**
 * 写操作唯一入口（架构 §1.3 / §2.6）。
 *
 * 约定：
 * - 页面 / service **只 dispatch**，不自行计算新状态；
 * - action 内部调用 T02 的纯引擎（`srs` / `jumpRules` / `progress`）算出新值；
 * - 所有函数都是纯同步状态变更（内部会调用平台端口写盘，但端口永不 throw）。
 */

/** 本轮 `evaluate` 的触发场景。 */
export type JumpTrigger = 'selfEval' | 'scene'

/** 浮层模式：`auto` = J1 自动展开，`prompt` = J2 引导。 */
export type DetailSheetMode = 'auto' | 'prompt'

/** 供页面 dispatch 的全部写操作。 */
export interface Actions {
  /** 持久化恢复完成 / 失败后解除门控。 */
  setHydrated(hydrated: boolean): void
  /** 确保某目标存在进度记录（幂等）。 */
  ensureProgress(targetId: string): Progress
  /**
   * 卡片**首次可见**时调用（PRD §5.5 展示即转态）：`未学 → 学习中`，幂等。
   * 这是「学习中」态的唯一入口；不调用则 `applySkip` 无意义。
   */
  markPresented(targetId: string, now?: number): void
  /** 提交三档自评；返回本次命中的跳转决策（页面据此决定是否开浮层）。 */
  submitSelfEval(
    targetId: string,
    selfEval: SelfEval,
    now?: number,
  ): JumpDecision[]
  /** 跳过词条：`学习中 → 未学`，不计分。 */
  skipWord(targetId: string, now?: number): void
  /** 提交复习结果（对 / 错）。 */
  submitReviewResult(targetId: string, correct: boolean, now?: number): void
  /** 开始学习某模块：读会话断点定位起始词序。 */
  startStudy(moduleId: string, now?: number): void
  /** 更新当前词序（翻页）。 */
  setCurrentIndex(index: number, now?: number): void
  /** 打开半屏详解浮层。 */
  openDetailSheet(wordId: string, mode: DetailSheetMode): void
  /** 关闭半屏详解浮层。 */
  closeDetailSheet(): void
  /** 打卡：跨天时重置今日配额并推进连续天数。 */
  markStudyDay(now?: number): void
  /** 更新学习设置（发音语速 / 音调 / 开关）。 */
  updateSettings(patch: Partial<StudySettings>): void
  /** 切换「解锁规则」开关（快捷入口）。 */
  toggleUnlockRule(): void
  /** 清空全部学习进度（P9 数据管理）。 */
  resetAllProgress(): void
}

type StoreSet = StoreApi<AppState>['setState']
type StoreGet = StoreApi<AppState>['getState']

const MS_PER_DAY = 24 * 60 * 60 * 1000

/** 本地日期串（`YYYY-MM-DD`），用于打卡与配额判定。 */
function toDateString(now: number): string {
  const date = new Date(now)
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** 连续天数推进：同日不变、隔日 +1、断档归 1。 */
function nextStreakDays(
  lastStudyDate: string,
  today: string,
  current: number,
): number {
  if (lastStudyDate === today) {
    return current
  }
  if (lastStudyDate === '') {
    return 1
  }
  const previous = new Date(`${lastStudyDate}T00:00:00`).getTime()
  const current0 = new Date(`${today}T00:00:00`).getTime()
  const diffDays = Math.round((current0 - previous) / MS_PER_DAY)
  return diffDays === 1 ? current + 1 : 1
}

/** 跨天滚动：若会话日期不是今天则重置今日配额并推进连续天数。 */
function rollSessionDay(session: Session, now: number): Session {
  const today = toDateString(now)
  if (session.lastStudyDate === today) {
    return session
  }
  return {
    ...session,
    lastStudyDate: today,
    todayNewCount: 0,
    todayReviewCount: 0,
    streakDays: nextStreakDays(
      session.lastStudyDate,
      today,
      session.streakDays,
    ),
  }
}

/** 三档自评是否计为「一次错误」（供 J2 会话错题计数）。 */
function isWrongSelfEval(selfEval: SelfEval): boolean {
  return selfEval !== '认识'
}

/**
 * 构造跳转评估上下文：把 store 状态 + 仓库数据拼成引擎所需输入。
 *
 * 导出以便 `services/studySession.ts` 复用（scene 触发评估），避免重复实现。
 */
export function buildJumpContext(
  state: AppState,
  word: Word,
  wordProgress: Progress,
  selfEval?: SelfEval,
): JumpContext {
  const moduleWords = repository.getModuleWords(word.moduleId)
  let moduleLearned = 0
  for (const moduleWord of moduleWords) {
    if (state.progress[moduleWord.id]?.state === '已掌握') {
      moduleLearned += 1
    }
  }

  const grammarLearned: Record<string, boolean> = {}
  for (const grammar of repository.getAllGrammars()) {
    if (state.progress[grammar.id]?.state === '已掌握') {
      grammarLearned[grammar.id] = true
    }
  }

  const grammarIds = new Set<string>()
  for (const sentence of repository.getSentencesByWord(word.id)) {
    for (const link of sentence.grammars) {
      grammarIds.add(link.grammarId)
    }
  }

  return {
    word,
    grammarById: (id: string) => repository.getGrammarById(id),
    wordProgress,
    grammarLearned,
    sessionWrongCount: state.runtime.sessionWrongCount,
    moduleLearned,
    moduleTotal: moduleWords.length,
    selfEval,
    grammarIds: [...grammarIds],
  }
}

/** 创建全部 action（绑定到 store 的 set / get）。 */
export function createActions(set: StoreSet, get: StoreGet): Actions {
  return {
    setHydrated(hydrated: boolean): void {
      set((state) => ({ runtime: { ...state.runtime, hydrated } }))
    },

    ensureProgress(targetId: string): Progress {
      const existing = get().progress[targetId]
      if (existing !== undefined) {
        return existing
      }
      const progress = initialProgress(targetId)
      set((state) => ({
        progress: { ...state.progress, [targetId]: progress },
      }))
      return progress
    },

    markPresented(targetId: string, now?: number): void {
      const at = now ?? Date.now()
      const state = get()
      const existing = state.progress[targetId]
      if (existing === undefined) {
        set({
          progress: {
            ...state.progress,
            [targetId]: applyPresented(initialProgress(targetId), at),
          },
        })
        return
      }
      const next = applyPresented(existing, at)
      if (next === existing) {
        return
      }
      set({ progress: { ...state.progress, [targetId]: next } })
    },

    submitSelfEval(
      targetId: string,
      selfEval: SelfEval,
      now?: number,
    ): JumpDecision[] {
      const at = now ?? Date.now()
      const state = get()
      const word = repository.getWordById(targetId)
      const existing = state.progress[targetId] ?? initialProgress(targetId)

      // J1 需要「本次自评前」的 seen，故用旧进度评估决策。
      let decisions: JumpDecision[] = [{ rule: 'none' }]
      if (word !== undefined) {
        decisions = evaluate(
          buildJumpContext(state, word, existing, selfEval),
          'selfEval',
        )
      }

      const next = applySelfEval(existing, selfEval, at)
      const session = rollSessionDay(state.session, at)
      set({
        progress: { ...state.progress, [targetId]: next },
        session: {
          ...session,
          todayNewCount: existing.seen
            ? session.todayNewCount
            : session.todayNewCount + 1,
        },
        runtime: {
          ...state.runtime,
          sessionWrongCount: isWrongSelfEval(selfEval)
            ? state.runtime.sessionWrongCount + 1
            : state.runtime.sessionWrongCount,
          lastDecisions: decisions,
        },
      })
      return decisions
    },

    skipWord(targetId: string, now?: number): void {
      const at = now ?? Date.now()
      const state = get()
      const existing = state.progress[targetId] ?? initialProgress(targetId)
      set({
        progress: { ...state.progress, [targetId]: applySkip(existing, at) },
        session: rollSessionDay(state.session, at),
      })
    },

    submitReviewResult(targetId: string, correct: boolean, now?: number): void {
      const at = now ?? Date.now()
      const state = get()
      const existing = state.progress[targetId] ?? initialProgress(targetId)
      const session = rollSessionDay(state.session, at)
      set({
        progress: {
          ...state.progress,
          [targetId]: applyReviewResult(existing, correct, at),
        },
        session: {
          ...session,
          todayReviewCount: session.todayReviewCount + 1,
        },
      })
    },

    startStudy(moduleId: string, now?: number): void {
      const at = now ?? Date.now()
      const state = get()
      const module = repository
        .getAllModules()
        .find((candidate) => candidate.id === moduleId)
      const words = repository.getModuleWords(moduleId)
      const resumeIndex =
        state.session.moduleId === moduleId ? state.session.lastWordIndex : 0
      const maxIndex = Math.max(words.length - 1, 0)
      const currentIndex = Math.min(Math.max(resumeIndex, 0), maxIndex)
      const session = rollSessionDay(state.session, at)
      set({
        session: {
          ...session,
          stageId: module?.stageId ?? '',
          moduleId,
          lastWordIndex: currentIndex,
        },
        runtime: {
          ...state.runtime,
          currentModuleId: moduleId,
          currentIndex,
          sessionWrongCount: 0,
          detailSheet: { visible: false, wordId: null, mode: null },
          lastDecisions: [],
        },
      })
    },

    setCurrentIndex(index: number, now?: number): void {
      const at = now ?? Date.now()
      const state = get()
      const words = repository.getModuleWords(state.session.moduleId)
      const maxIndex = Math.max(words.length - 1, 0)
      const currentIndex = Math.min(Math.max(index, 0), maxIndex)
      set({
        session: {
          ...rollSessionDay(state.session, at),
          lastWordIndex: currentIndex,
        },
        runtime: { ...state.runtime, currentIndex },
      })
    },

    openDetailSheet(wordId: string, mode: DetailSheetMode): void {
      set((state) => ({
        runtime: {
          ...state.runtime,
          detailSheet: { visible: true, wordId, mode },
        },
      }))
    },

    closeDetailSheet(): void {
      set((state) => ({
        runtime: {
          ...state.runtime,
          detailSheet: { visible: false, wordId: null, mode: null },
        },
      }))
    },

    markStudyDay(now?: number): void {
      const at = now ?? Date.now()
      const state = get()
      set({ session: rollSessionDay(state.session, at) })
    },

    updateSettings(patch: Partial<StudySettings>): void {
      set((state) => ({ settings: { ...state.settings, ...patch } }))
    },

    toggleUnlockRule(): void {
      set((state) => ({
        settings: {
          ...state.settings,
          unlockRuleEnabled: !state.settings.unlockRuleEnabled,
        },
      }))
    },

    resetAllProgress(): void {
      const state = get()
      set({
        progress: {},
        session: createInitialSession(),
        runtime: { ...state.runtime, sessionWrongCount: 0, lastDecisions: [] },
      })
    },
  }
}
