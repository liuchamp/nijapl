import type { NodeState } from '../constants/srs.js'
import { NO_CONTENT, STAGE_UNLOCK_RATIO } from '../constants/srs.js'
import { repository } from '../data/index.js'
import {
  moduleCompletion,
  overallCompletion,
  stageCompletion,
} from '../engine/progress.js'
import { dueTargetIds } from '../engine/srs.js'
import type { Stage, Word } from '../types/domain.js'
import type { GraphSourceData } from '../types/graph.js'
import type { Progress, SrsState } from '../types/progress.js'
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
  grammarCount: number
  streakDays: number
  lastStudyDate: string
  dueCount: number
}

/** 今日统计。 */
export function selectTodayStats(state: AppState, now: number): TodayStats {
  return {
    newCount: state.session.todayNewCount,
    reviewCount: state.session.todayReviewCount,
    grammarCount: state.session.todayGrammarCount,
    streakDays: state.session.streakDays,
    lastStudyDate: state.session.lastStudyDate,
    dueCount: selectTodayReviewQueue(state, now).length,
  }
}

/** 图谱数据源：把仓库查询结果组装为 `BuildData`（引擎图谱构造入参）。
 *
 * 同时预建 `wordById` / `grammarById` 索引供引擎 O(1) 查找，
 * 避免 `view.ts` 内 `all.find` 在数据规模增长时退化。
 * 引擎本身仍不依赖 `DataRepository`（架构红线：保持零端口依赖）。 */
export function selectGraphSource(): GraphSourceData {
  const words = repository.getAllWords()
  const grammars = repository.getAllGrammars()
  const wordById = new Map<string, (typeof words)[number]>()
  for (const word of words) {
    wordById.set(word.id, word)
  }
  const grammarById = new Map<string, (typeof grammars)[number]>()
  for (const grammar of grammars) {
    grammarById.set(grammar.id, grammar)
  }
  return {
    stages: repository.getStages(),
    modules: repository.getAllModules(),
    words,
    grammars,
    sentences: repository.getAllSentences(),
    wordById,
    grammarById,
  }
}

/**
 * 把多个词条态聚合为一个节点展示态（阶段 / 模块节点用）。
 *
 * 规则：任一「需强化」→ 需强化；全部「已掌握」→ 已掌握；
 * 否则只要出现过（学习中 / 模糊 / 已掌握）→ 学习中；否则未学。
 */
export function aggregateNodeState(states: SrsState[]): NodeState {
  if (states.length === 0) {
    return '未学'
  }
  let allMastered = true
  let anySeen = false
  for (const state of states) {
    if (state === '需强化') {
      return '需强化'
    }
    if (state !== '已掌握') {
      allMastered = false
    }
    if (state === '学习中' || state === '模糊' || state === '已掌握') {
      anySeen = true
    }
  }
  if (allMastered) {
    return '已掌握'
  }
  return anySeen ? '学习中' : '未学'
}

/** 某模块的节点展示态。 */
export function selectModuleNodeState(
  state: AppState,
  moduleId: string,
): NodeState {
  const words = repository.getModuleWords(moduleId)
  return aggregateNodeState(
    words.map((word) => state.progress[word.id]?.state ?? '未学'),
  )
}

/**
 * 某阶段是否已解锁（T04 判据 7）。
 *
 * 解锁规则：**上一含词阶段**完成度 ≥ {@link STAGE_UNLOCK_RATIO}。
 * - `settings.unlockRuleEnabled === false` 时全部解锁（快捷入口可切换）；
 * - 无上一含词阶段（首个阶段）→ 解锁；
 * - 上一含词阶段为冲刺期（完成度 = {@link NO_CONTENT} 哨兵）→ 视为解锁，避免死角。
 */
export function selectStageUnlocked(state: AppState, stageId: string): boolean {
  if (!state.settings.unlockRuleEnabled) {
    return true
  }
  const stages = repository.getStages()
  const stage = stages.find((candidate) => candidate.id === stageId)
  if (stage === undefined) {
    return true
  }
  let previous: Stage | undefined
  for (const candidate of stages) {
    if (candidate.order >= stage.order || !candidate.hasContent) {
      continue
    }
    if (previous === undefined || candidate.order > previous.order) {
      previous = candidate
    }
  }
  if (previous === undefined) {
    return true
  }
  const score = selectStageCompletion(state, previous.id)
  if (score === NO_CONTENT) {
    return true
  }
  return score >= STAGE_UNLOCK_RATIO
}

/** 某阶段的节点展示态：未解锁 → `locked`；否则由所属词条聚合。 */
export function selectStageNodeState(
  state: AppState,
  stageId: string,
): NodeState {
  if (!selectStageUnlocked(state, stageId)) {
    return 'locked'
  }
  const states: SrsState[] = []
  for (const module of repository.getModules(stageId)) {
    for (const word of repository.getModuleWords(module.id)) {
      states.push(state.progress[word.id]?.state ?? '未学')
    }
  }
  return aggregateNodeState(states)
}

/** 进入 P2 的续学目标（首页「继续学习 / 开始学习」）。 */
export interface ContinueTarget {
  moduleId: string
  index: number
}

/**
 * 续学目标：优先恢复会话断点；无会话则取首个含词阶段的首个模块。
 * 无法定位（数据为空）时返回 `null`。
 */
export function selectContinueTarget(state: AppState): ContinueTarget | null {
  const moduleId = state.session.moduleId
  if (moduleId !== '' && repository.getModuleWords(moduleId).length > 0) {
    return { moduleId, index: state.session.lastWordIndex }
  }
  const firstStage = repository.getStages().find((stage) => stage.hasContent)
  if (firstStage === undefined) {
    return null
  }
  const firstModule = repository.getModules(firstStage.id)[0]
  if (firstModule === undefined) {
    return null
  }
  return { moduleId: firstModule.id, index: 0 }
}
