/**
 * 审计取证测试 · 跨天场景（P0-1 / P2-4 的「次日是否恒为 0」指控）
 *
 * 背景：工程师在静态复核中提出一条比 P0-1 更根本的指控（其「问题 A」）：
 * 「无论用 `seen` 还是 `history.length === 0`，判据都是**历史**首次评估；
 *   而 `rollSessionDay` 每天把 `todayNewCount` / `todayGrammarCount` 归零，
 *   `seen` / `history` 又永久为真 → 第二天起计数恒为 0，永不恢复」。
 *
 * 本文件用**注入时间戳**（`DAY = 86400_000`，`T0` = 今天，`T1` = 明天）实测六种跨天组合，
 * 判定上述表述是否成立、成立到什么程度。
 *
 * 约定（与前一份审计一致）：
 * - **不修改 `src/` 下任何源码**；
 * - 数据取自 `repository`（真实 `data/build/*.json`）；
 * - `PROBE` 用例只观测打印（永远通过）；`VERDICT` 用例按产品应有行为断言；
 * - 额外打印 `[AUDIT-PLANA]`：若按「方案 A」把判据换成 `existing.history.length === 0`，
 *   本次调用会 +1 还是 +0 —— 用于判定方案 A 在跨天下是否足够。
 */

import { beforeEach, describe, expect, it } from 'vitest'

import { repository } from '../../src/data/index.js'
import {
  applySelfEvaluation,
  beginStudy,
  goToIndex,
  presentCurrentCard,
} from '../../src/services/studySession.js'
import type { AppState } from '../../src/store/index.js'
import { appStore } from '../../src/store/index.js'
import { selectTodayStats } from '../../src/store/selectors.js'

/** 一天毫秒数。 */
const _DAY = 86_400_000

/**
 * 取「今天 + offset 天」的当地正午时间戳。
 *
 * 用正午而非 `Date.now() + offset * DAY`，可避开跨零点 / 夏令时的边界抖动，
 * 保证 `toDateString` 结果稳定。
 */
function dayAt(offsetDays: number): number {
  const base = new Date()
  return new Date(
    base.getFullYear(),
    base.getMonth(),
    base.getDate() + offsetDays,
    12,
    0,
    0,
    0,
  ).getTime()
}

/** 第一天（今天）。 */
const T0 = dayAt(0)
/** 第二天（明天）。 */
const T1 = dayAt(1)

/** 第一个含词模块。 */
const MODULE_ID = 'm01'

/** 取全局 store 状态。 */
function read(): AppState {
  return appStore.getState()
}

/** 当前卡片词 id（与 Study 页同一 selector）。 */
function currentWordId(): string {
  const state = read()
  const moduleId = state.runtime.currentModuleId ?? state.session.moduleId
  const word = repository.getModuleWords(moduleId)[state.runtime.currentIndex]
  if (word === undefined) {
    throw new Error('当前模块无词条，审计用例无法继续')
  }
  return word.id
}

/**
 * 方案 A 预测：若把判据换成 `existing.history.length === 0`，本次调用会 +1 还是 +0。
 * （`history` 为空 = 从未评估过，即「历史首次评估」）
 */
function planADelta(targetId: string): number {
  const progress = read().progress[targetId]
  const historyLength = progress?.history.length ?? 0
  return historyLength === 0 ? 1 : 0
}

/** 打印一次观测：会话计数 + 目标进度关键字段 + 方案 A 预测增量。 */
function snapshot(label: string, targetIds: string[], now: number): void {
  const state = read()
  const stats = selectTodayStats(state, now)
  const details = targetIds
    .map((id) => {
      const progress = state.progress[id]
      return (
        `${id}={state=${progress?.state ?? '<无记录>'}, ` +
        `seen=${progress?.seen ?? false}, history=${progress?.history.length ?? 0}}`
      )
    })
    .join(' | ')
  console.log(
    `[AUDIT] ${label} :: todayNewCount=${state.session.todayNewCount} ` +
      `stats.newCount=${stats.newCount} ` +
      `todayGrammarCount=${state.session.todayGrammarCount} ` +
      `lastStudyDate=${state.session.lastStudyDate} ` +
      `streakDays=${state.session.streakDays} :: ${details}`,
  )
}

