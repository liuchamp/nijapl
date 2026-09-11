/**
 * 审计取证测试 · P0-1 / P2-4
 *
 * 目标：用**可执行的真实链路**判定 `docs/reviews/2026-09-11-代码评审报告.md`
 * 的两条指控是否成立，而不是靠读代码推理。
 *
 * - P0-1：`todayNewCount` 在正常链路（markPresented → submitSelfEval）下恒为 0？
 * - P2-4：`submitGrammarSelfEval` 的 `todayGrammarCount` 是否同源失效？
 *
 * 约定：
 * - **不修改 `src/` 下任何源码**，只读取真实 API；
 * - 数据全部取自 `repository`（真实 `data/build/*.json`），不造假数据；
 * - 每个用例前用 `resetAllProgress()` 做隔离（重置 progress / session / 错题计数）；
 * - 分两类用例：
 *   1. `PROBE`：只观测并打印真实数值，**永远通过**，用于取证；
 *   2. `VERDICT`：按「产品应有行为」断言（今日新学应为 1、二次自评幂等），
 *      若失败则说明源码确实有缺陷。
 */

import { beforeEach, describe, expect, it } from 'vitest'

import { repository } from '../../src/data/index.js'
import {
  applySelfEvaluation,
  beginStudy,
  presentCurrentCard,
  stepIndex,
} from '../../src/services/studySession.js'
import type { AppState } from '../../src/store/index.js'
import { appStore } from '../../src/store/index.js'
import { selectTodayStats } from '../../src/store/selectors.js'
import type { Progress } from '../../src/types/progress.js'

/** 测试基准时间戳（全用例统一注入，避免跨天抖动）。 */
const NOW = Date.now()

/** 第一个含词模块的第一个词（真实数据）。 */
const FIRST_MODULE_ID = 'm01'

/** 一次观测快照：会话计数 + 目标进度关键字段。 */
interface Snapshot {
  todayNewCount: number
  todayGrammarCount: number
  statsNewCount: number
  statsGrammarCount: number
  state: string
  seen: boolean
  historyLength: number
}

/** 取全局 store 当前状态。 */
function read(): AppState {
  return appStore.getState()
}

/** 观测「今日统计 + 某目标进度」，打印真实数值。 */
function snapshot(targetId: string, label: string): Snapshot {
  const state = read()
  const progress: Progress | undefined = state.progress[targetId]
  const stats = selectTodayStats(state, NOW)
  const shot: Snapshot = {
    todayNewCount: state.session.todayNewCount,
    todayGrammarCount: state.session.todayGrammarCount,
    statsNewCount: stats.newCount,
    statsGrammarCount: stats.grammarCount,
    state: progress?.state ?? '<无进度记录>',
    seen: progress?.seen ?? false,
    historyLength: progress?.history.length ?? 0,
  }
  console.log(
    `[AUDIT] ${label} :: todayNewCount=${shot.todayNewCount} ` +
      `selectTodayStats().newCount=${shot.statsNewCount} ` +
      `todayGrammarCount=${shot.todayGrammarCount} ` +
      `progress={state=${shot.state}, seen=${shot.seen}, history=${shot.historyLength}}`,
  )
  return shot
}

/** 取当前卡片词（经 store selector，与 Study 页一致）。 */
function currentWordId(): string {
  const word = repository.getModuleWords(
    read().runtime.currentModuleId ?? read().session.moduleId,
  )[read().runtime.currentIndex]
  if (word === undefined) {
    throw new Error('当前模块无词条，审计用例无法继续')
  }
  return word.id
}

beforeEach(() => {
  // 隔离：清空进度 + 重置会话 + 错题计数（与 resetAllProgress 语义一致）。
  read().resetAllProgress()
})

