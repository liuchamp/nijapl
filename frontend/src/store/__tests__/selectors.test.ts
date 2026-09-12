import { describe, expect, it } from 'vitest'

import { repository } from '../../data/index.js'
import { initialProgress } from '../../engine/srs.js'
import type { Progress, SrsState } from '../../types/progress.js'
import type { AppState } from '../index.js'
import {
  aggregateNodeState,
  selectContinueTarget,
  selectModuleComplete,
  selectNextIncompleteModule,
  selectStageComplete,
  selectStageUnlocked,
} from '../selectors.js'

/** 构造仅含所需字段的测试用 AppState。 */
function makeState(overrides: {
  unlockRuleEnabled?: boolean
  progress?: Record<string, Progress>
  sessionModuleId?: string
  lastWordIndex?: number
}): AppState {
  return {
    settings: { unlockRuleEnabled: overrides.unlockRuleEnabled ?? true },
    progress: overrides.progress ?? {},
    session: {
      stageId: '',
      moduleId: overrides.sessionModuleId ?? '',
      lastWordIndex: overrides.lastWordIndex ?? 0,
      lastStudyDate: '',
      todayNewCount: 0,
      todayReviewCount: 0,
      streakDays: 0,
    },
  } as unknown as AppState
}

/** 把某阶段全部词条置为指定态。 */
function progressForStage(
  stageId: string,
  state: SrsState,
): Record<string, Progress> {
  const result: Record<string, Progress> = {}
  for (const word of repository.getWordsByStage(stageId)) {
    result[word.id] = { ...initialProgress(word.id), state, seen: true }
  }
  return result
}

describe('selectors · aggregateNodeState 节点态聚合', () => {
  it('空 → 未学', () => {
    expect(aggregateNodeState([])).toBe('未学')
  })

  it('任意需强化 → 需强化（最高优先）', () => {
    expect(aggregateNodeState(['已掌握', '需强化', '未学'])).toBe('需强化')
  })

  it('全部已掌握 → 已掌握', () => {
    expect(aggregateNodeState(['已掌握', '已掌握'])).toBe('已掌握')
  })

  it('部分出现（含已掌握但未全掌握）→ 学习中', () => {
    expect(aggregateNodeState(['已掌握', '未学'])).toBe('学习中')
    expect(aggregateNodeState(['模糊', '未学'])).toBe('学习中')
  })

  it('全部未学 → 未学', () => {
    expect(aggregateNodeState(['未学', '未学'])).toBe('未学')
  })
})

describe('selectors · selectStageUnlocked 解锁规则', () => {
  it('首个含词阶段 → 恒解锁', () => {
    const state = makeState({})
    expect(selectStageUnlocked(state, 's1')).toBe(true)
  })

  it('解锁规则开启且上一含词阶段未达标 → 锁定', () => {
    const state = makeState({ unlockRuleEnabled: true })
    expect(selectStageUnlocked(state, 's2')).toBe(false)
  })

  it('解锁规则开启且上一含词阶段达标 → 解锁', () => {
    const state = makeState({
      unlockRuleEnabled: true,
      progress: progressForStage('s1', '已掌握'),
    })
    expect(selectStageUnlocked(state, 's2')).toBe(true)
  })

  it('解锁规则关闭 → 全部解锁', () => {
    const state = makeState({ unlockRuleEnabled: false })
    expect(selectStageUnlocked(state, 's2')).toBe(true)
    expect(selectStageUnlocked(state, 's3')).toBe(true)
  })

  it('冲刺期（无内容）参与「上一含词阶段」判定时被跳过', () => {
    // s4 的上一含词阶段是 s3；s3 未达标 → s4 锁定。
    const state = makeState({ unlockRuleEnabled: true })
    expect(selectStageUnlocked(state, 's4')).toBe(false)
  })
})

describe('selectors · selectModuleComplete 模块完成', () => {
  it('空进度 → false', () => {
    const state = makeState({})
    expect(selectModuleComplete(state, 'm01')).toBe(false)
  })

  it('全部词条已掌握 → true', () => {
    const words = repository.getModuleWords('m01')
    const progress: Record<string, Progress> = {}
    for (const word of words) {
      progress[word.id] = {
        ...initialProgress(word.id),
        state: '已掌握',
        seen: true,
        history: [{ at: 0, result: 'correct', from: '学习中', to: '已掌握' }],
      }
    }
    const state = makeState({ progress })
    expect(selectModuleComplete(state, 'm01')).toBe(true)
  })
})

describe('selectors · selectStageComplete 阶段完成', () => {
  it('空进度的内容阶段 → false', () => {
    const state = makeState({})
    expect(selectStageComplete(state, 's1')).toBe(false)
  })

  it('内容阶段全部词条已掌握 → true', () => {
    const words = repository.getWordsByStage('s1')
    const progress: Record<string, Progress> = {}
    for (const word of words) {
      progress[word.id] = {
        ...initialProgress(word.id),
        state: '已掌握',
        seen: true,
        history: [{ at: 0, result: 'correct', from: '学习中', to: '已掌握' }],
      }
    }
    const state = makeState({ progress })
    expect(selectStageComplete(state, 's1')).toBe(true)
  })
})

describe('selectors · selectNextIncompleteModule 下一个未完成模块', () => {
  it('空进度无 afterModuleId → 首个内容模块', () => {
    const state = makeState({})
    expect(selectNextIncompleteModule(state)).toBe('m01')
  })

  it('首模块已完成且 afterModuleId=首模块 → 下一个模块', () => {
    const words = repository.getModuleWords('m01')
    const progress: Record<string, Progress> = {}
    for (const word of words) {
      progress[word.id] = {
        ...initialProgress(word.id),
        state: '已掌握',
        seen: true,
        history: [{ at: 0, result: 'correct', from: '学习中', to: '已掌握' }],
      }
    }
    const state = makeState({ progress })
    expect(selectNextIncompleteModule(state, 'm01')).toBe('m02')
  })
})

describe('selectors · selectContinueTarget 断点续学', () => {
  it('无会话 → 首个含词阶段的首个模块、下标 0', () => {
    const state = makeState({ sessionModuleId: '' })
    expect(selectContinueTarget(state)).toEqual({ moduleId: 'm01', index: 0 })
  })

  it('有会话 → 读会话断点', () => {
    const state = makeState({ sessionModuleId: 'm05', lastWordIndex: 3 })
    expect(selectContinueTarget(state)).toEqual({ moduleId: 'm05', index: 3 })
  })

  it('会话模块已完全掌握 → 不返回该模块，跳到下一个未完成模块', () => {
    const words = repository.getModuleWords('m01')
    const progress: Record<string, Progress> = {}
    for (const word of words) {
      progress[word.id] = {
        ...initialProgress(word.id),
        state: '已掌握',
        seen: true,
        history: [{ at: 0, result: 'correct', from: '学习中', to: '已掌握' }],
      }
    }
    const state = makeState({
      sessionModuleId: 'm01',
      lastWordIndex: 2,
      progress,
    })
    const target = selectContinueTarget(state)
    expect(target).not.toBeNull()
    expect(target!.moduleId).not.toBe('m01')
  })
})
