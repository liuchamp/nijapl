import { describe, expect, it } from 'vitest'

import { SRS_INTERVALS_MS } from '../../constants/srs.js'
import {
  applyPresented,
  applyReviewResult,
  applySelfEval,
  applySkip,
  dueTargetIds,
  initialProgress,
  isDue,
} from '../srs.js'

const NOW = 1_000_000_000

describe('srs · 初始态', () => {
  it('未学、未出现、无历史', () => {
    const p = initialProgress('w-01')
    expect(p.state).toBe('未学')
    expect(p.seen).toBe(false)
    expect(p.wrongCount).toBe(0)
    expect(p.intervalLevel).toBe(0)
    expect(p.history).toHaveLength(0)
  })
})

describe('srs · 五态流转（applySelfEval）', () => {
  it('认识 → 已掌握，seen=true，间隔推进', () => {
    const p = applySelfEval(initialProgress('w-01'), '认识', NOW)
    expect(p.state).toBe('已掌握')
    expect(p.seen).toBe(true)
    expect(p.nextReview - NOW).toBe(SRS_INTERVALS_MS[0])
    expect(p.history.at(-1)).toMatchObject({ result: 'correct', to: '已掌握' })
  })

  it('不认识 → 需强化，wrongCount+1，间隔重置', () => {
    const p = applySelfEval(initialProgress('w-01'), '不认识', NOW)
    expect(p.state).toBe('需强化')
    expect(p.wrongCount).toBe(1)
    expect(p.intervalLevel).toBe(0)
    expect(p.nextReview - NOW).toBe(SRS_INTERVALS_MS[0])
  })

  it('模糊一次 → 模糊（wrongCount<2）', () => {
    const p = applySelfEval(initialProgress('w-01'), '模糊', NOW)
    expect(p.state).toBe('模糊')
    expect(p.wrongCount).toBe(1)
  })

  it('连续模糊 → wrongCount 达阈值转需强化', () => {
    let p = applySelfEval(initialProgress('w-01'), '模糊', NOW)
    p = applySelfEval(p, '模糊', NOW + 1)
    expect(p.state).toBe('需强化')
    expect(p.wrongCount).toBe(2)
  })

  it('纯函数：不修改入参', () => {
    const before = initialProgress('w-01')
    const snapshot = JSON.stringify(before)
    applySelfEval(before, '不认识', NOW)
    expect(JSON.stringify(before)).toBe(snapshot)
  })
})

describe('srs · 间隔序列推进（连续 认识）', () => {
  it('严格按 10min/1d/3d/7d/15d/30d 推进', () => {
    const expected = [...SRS_INTERVALS_MS]
    let p = initialProgress('w-01')
    let now = NOW
    for (const interval of expected) {
      p = applySelfEval(p, '认识', now)
      expect(p.state).toBe('已掌握')
      expect(p.nextReview - now).toBe(interval)
      now = p.nextReview
    }
    // 达到上限后收敛于最大间隔
    const capped = applySelfEval(p, '认识', now)
    expect(capped.nextReview - now).toBe(
      SRS_INTERVALS_MS[SRS_INTERVALS_MS.length - 1],
    )
  })
})

describe('srs · 复习结果（applyReviewResult）', () => {
  it('复习答对 → 已掌握', () => {
    const wrong = applySelfEval(initialProgress('w-01'), '不认识', NOW)
    const p = applyReviewResult(wrong, true, NOW + 1000)
    expect(p.state).toBe('已掌握')
    expect(p.history.at(-1)?.result).toBe('correct')
  })

  it('复习答错 → 模糊/需强化', () => {
    let p = applyReviewResult(initialProgress('w-01'), false, NOW)
    expect(p.state).toBe('模糊')
    p = applyReviewResult(p, false, NOW + 1)
    expect(p.state).toBe('需强化')
    expect(p.wrongCount).toBe(2)
  })
})