describe('AUDIT P0-1 · 真实用户链路（beginStudy → presentCurrentCard → 自评）', () => {
  it('PROBE · 走完整链路后观测 todayNewCount 的真实取值', () => {
    const words = repository.getModuleWords(FIRST_MODULE_ID)
    expect(words.length).toBeGreaterThan(0)

    beginStudy(FIRST_MODULE_ID)
    const wordId = currentWordId()
    presentCurrentCard(NOW)
    snapshot(wordId, 'markPresented 之后')

    applySelfEvaluation(wordId, '不认识', NOW)
    const after = snapshot(wordId, 'submitSelfEval(不认识) 之后')

    // PROBE 用例不做断言，仅保证链路跑通；真实取值见上方 console.log。
    expect(after.todayNewCount).toBeTypeOf('number')
  })

  it('VERDICT · markPresented → submitSelfEval 后 todayNewCount 应为 1', () => {
    beginStudy(FIRST_MODULE_ID)
    const wordId = currentWordId()
    presentCurrentCard(NOW)
    applySelfEvaluation(wordId, '不认识', NOW)

    expect(read().session.todayNewCount).toBe(1)
  })

  it('VERDICT · 同一词二次自评应幂等（todayNewCount 不再递增）', () => {
    beginStudy(FIRST_MODULE_ID)
    const wordId = currentWordId()
    presentCurrentCard(NOW)
    applySelfEvaluation(wordId, '不认识', NOW)
    const first = read().session.todayNewCount

    applySelfEvaluation(wordId, '模糊', NOW)
    const second = read().session.todayNewCount

    snapshot(wordId, '同一词二次自评之后')
    expect(second).toBe(first)
  })

  it('VERDICT · 换一个新词走同样链路，todayNewCount 应再 +1', () => {
    beginStudy(FIRST_MODULE_ID)
    const firstWordId = currentWordId()
    presentCurrentCard(NOW)
    applySelfEvaluation(firstWordId, '不认识', NOW)
    const afterFirst = read().session.todayNewCount

    stepIndex(1)
    const secondWordId = currentWordId()
    expect(secondWordId).not.toBe(firstWordId)
    presentCurrentCard(NOW)
    applySelfEvaluation(secondWordId, '不认识', NOW)

    const afterSecond = read().session.todayNewCount
    snapshot(secondWordId, '第二个词自评之后')
    expect(afterSecond).toBe(afterFirst + 1)
  })
})

describe('AUDIT P0-1 · 对照链路（跳过 markPresented，直接 submitSelfEval）', () => {
  it('PROBE · 观测不经过展示转态时的 todayNewCount', () => {
    beginStudy(FIRST_MODULE_ID)
    const wordId = currentWordId()
    // 故意不调用 presentCurrentCard（模拟 Quiz 页这类直接自评的入口）。
    applySelfEvaluation(wordId, '不认识', NOW)
    snapshot(wordId, '未 markPresented 直接自评之后')
    expect(read().session.todayNewCount).toBeTypeOf('number')
  })

  it('VERDICT · 不经过 markPresented 直接自评，todayNewCount 应为 1', () => {
    beginStudy(FIRST_MODULE_ID)
    const wordId = currentWordId()
    applySelfEvaluation(wordId, '不认识', NOW)
    expect(read().session.todayNewCount).toBe(1)
  })
})

describe('AUDIT P2-4 · 语法点自评 todayGrammarCount', () => {
  it('PROBE · 语法自评链路（GrammarDetail 页真实路径）观测取值', () => {
    const grammar = repository.getAllGrammars()[0]
    expect(grammar).toBeDefined()
    if (grammar === undefined) {
      return
    }
    // GrammarDetail 页只调用 submitGrammarSelfEval，不先 markPresented。
    read().submitGrammarSelfEval(grammar.id, '不认识', NOW)
    snapshot(grammar.id, 'submitGrammarSelfEval 之后')
    expect(read().session.todayGrammarCount).toBeTypeOf('number')
  })

  it('VERDICT · 语法自评后 todayGrammarCount 应为 1', () => {
    const grammar = repository.getAllGrammars()[0]
    if (grammar === undefined) {
      throw new Error('无语法数据')
    }
    read().submitGrammarSelfEval(grammar.id, '不认识', NOW)
    expect(read().session.todayGrammarCount).toBe(1)
  })

  it('VERDICT · 同一语法点二次自评应幂等', () => {
    const grammar = repository.getAllGrammars()[0]
    if (grammar === undefined) {
      throw new Error('无语法数据')
    }
    read().submitGrammarSelfEval(grammar.id, '不认识', NOW)
    const first = read().session.todayGrammarCount
    read().submitGrammarSelfEval(grammar.id, '模糊', NOW)
    const second = read().session.todayGrammarCount
    snapshot(grammar.id, '同一语法点二次自评之后')
    expect(second).toBe(first)
  })

  it('VERDICT · 若语法点先 markPresented（展示即转态），todayGrammarCount 仍应为 1', () => {
    const grammar = repository.getAllGrammars()[0]
    if (grammar === undefined) {
      throw new Error('无语法数据')
    }
    read().markPresented(grammar.id, NOW)
    read().submitGrammarSelfEval(grammar.id, '不认识', NOW)
    const actual = read().session.todayGrammarCount
    snapshot(grammar.id, 'markPresented → submitGrammarSelfEval 之后')
    expect(actual).toBe(1)
  })
})