/** 与 `actions.ts` 的 `toDateString` 同构（仅测试内使用）。 */
function toDateString(now: number): string {
  const date = new Date(now)
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/**
 * 打印「方案 A」的预测结果：本次会 +1/+0，以及叠加 `rollSessionDay` 之后的最终值。
 *
 * 由于不能改 `src/`，只能推算：方案 A 与现判据的唯一差别是谓词，
 * 因此 `结果 = roll 后基数 + 谓词增量`。
 */
function logPlanA(
  label: string,
  targetId: string,
  now: number,
  field: 'new' | 'grammar',
): void {
  const state = read()
  const isSameDay = state.session.lastStudyDate === toDateString(now)
  const current =
    field === 'new'
      ? state.session.todayNewCount
      : state.session.todayGrammarCount
  const rolled = isSameDay ? current : 0
  const delta = planADelta(targetId)
  console.log(
    `[AUDIT-PLANA] ${label} :: 方案A 本次 +${delta}，投影结果 = ${rolled + delta}` +
      `（roll 后基数 ${rolled}，${isSameDay ? '同日不归零' : '跨天已归零'}）`,
  )
}

beforeEach(() => {
  read().resetAllProgress()
})

describe('AUDIT 跨天 · 词汇链路 todayNewCount', () => {
  it('PROBE+VERDICT · 用例1 跨天 + 全新词：T0 学词 A，T1 学全新词 C', () => {
    beginStudy(MODULE_ID)
    const wordA = currentWordId()
    presentCurrentCard(T0)
    applySelfEvaluation(wordA, '不认识', T0)
    snapshot('T0 学词A之后', [wordA], T0)

    // 切到模块内第二个词（从未碰过的新词 C）。
    goToIndex(1)
    const wordC = currentWordId()
    expect(wordC).not.toBe(wordA)
    presentCurrentCard(T1)
    logPlanA('T1 自评新词C之前', wordC, T1, 'new')
    applySelfEvaluation(wordC, '不认识', T1)
    snapshot('T1 自评全新词C之后', [wordA, wordC], T1)

    // 期望：跨天后先归零，新词 C 的 seen=false / history=0 → 应能 +1。
    expect(read().session.todayNewCount).toBe(1)
  })

  it('PROBE+VERDICT · 用例1b 隔离 P0-1：T1 对全新词 C 直接自评（不经展示转态）', () => {
    // 用例 1 走的是 Study 页真实链路（先 markPresented），P0-1 的 seen 污染会遮蔽跨天效应。
    // 本用例**跳过 markPresented**，只测「跨天本身是否阻断 +1」。
    beginStudy(MODULE_ID)
    const wordA = currentWordId()
    presentCurrentCard(T0)
    applySelfEvaluation(wordA, '不认识', T0)

    goToIndex(1)
    const wordC = currentWordId()
    logPlanA('T1 直接自评全新词C（不经展示）之前', wordC, T1, 'new')
    applySelfEvaluation(wordC, '不认识', T1)
    snapshot('T1 直接自评全新词C之后', [wordA, wordC], T1)

    // 期望：跨天归零后，全新词（seen=false / history=0）仍能 +1 → 1。
    // 若此处为 1，则「第二天起 todayNewCount 恒为 0」不成立。
    expect(read().session.todayNewCount).toBe(1)
  })

  it('PROBE+VERDICT · 用例2 跨天 + 复习旧词：T1 再自评第一天已学过的词 A', () => {
    beginStudy(MODULE_ID)
    const wordA = currentWordId()
    presentCurrentCard(T0)
    applySelfEvaluation(wordA, '不认识', T0)

    goToIndex(1)
    const wordC = currentWordId()
    presentCurrentCard(T1)
    applySelfEvaluation(wordC, '不认识', T1)
    const afterNew = read().session.todayNewCount
    snapshot('T1 新词C之后（基准）', [wordA, wordC], T1)

    // 第二天再自评第一天已学过的 A：同级日不应再 +1。
    logPlanA('T1 二次自评旧词A之前', wordA, T1, 'new')
    applySelfEvaluation(wordA, '模糊', T1)
    snapshot('T1 再自评旧词A之后', [wordA, wordC], T1)

    // 期望：旧词已 seen/history 非空 → 不递增，保持 afterNew。
    expect(read().session.todayNewCount).toBe(afterNew)
  })

  it('PROBE+VERDICT · 用例2b 非零基准下复习旧词：T1 新词 C 已计 1 后，再自评旧词 A 不应递增', () => {
    // 用例 2 的基准是 0（真链下新词也没计上），断言 0===0 属平凡通过；
    // 本用例用「不经展示」把基准抬到 1，再验证旧词不会把它推到 2。
    beginStudy(MODULE_ID)
    const wordA = currentWordId()
    presentCurrentCard(T0)
    applySelfEvaluation(wordA, '不认识', T0)

    goToIndex(1)
    const wordC = currentWordId()
    applySelfEvaluation(wordC, '不认识', T1) // 不经展示 → 计 1
    snapshot('T1 新词C之后（基准应为1）', [wordA, wordC], T1)
    expect(read().session.todayNewCount).toBe(1)

    logPlanA('T1 再自评旧词A之前', wordA, T1, 'new')
    applySelfEvaluation(wordA, '模糊', T1)
    snapshot('T1 再自评旧词A之后', [wordA, wordC], T1)

    // 期望：旧词已评估过 → 保持 1，不递增到 2。
    expect(read().session.todayNewCount).toBe(1)
  })

  it('PROBE+VERDICT · 用例3 归零验证：rollSessionDay 跨天是否真的清零 todayNewCount', () => {
    // 先让 todayNewCount 变成非 0（不经展示转态，直接自评新词）。
    beginStudy(MODULE_ID)
    const wordA = currentWordId()
    applySelfEvaluation(wordA, '不认识', T0)
    snapshot('T0 自评之后（应为非0）', [wordA], T0)
    expect(read().session.todayNewCount).toBe(1)

    // 用 T1 触发一次纯跨天写操作（不含任何计数逻辑，只有 rollSessionDay）。
    read().markStudyDay(T1)
    snapshot('T1 markStudyDay 之后', [wordA], T1)

    // 期望：跨天把今日配额清零。
    expect(read().session.todayNewCount).toBe(0)
  })
})

describe('AUDIT 跨天 · 语法链路 todayGrammarCount', () => {
  it('PROBE+VERDICT · 用例4 跨天 + 新语法点：T0 自评 G1，T1 自评全新 G2', () => {
    const [g1, g2] = repository.getAllGrammars()
    expect(g1).toBeDefined()
    expect(g2).toBeDefined()
    if (g1 === undefined || g2 === undefined) {
      return
    }
    read().submitGrammarSelfEval(g1.id, '不认识', T0)
    snapshot('T0 自评G1之后', [], T0)

    logPlanA('T1 自评全新G2之前', g2.id, T1, 'grammar')
    read().submitGrammarSelfEval(g2.id, '不认识', T1)
    snapshot('T1 自评全新G2之后', [g1.id, g2.id], T1)

    // 期望：跨天归零后，全新语法点仍能 +1 → 1。
    expect(read().session.todayGrammarCount).toBe(1)
  })

  it('PROBE+VERDICT · 用例5 跨天 + 同一语法点：T1 再次自评第一天已评过的 G1', () => {
    const [g1] = repository.getAllGrammars()
    if (g1 === undefined) {
      throw new Error('无语法数据')
    }
    read().submitGrammarSelfEval(g1.id, '不认识', T0)
    snapshot('T0 自评G1之后', [g1.id], T0)

    logPlanA('T1 再次自评G1之前', g1.id, T1, 'grammar')
    read().submitGrammarSelfEval(g1.id, '认识', T1)
    snapshot('T1 再次自评G1之后', [g1.id], T1)

    // 期望：G1 已 seen/history 非空 → 跨天也不再 +1，且跨天已归零 → 0。
    expect(read().session.todayGrammarCount).toBe(0)
  })

  it('PROBE+VERDICT · 用例6 语法点耗尽边界：T1 依次自评全新的 G3 / G4', () => {
    const grammars = repository.getAllGrammars()
    const g1 = grammars[0]
    const g3 = grammars[2]
    const g4 = grammars[3]
    if (g1 === undefined || g3 === undefined || g4 === undefined) {
      throw new Error('语法数据不足（至少需要 4 条）')
    }
    read().submitGrammarSelfEval(g1.id, '不认识', T0)
    snapshot('T0 自评G1之后', [g1.id], T0)

    logPlanA('T1 自评全新G3之前', g3.id, T1, 'grammar')
    read().submitGrammarSelfEval(g3.id, '不认识', T1)
    snapshot('T1 自评全新G3之后', [g1.id, g3.id], T1)
    expect(read().session.todayGrammarCount).toBe(1)

    logPlanA('T1 自评全新G4之前', g4.id, T1, 'grammar')
    read().submitGrammarSelfEval(g4.id, '不认识', T1)
    snapshot('T1 自评全新G4之后', [g1.id, g3.id, g4.id], T1)

    // 期望：全新语法点可继续累加 → 2（= DAILY_GRAMMAR_GOAL）。
    expect(read().session.todayGrammarCount).toBe(2)
  })
})

describe('AUDIT 跨天 · 补充：昨日已展示但未评估的词（seen 与 history 的分叉点）', () => {
  it('PROBE+VERDICT · T0 只展示不自评，T1 才自评：当前判据(seen) vs 方案A(history)', () => {
    beginStudy(MODULE_ID)
    const wordA = currentWordId()
    presentCurrentCard(T0) // 仅展示：seen=true，history 仍为空
    snapshot('T0 仅展示之后', [wordA], T0)

    logPlanA('T1 自评「昨日已展示未评估」的A之前', wordA, T1, 'new')
    applySelfEvaluation(wordA, '不认识', T1)
    snapshot('T1 自评之后', [wordA], T1)

    // 产品口径「今日新学 = 今天第一次被评估」→ 该词今天首次评估，应为 1。
    // 当前判据用 seen（昨日展示已污染）→ 实测为 0；方案 A（history 为空）→ 1。
    expect(read().session.todayNewCount).toBe(1)
  })
})
