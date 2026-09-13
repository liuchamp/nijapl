import {
  isKanaProgressKey,
  KANA_UNLOCK_RATIO,
  kanaIdFromKey,
  kanaProgressKey,
} from '../constants/kana.js'
import type { NodeState } from '../constants/srs.js'
import { NO_CONTENT, STAGE_UNLOCK_RATIO } from '../constants/srs.js'
import { repository } from '../data/index.js'
import {
  firstUnmasteredIndex,
  isKanaFullyMastered,
  isKanaGroupUnlocked,
  kanaGroupCompletion,
  kanaGroupMasteredRatio,
  overallKanaCompletion,
} from '../engine/kana.js'
import {
  moduleCompletion,
  overallCompletion,
  stageCompletion,
} from '../engine/progress.js'
import { dueTargetIds } from '../engine/srs.js'
import type { Module, Stage, Word } from '../types/domain.js'
import type { GraphSourceData } from '../types/graph.js'
import type { Kana, KanaGroup } from '../types/kana.js'
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

/** 模块是否已学完：存在词条且全部「已掌握」。 */
export function selectModuleComplete(
  state: AppState,
  moduleId: string,
): boolean {
  const summary = selectModuleProgress(state, moduleId)
  return summary.total > 0 && summary.learned >= summary.total
}

/** 阶段是否已完成：完成度 ≥ STAGE_UNLOCK_RATIO（与解锁口径一致；冲刺期不参与）。 */
export function selectStageComplete(state: AppState, stageId: string): boolean {
  const stage = repository.getStageById(stageId)
  if (stage === undefined || !stage.hasContent) {
    return false
  }
  const score = selectStageCompletion(state, stageId)
  return score !== NO_CONTENT && score >= STAGE_UNLOCK_RATIO
}

/** 按「阶段 order 升序 → 阶段内模块顺序」展开的含词阶段模块序列。 */
function orderedContentModules(): Module[] {
  const result: Module[] = []
  for (const stage of repository.getStages()) {
    if (!stage.hasContent) {
      continue
    }
    result.push(...repository.getModules(stage.id))
  }
  return result
}

/**
 * 下一个未完成模块：从 `afterModuleId` 之后按序查找，其后无未完成模块则从序列开头回绕。
 * 全部完成 / 数据为空时返回 `null`。空词条模块跳过。
 */
