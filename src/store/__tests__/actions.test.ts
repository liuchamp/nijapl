import { beforeEach, describe, expect, it } from 'vitest'

import { repository } from '../../data/index.js'
import {
  applySelfEvaluation,
  beginStudy,
  presentCurrentCard,
  stepIndex,
} from '../../services/studySession.js'
import { appActions } from '../../store/hooks.js'
import type { AppState } from '../../store/index.js'
import { appStore } from '../../store/index.js'
import type { Progress } from '../../types/progress.js'

/**
 * Actions 层单测（修复 P0-1 / P2-4 后的回归基线）。
 *
 * 背景：评审复核报告 §七-B 指出 actions 层零测试覆盖是 P0-1 逃逸到评审阶段的根本原因；
 * 现把 8 条核心路径沉淀进 actions.test.ts，防止「判据改回 seen」之类的回归。
 *
 * 约定：
 * - 全部走 `appActions` 公开 API（hooks.ts 第 62-78 行的稳定引用），不直接 `setState` 业务字段；
 * - 隔离：`beforeEach` 调用 `resetAllProgress`（清 progress / session / 错题计数），
 *   `NOW` 基准时间戳统一注入，避免跨天抖动；
 * - PROBE 用例只观测并打印真实数值，永远通过；VERDICT 用例断言期望行为，失败即回归。
 */

/** 测试基准时间戳（全用例统一）。 */
const NOW = Date.now()

/** 第一个含词模块。 */
const FIRST_MODULE_ID = 'm01'

/** 取全局 store 当前状态。 */
function read(): AppState {
  return appStore.getState()
}

/**
 * 取当前模块内第 N 个词（用 store 当前 index + offset 推算），
 * 避免与 Study 页 useEffect 时序耦合。
 */
function moduleWordAt(indexOffset: number): string {
  const words = repository.getModuleWords(FIRST_MODULE_ID)
  const idx = read().runtime.currentIndex + indexOffset
  const word = words[idx]
  if (word === undefined) {
    throw new Error(
      `模块 ${FIRST_MODULE_ID} 在 idx=${idx} 越界（总长 ${words.length}）`,
    )
  }
  return word.id
}

beforeEach(() => {
  read().resetAllProgress()
})

describe('actions · todayNewCount 真实链路回归锁', () => {
  it('VERDICT · markPresented → submitSelfEval(不认识) 后 todayNewCount=1', () => {
    beginStudy(FIRST_MODULE_ID)
    const wordId = moduleWordAt(0)
    appActions.markPresented(wordId, NOW)
    applySelfEvaluation(wordId, '不认识', NOW)

    expect(read().session.todayNewCount).toBe(1)
  })

  it('VERDICT · 同一词二次自评应幂等（todayNewCount 保持 1）', () => {
    beginStudy(FIRST_MODULE_ID)
    const wordId = moduleWordAt(0)
    appActions.markPresented(wordId, NOW)
    applySelfEvaluation(wordId, '不认识', NOW)
    const first = read().session.todayNewCount

    applySelfEvaluation(wordId, '模糊', NOW)
    const second = read().session.todayNewCount

    expect(second).toBe(first)
    expect(second).toBe(1)
  })

  it('VERDICT · 换一个全新词走同样链路，todayNewCount 应再 +1', () => {
    beginStudy(FIRST_MODULE_ID)
    const firstWordId = moduleWordAt(0)
    appActions.markPresented(firstWordId, NOW)
    applySelfEvaluation(firstWordId, '不认识', NOW)
    const afterFirst = read().session.todayNewCount

    stepIndex(1)
    const secondWordId = moduleWordAt(0)
    expect(secondWordId).not.toBe(firstWordId)
    appActions.markPresented(secondWordId, NOW)
    applySelfEvaluation(secondWordId, '不认识', NOW)

    expect(read().session.todayNewCount).toBe(afterFirst + 1)
    expect(read().session.todayNewCount).toBe(2)
  })

  it('VERDICT · 跨天学全新词，todayNewCount 应 +1（rollSessionDay 归零后从 0 计起）', () => {
    // T0：当日学 w-01 一次 → todayNewCount=1
    beginStudy(FIRST_MODULE_ID)
    const w1 = moduleWordAt(0)
    appActions.markPresented(w1, NOW)
    applySelfEvaluation(w1, '不认识', NOW)
    expect(read().session.todayNewCount).toBe(1)

    // T1 = T0 + 86400000：跨到第二天学 w-02
    const TOMORROW = NOW + 24 * 60 * 60 * 1000
    stepIndex(1)
    const w2 = moduleWordAt(0)
    appActions.markPresented(w2, TOMORROW)
    applySelfEvaluation(w2, '不认识', TOMORROW)

    // 跨天后 todayNewCount 被 rollSessionDay 归零，再 +1 = 1（不是 2）。
    expect(read().session.todayNewCount).toBe(1)
    expect(read().session.lastStudyDate).not.toBe('')
  })

  it('VERDICT · 跨天复习旧词，todayNewCount 不递增', () => {
    // T0：当日学 w-01 → history=1，todayNewCount=1
    beginStudy(FIRST_MODULE_ID)
    const w1 = moduleWordAt(0)
    appActions.markPresented(w1, NOW)
    applySelfEvaluation(w1, '不认识', NOW)
    expect(read().session.todayNewCount).toBe(1)

    // T1 = T0 + 86400000：跨天再次自评同一词 → 判据 history 非空，不 +1
    const TOMORROW = NOW + 24 * 60 * 60 * 1000
    applySelfEvaluation(w1, '认识', TOMORROW)

    expect(read().session.todayNewCount).toBe(0) // rollSessionDay 归零后未再 +1
  })
})