describe('srs · 跳过（applySkip）', () => {
  it('学习中 → 未学，且不计分、不写评估历史（Ruling 1）', () => {
    const learning = applySelfEval(initialProgress('w-01'), '不认识', NOW)
    const p = applySkip(learning, NOW + 1)
    expect(p.state).toBe('未学')
    expect(p.wrongCount).toBe(learning.wrongCount)
    expect(p.intervalLevel).toBe(0)
    expect(p.nextReview).toBe(0)
    // 跳过不产生评估记录：history 原样保留（长度不变）
    expect(p.history).toHaveLength(learning.history.length)
    expect(p.history).toBe(learning.history)
  })
})

describe('srs · 到期判定', () => {
  it('isDue：未学不算到期；到期时间之前不算，之后算', () => {
    expect(isDue(initialProgress('w-01'), NOW)).toBe(false)
    const p = applySelfEval(initialProgress('w-01'), '认识', NOW)
    expect(isDue(p, NOW)).toBe(false)
    expect(isDue(p, p.nextReview)).toBe(true)
  })

  it('dueTargetIds：仅返回到期且稳定排序', () => {
    const due = applySelfEval(initialProgress('b'), '认识', 0)
    const future = applySelfEval(initialProgress('a'), '认识', NOW)
    const fresh = initialProgress('c')
    const ids = dueTargetIds({ a: future, b: due, c: fresh }, NOW)
    expect(ids).toEqual(['b'])
  })
})

describe('srs · 展示即转态 applyPresented（F3：让「学习中」可达）', () => {
  it('未学 → 学习中，置 seen=true 并排定首个间隔', () => {
    const p = applyPresented(initialProgress('w-01'), NOW)
    expect(p.state).toBe('学习中')
    expect(p.seen).toBe(true)
    expect(p.intervalLevel).toBe(0)
    expect(p.nextReview).toBe(NOW + SRS_INTERVALS_MS[0])
    expect(p.wrongCount).toBe(0)
  })

  it('学习中再次展示 → 幂等（返回同一对象，字段不变）', () => {
    const learning = applyPresented(initialProgress('w-01'), NOW)
    const again = applyPresented(learning, NOW + 5_000)
    expect(again).toBe(learning)
    expect(again).toEqual(learning)
  })

  it('模糊 / 已掌握 / 需强化 → 不倒退状态、不动 intervalLevel / nextReview', () => {
    const vague = applySelfEval(initialProgress('a'), '模糊', NOW)
    const mastered = applySelfEval(initialProgress('b'), '认识', NOW)
    const weak = applySelfEval(initialProgress('c'), '不认识', NOW)
    expect(vague.state).toBe('模糊')
    expect(mastered.state).toBe('已掌握')
    expect(weak.state).toBe('需强化')
    for (const p of [vague, mastered, weak]) {
      const after = applyPresented(p, NOW + 999)
      expect(after).toBe(p)
      expect(after.state).toBe(p.state)
      expect(after.intervalLevel).toBe(p.intervalLevel)
      expect(after.nextReview).toBe(p.nextReview)
    }
  })

  it('学习中 → 跳过（applySkip）回到未学且不计分（F3 闭环，不写历史）', () => {
    const learning = applyPresented(initialProgress('w-01'), NOW)
    expect(learning.state).toBe('学习中')
    expect(learning.history).toHaveLength(0)
    const skipped = applySkip(learning, NOW + 1)
    expect(skipped.state).toBe('未学')
    expect(skipped.wrongCount).toBe(0)
    // 跳过不计分、不写历史：history 仍为空（未被 skip 污染）
    expect(skipped.history).toHaveLength(0)
  })

  it('展示后不会立刻混入「今日到期」队列', () => {
    const p = applyPresented(initialProgress('w-01'), NOW)
    expect(isDue(p, NOW)).toBe(false)
    expect(isDue(p, p.nextReview)).toBe(true)
  })
})
