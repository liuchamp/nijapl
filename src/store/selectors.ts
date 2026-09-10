import { NO_CONTENT } from '../constants/srs.js'
import { repository } from '../data/index.js'
import {
  moduleCompletion,
  overallCompletion,
  stageCompletion,
} from '../engine/progress.js'
import { dueTargetIds } from '../engine/srs.js'
import type { BuildData, Word } from '../types/domain.js'
import type { Progress } from '../types/progress.js'
import type { AppState } from './index.js'

/**
 * 派生查询（架构 §2.6）：全部为**纯函数** `(state, …) => 值`。
 *
 * 页面用法：`useAppStore(s => s.progress)` 拿稳定分片，再把 state 交给这里的函数；
 * 避免在 `useStore` selector 内构造新对象（会引起无谓重渲染）。
 */

/** 该目标是否已掌握（模块 / 阶段完成度常用判定）。 */
function isMastered(progress: Progress | undefined): boolean {
  return progress?.state === '已掌握'
}

/** 今日复习队列：进度到期目标 → 词条（按 id 稳定排序）。 */
export function selectTodayReviewQueue(state: AppState, now: number): Word[] {
  const words: Word[] = []
  for (const targetId of dueTargetIds(state.progress, now)) {
    const word = repository.getWordById(targetId)
    if (word !== undefined) {
      words.push(word)
    }
  }
  return words
}

/** 错词本：`需强化` / `模糊` 且出现过的词条，按 `wrongCount` 降序、id 升序。 */
export function selectWeakWords(state: AppState): Word[] {
  const words: Word[] = []
  for (const word of repository.getAllWords()) {
    const progress = state.progress[word.id]
    if (progress === undefined) {
      continue
    }
    if (!progress.seen) {
      continue
    }
    if (progress.state !== '需强化' && progress.state !== '模糊') {
      continue
    }
    words.push(word)
  }
  return words.sort((a, b) => {
    const diff =
      (state.progress[b.id]?.wrongCount ?? 0) -
      (state.progress[a.id]?.wrongCount ?? 0)
    return diff !== 0 ? diff : a.id.localeCompare(b.id)
  })
}

/** 薄弱 TOP N（首页预警用）。 */
export function selectWeakTop(state: AppState, limit = 5): Word[] {
  return selectWeakWords(state).slice(0, Math.max(limit, 0))
}

/** 阶段完成度；`hasContent=false` 返回 {@link NO_CONTENT} 哨兵。 */
export function selectStageCompletion(
  state: AppState,
  stageId: string,
): number {
  const stage = repository.getStageById(stageId)
  if (stage === undefined) {
    return NO_CONTENT
  }
  return stageCompletion(
    stage,
    repository.getAllModules(),
    repository.getAllWords(),
    state.progress,
  )
}

/** 总完成度（忽略 `NO_CONTENT` 阶段）。 */
export function selectOverallCompletion(state: AppState): number {
  return overallCompletion(
    repository.getStages(),
    repository.getAllModules(),
    repository.getAllWords(),
    state.progress,
  )
}

/** 模块完成度（0..1）。 */
export function selectModuleCompletion(
  state: AppState,
  moduleId: string,
): number {
  return moduleCompletion(repository.getModuleWords(moduleId), state.progress)
}

/** 模块掌握统计：已掌握数 / 总数 / 比例。 */
export interface ModuleProgressSummary {
  learned: number
  total: number
  ratio: number
}

/** 模块掌握统计（J4「模块学完」与阶段解锁判据共用）。 */
export function selectModuleProgress(
  state: AppState,
  moduleId: string,
): ModuleProgressSummary {
  const words = repository.getModuleWords(moduleId)
  let learned = 0
  for (const word of words) {
    if (isMastered(state.progress[word.id])) {
      learned += 1
    }
  }
  const total = words.length
  return { learned, total, ratio: total === 0 ? 0 : learned / total }
}

/** 当前学习模块词序（进入 P2 的渲染序列）。 */
export function selectCurrentModuleWords(state: AppState): Word[] {
  const moduleId = state.runtime.currentModuleId ?? state.session.moduleId
  if (moduleId === '') {
    return []
  }
  return repository.getModuleWords(moduleId)
}

/** 当前词条（越界返回 `undefined`）。 */
export function selectCurrentWord(state: AppState): Word | undefined {
  const words = selectCurrentModuleWords(state)
  const index =
    state.runtime.currentModuleId === null
      ? state.session.lastWordIndex
      : state.runtime.currentIndex
  return words[index]
}

/** 今日统计（首页仪表盘）。 */
export interface TodayStats {
  newCount: number
  reviewCount: number
  streakDays: number
  lastStudyDate: string
  dueCount: number
}

/** 今日统计。 */
export function selectTodayStats(state: AppState, now: number): TodayStats {
  return {
    newCount: state.session.todayNewCount,
    reviewCount: state.session.todayReviewCount,
    streakDays: state.session.streakDays,
    lastStudyDate: state.session.lastStudyDate,
    dueCount: selectTodayReviewQueue(state, now).length,
  }
}

/** 图谱数据源：把仓库查询结果组装为 `BuildData`（引擎图谱构造入参）。 */
export function selectGraphSource(): BuildData {
  return {
    stages: repository.getStages(),
    modules: repository.getAllModules(),
    words: repository.getAllWords(),
    grammars: repository.getAllGrammars(),
    sentences: repository.getAllSentences(),
  }
}