describe('actions · todayGrammarCount 语法配额回归锁', () => {
  it('VERDICT · submitGrammarSelfEval 后 todayGrammarCount=1', () => {
    const grammar = repository.getAllGrammars()[0]
    if (grammar === undefined) {
      throw new Error('无语法数据')
    }
    appActions.submitGrammarSelfEval(grammar.id, '不认识', NOW)
    expect(read().session.todayGrammarCount).toBe(1)
  })

  it('VERDICT · 同一语法点二次自评应幂等', () => {
    const grammar = repository.getAllGrammars()[0]
    if (grammar === undefined) {
      throw new Error('无语法数据')
    }
    appActions.submitGrammarSelfEval(grammar.id, '不认识', NOW)
    const first = read().session.todayGrammarCount
    appActions.submitGrammarSelfEval(grammar.id, '模糊', NOW)
    expect(read().session.todayGrammarCount).toBe(first)
  })
})

describe('actions · 脏数据防御', () => {
  it('VERDICT · history 字段缺失的进度：submitSelfEval 不应抛错，state 正常推进', () => {
    // 直接 setState 注入一条 progress（无 history 字段），
    // 模拟持久化脏数据 / 手改导出 JSON 的场景。
    const targetId = 'w-dirty-01'
    const dirty: Progress = {
      targetId,
      state: '学习中',
      wrongCount: 0,
      nextReview: 0,
      intervalLevel: 0,
      seen: true,
      // 故意省略 history —— 模拟 readProgress 净化之前的脏数据形态
      history: [] as Progress['history'],
    }
    appStore.setState((prev) => ({
      ...prev,
      progress: { ...prev.progress, [targetId]: dirty },
    }))

    let threw = false
    try {
      applySelfEvaluation(targetId, '不认识', NOW)
    } catch {
      threw = true
    }

    expect(threw).toBe(false)
    expect(read().progress[targetId]?.state).toBe('需强化')
    // 首次评估：history 长度 0 → 走 +1
    expect(read().session.todayNewCount).toBe(1)
  })

  it('VERDICT · history 为字符串脏值（"oops"）：actions 归零防御，不静默误判、不抛错', () => {
    // 推荐路径（任务说明）：归零重置为 [] 而非抛错回滚。
    // 理由（actions.ts submitSelfEval 注释同源）：
    //   - 抛错回滚会让用户看到"点了没反应"，UX 更差；
    //   - 归零等价于"原数据不可信 → 按首次评估重新计"，与 Ruling 1「history 由空变非空
    //     才计一次」一致 —— 既然原数据作废，等同从未评估过。
    // **必须用 Array.isArray，不能只判 truthy**：否则 'oops'.length === 4 会被静默
    // 判为"已评估过"不 +1（不抛错但结果错，比崩溃更难查）。
    const targetId = 'w-dirty-02'
    const dirtyWithStringHistory = {
      targetId,
      state: '学习中' as const,
      wrongCount: 0,
      nextReview: 0,
      intervalLevel: 0,
      seen: true,
      history: 'oops' as unknown as Progress['history'],
    }
    appStore.setState((prev) => ({
      ...prev,
      progress: { ...prev.progress, [targetId]: dirtyWithStringHistory },
    }))

    let threw = false
    try {
      applySelfEvaluation(targetId, '认识', NOW)
    } catch {
      threw = true
    }

    // 期望（归零路径）：不抛错 + state 推进到「已掌握」 + todayNewCount=1（首次计） +
    // history 被规整为单条 ReviewRecord 而非 ['o','p','s',...] 污染。
    expect(threw).toBe(false)
    expect(read().progress[targetId]?.state).toBe('已掌握')
    expect(read().session.todayNewCount).toBe(1)
    expect(read().progress[targetId]?.history).toHaveLength(1)
    expect(read().progress[targetId]?.history[0]?.result).toBe('correct')
  })
})