export function selectNextIncompleteModule(
  state: AppState,
  afterModuleId?: string,
): string | null {
  const modules = orderedContentModules()
  const scan = (from: number): string | null => {
    for (let i = from; i < modules.length; i += 1) {
      const candidate = modules[i]
      if (repository.getModuleWords(candidate.id).length === 0) {
        continue
      }
      if (!selectModuleComplete(state, candidate.id)) {
        return candidate.id
      }
    }
    return null
  }
  const startIndex =
    afterModuleId === undefined
      ? 0
      : modules.findIndex((m) => m.id === afterModuleId) + 1
  return scan(Math.max(startIndex, 0)) ?? scan(0)
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
 * 续学目标：优先恢复会话断点（跳过已完成模块）；无会话则取首个未完成模块。
 * 无法定位（数据为空）时返回 `null`。
 */
export function selectContinueTarget(state: AppState): ContinueTarget | null {
  const moduleId = state.session.moduleId
  if (
    moduleId !== '' &&
    repository.getModuleWords(moduleId).length > 0 &&
    !selectModuleComplete(state, moduleId)
  ) {
    return { moduleId, index: state.session.lastWordIndex }
  }
  const nextModuleId = selectNextIncompleteModule(
    state,
    moduleId === '' ? undefined : moduleId,
  )
  if (nextModuleId === null) {
    return null
  }
  return { moduleId: nextModuleId, index: 0 }
}

// ——————————————————————————————————————
// K 域（五十音）派生查询（设计 §8.2）
//
// 与 W 域 selector 完全并列、互不引用：K 域的进度 key 带 `kana:` 前缀，
// 而 W 域 selector 全部基于 `repository.getAllWords()` / `getAllGrammars()` 遍历，
// 假名天然不在其中 —— **隔离是"免费"的**（设计 §6.1）。
// ——————————————————————————————————————

/** 关掌握统计。 */
export interface KanaGroupProgress {
  mastered: number
  total: number
  /** 已掌握率（解锁与结业判据）。 */
  ratio: number
  /** 完成度（含「学习中 / 模糊」的中间分，用于进度展示）。 */
  completion: number
}

/** 某关掌握统计。 */
export function selectKanaGroupProgress(
  state: AppState,
  groupId: string,
): KanaGroupProgress {
  const group = repository.getKanaGroupById(groupId)
  if (group === undefined) {
    return { mastered: 0, total: 0, ratio: 0, completion: 0 }
  }
  let mastered = 0
  for (const id of group.kanaIds) {
    if (state.progress[kanaProgressKey(id)]?.state === '已掌握') {
      mastered += 1
    }
  }
  const total = group.kanaIds.length
  return {
    mastered,
    total,
    ratio: total === 0 ? 0 : mastered / total,
    completion: kanaGroupCompletion(group, state.progress),
  }
}

/** 某关完成度（0..1）。 */
export function selectKanaGroupCompletion(
  state: AppState,
  groupId: string,
): number {
  const group = repository.getKanaGroupById(groupId)
  return group === undefined ? 0 : kanaGroupCompletion(group, state.progress)
}

/** 某关是否已解锁（门控开关关闭时全解锁）。 */
export function selectKanaUnlocked(state: AppState, groupId: string): boolean {
  const group = repository.getKanaGroupById(groupId)
  if (group === undefined) {
    return true
  }
  return isKanaGroupUnlocked(
    group,
    repository.getKanaGroups(),
    state.progress,
    state.settings.kanaGateEnabled,
  )
}

/** 某关的节点展示态：未解锁 → `locked`；否则由关内假名聚合。 */
export function selectKanaGroupNodeState(
  state: AppState,
  groupId: string,
): NodeState {
  if (!selectKanaUnlocked(state, groupId)) {
    return 'locked'
  }
  const members = repository.getKanaByGroup(groupId)
  return aggregateNodeState(
    members.map(
      (item) => state.progress[kanaProgressKey(item.id)]?.state ?? '未学',
    ),
  )
}

/** 五十音总完成度（12 关均值，0..1）。 */
export function selectKanaOverallCompletion(state: AppState): number {
  return overallKanaCompletion(repository.getKanaGroups(), state.progress)
}

/**
 * 已掌握假名数（K0 的 `n/104`）。
 *
 * 口径与「达标」同一把尺子（`state === '已掌握'`），
 * 因此首页的 `n/104` 与结业徽章不会出现「进度满了但徽章没亮」的矛盾。
 */
export function selectKanaMasteredCount(state: AppState): number {
  let mastered = 0
  for (const item of repository.getAllKana()) {
    if (state.progress[kanaProgressKey(item.id)]?.state === '已掌握') {
      mastered += 1
    }
  }
  return mastered
}

/** K 域续学目标。 */
export interface KanaContinueTarget {
  groupId: string
  index: number
}

/**
 * 续学目标：优先恢复当前关断点（未满则续），否则按 order 找首个**已解锁且未满**的关。
 * 全部已解锁关都满（或无可解锁关）时返回 `null`，页面据此展示「结业测验」。
 */
export function selectKanaContinueTarget(
  state: AppState,
): KanaContinueTarget | null {
  const groups = repository
    .getKanaGroups()
    .filter((group) => selectKanaUnlocked(state, group.id))
  if (groups.length === 0) {
    return null
  }
  const isFull = (group: KanaGroup): boolean =>
    kanaGroupMasteredRatio(group, state.progress) >= 1

  const currentId = state.session.kanaGroupId
  const currentIndex = groups.findIndex((group) => group.id === currentId)
  const current = currentIndex >= 0 ? groups[currentIndex] : undefined

  if (current !== undefined && !isFull(current)) {
    return {
      groupId: current.id,
      index: firstUnmasteredIndex(current, state.progress),
    }
  }

  const scan = (start: number): KanaGroup | null => {
    for (let i = start; i < groups.length; i += 1) {
      if (!isFull(groups[i])) {
        return groups[i]
      }
    }
    return null
  }
  const target = scan(currentIndex >= 0 ? currentIndex + 1 : 0) ?? scan(0)
  if (target === null) {
    return null
  }
  return {
    groupId: target.id,
    index: firstUnmasteredIndex(target, state.progress),
  }
}

/**
 * 「本关学完之后接着学哪一关」：按 `order` 取首个**已解锁且未学满**的关（跳过当前关）。
 *
 * 与 `selectKanaContinueTarget` 的分工：
 * - `selectKanaContinueTarget` 服务于「继续学习」——优先**当前关**的断点；
 * - 本函数服务于 K1 完成面板的「继续下一关」——必须**跳过当前关**，
 *   否则刚学完的关会被再推一次，用户会以为按钮点了没反应。
 *
 * 没有可学的下一关时返回 `null`（页面据此显示「返回五十音」）。
 */
export function selectKanaNextGroup(
  state: AppState,
  fromGroupId: string,
): KanaContinueTarget | null {
  for (const group of repository.getKanaGroups()) {
    if (group.id === fromGroupId) {
      continue
    }
    if (!selectKanaUnlocked(state, group.id)) {
      continue
    }
    if (kanaGroupMasteredRatio(group, state.progress) >= 1) {
      continue
    }
    return {
      groupId: group.id,
      index: firstUnmasteredIndex(group, state.progress),
    }
  }
  return null
}

/** 错音本：`需强化` / `模糊` 且出现过的假名，按 `wrongCount` 降序、id 升序。 */
export function selectKanaWeak(state: AppState): Kana[] {
  const weak: Kana[] = []
  for (const item of repository.getAllKana()) {
    const progress = state.progress[kanaProgressKey(item.id)]
    if (progress === undefined || !progress.seen) {
      continue
    }
    if (progress.state !== '需强化' && progress.state !== '模糊') {
      continue
    }
    weak.push(item)
  }
  return weak.sort((a, b) => {
    const diff =
      (state.progress[kanaProgressKey(b.id)]?.wrongCount ?? 0) -
      (state.progress[kanaProgressKey(a.id)]?.wrongCount ?? 0)
    return diff !== 0 ? diff : a.id.localeCompare(b.id)
  })
}

/**
 * 假名「今日到期」队列。
 *
 * 注意与 `selectTodayReviewQueue`（词条）的关系：后者用
 * `repository.getWordById(targetId)` 反查，`kana:` 前缀的 key 天然返回 `undefined` 被跳过，
 * 因此**两个队列互不污染**，无需在词条 selector 里加任何判断。
 */
export function selectKanaDueQueue(state: AppState, now: number): Kana[] {
  const result: Kana[] = []
  for (const targetId of dueTargetIds(state.progress, now)) {
    if (!isKanaProgressKey(targetId)) {
      continue
    }
    const kanaId = kanaIdFromKey(targetId)
    if (kanaId === null) {
      continue
    }
    const item = repository.getKanaById(kanaId)
    if (item !== undefined) {
      result.push(item)
    }
  }
  return result
}

/** 易混对比对。 */
export interface KanaConfusablePair {
  a: Kana
  b: Kana
  /** 两侧累计答错之和（排序依据）。 */
  wrongCount: number
}

/**
 * 易混对比练习对：取「两侧累计答错之和 ≥ 2」的易混对，按错次降序、id 升序。
 *
 * 只取 `a.id < b.id` 的字典序一侧，保证一对只出现一次（`confusable` 是**对称**表）。
 */
export function selectKanaConfusablePairs(
  state: AppState,
  limit = 6,
): KanaConfusablePair[] {
  const all = repository.getAllKana()
  const byId = new Map(all.map((item) => [item.id, item]))
  const pairs: KanaConfusablePair[] = []
  for (const item of all) {
    for (const otherId of item.confusable) {
      if (item.id >= otherId) {
        continue
      }
      const other = byId.get(otherId)
      if (other === undefined) {
        continue
      }
      const wrongCount =
        (state.progress[kanaProgressKey(item.id)]?.wrongCount ?? 0) +
        (state.progress[kanaProgressKey(other.id)]?.wrongCount ?? 0)
      if (wrongCount < 2) {
        continue
      }
      pairs.push({ a: item, b: other, wrongCount })
    }
  }
  return pairs
    .sort((left, right) => {
      const diff = right.wrongCount - left.wrongCount
      return diff !== 0 ? diff : left.a.id.localeCompare(right.a.id)
    })
    .slice(0, Math.max(limit, 0))
}

/** 五十音是否**全部**已掌握（结业徽章判据）。 */
export function selectIsKanaMastered(state: AppState): boolean {
  return isKanaFullyMastered(repository.getKanaGroups(), state.progress)
}

/** K 域整体节点态（P1 阶段地图的树顶「K · 五十音入门」节点）。 */
export function selectKanaNodeState(state: AppState): NodeState {
  return aggregateNodeState(
    repository
      .getAllKana()
      .map((item) => state.progress[kanaProgressKey(item.id)]?.state ?? '未学'),
  )
}

/** 清音 5 关是否已全部达标（门控解除条件）。 */
export function selectKanaGateSatisfied(state: AppState): boolean {
  const clearGroups = repository
    .getKanaGroups()
    .filter((group) => group.voiceType === '清音')
  if (clearGroups.length === 0) {
    return true
  }
  return clearGroups.every(
    (group) =>
      kanaGroupMasteredRatio(group, state.progress) >= KANA_UNLOCK_RATIO,
  )
}

/**
 * K 域**入门门控**是否生效（P0 主按钮是否指向 K 域）。
 *
 * 生效条件：设置开启（默认开，P9 可关）**且**清音 5 关尚未全部达标。
 * 达标后自动放行，不需要用户手动关开关（否则「学完还拦着」是明显 bug 体感）。
 */
export function selectKanaGateActive(state: AppState): boolean {
  return state.settings.kanaGateEnabled && !selectKanaGateSatisfied(state)
}
