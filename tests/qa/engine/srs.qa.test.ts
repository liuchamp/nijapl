import { describe, expect, it } from 'vitest'

import {
  NO_CONTENT,
  SRS_INTERVALS_MS,
  SRS_STATES,
} from '../../../src/constants/srs.js'
import {
  applyReviewResult,
  applySelfEval,
  applySkip,
  dueTargetIds,
  initialProgress,
  isDue,
} from '../../../src/engine/srs.js'
import type { Progress } from '../../../src/types/progress.js'

/** QA 独立验证 —— T02 `srs.ts`（纯函数五态状态机 + 间隔序列）。 */
const NOW = 1_700_000_000_000
const MIN = 60 * 1000
const DAY = 24 * 60 * 60 * 1000

describe('QA · srs 常量契约', () => {
  it('五态常量集合与 PRD §5.5 一致', () => {
    expect([...SRS_STATES].sort()).toEqual(
      [...['未学', '学习中', '模糊', '已掌握', '需强化']].sort(),
    )
  })

  it('间隔序列严格为 10min/1d/3d/7d/15d/30d', () => {
    expect(SRS_INTERVALS_MS).toEqual([
      10 * MIN,
      1 * DAY,
      3 * DAY,
      7 * DAY,
      15 * DAY,
      30 * DAY,
    ])
  })

  it('NO_CONTENT 哨兵为负值（不与 0..1 完成度混淆）', () => {
    expect(NO_CONTENT).toBeLessThan(0)
  })
})

describe('QA · srs 初始态与不变式', () => {
  it('initialProgress：未学 / 未见 / 零计数 / 空历史', () => {
    const p = initialProgress('w-01')
    expect(p).toMatchObject({
      targetId: 'w-01',
      state: '未学',
      wrongCount: 0,
      nextReview: 0,
      intervalLevel: 0,
      seen: false,
    })
    expect(p.history).toEqual([])
  })
})

describe('QA · srs 五态流转（逐条对照 PRD §5.5）', () => {
  it('认识 → 已掌握，seen=true', () => {
    const p = applySelfEval(initialProgress('w'), '认识', NOW)
    expect(p.state).toBe('已掌握')
    expect(p.seen).toBe(true)
  })

  it('不认识 → 需强化（wrongCount=1）', () => {
    const p = applySelfEval(initialProgress('w'), '不认识', NOW)
    expect(p.state).toBe('需强化')
    expect(p.wrongCount).toBe(1)
  })

  it('模糊（首次，wrongCount=1）→ 模糊', () => {
    const p = applySelfEval(initialProgress('w'), '模糊', NOW)
    expect(p.state).toBe('模糊')
    expect(p.wrongCount).toBe(1)
  })

  it('模糊累计达阈值（第 2 次）→ 需强化', () => {
    let p = applySelfEval(initialProgress('w'), '模糊', NOW)
    p = applySelfEval(p, '模糊', NOW + 1)
    expect(p.state).toBe('需强化')
    expect(p.wrongCount).toBe(2)
  })

  it('复习答对 → 已掌握', () => {
    const p = applyReviewResult(initialProgress('w'), true, NOW)
    expect(p.state).toBe('已掌握')
  })

  it('复习答错第 1 次 → 模糊，第 2 次 → 需强化', () => {
    let p = applyReviewResult(initialProgress('w'), false, NOW)
    expect(p.state).toBe('模糊')
    p = applyReviewResult(p, false, NOW + 1)
    expect(p.state).toBe('需强化')
    expect(p.wrongCount).toBe(2)
  })

  it('【观察性断言】五态中「学习中」当前无任何引擎路径可达', () => {
    // 从「未学」出发，任何一次作答的结果均落在 {已掌握, 模糊, 需强化}
    const outcomes = new Set<string>()
    for (const evalr of ['不认识', '模糊', '认识'] as const) {
      outcomes.add(applySelfEval(initialProgress('w'), evalr, NOW).state)
    }
    expect(outcomes.has('学习中')).toBe(false)
    expect(outcomes).toEqual(new Set(['需强化', '模糊', '已掌握']))
    // 记录：SRS_STATES 声明了 5 态，但实现仅产生 4 态（未学 + 上述 3 态）。
  })
})

describe('QA · srs 间隔序列推进（含封顶）', () => {
  it('连续 6 次「认识」严格按 10min→1d→3d→7d→15d→30d 推进', () => {
    let p = initialProgress('w')
    let now = NOW
    for (let i = 0; i < SRS_INTERVALS_MS.length; i += 1) {
      p = applySelfEval(p, '认识', now)
      expect(p.nextReview - now, `第 ${i + 1} 次间隔`).toBe(SRS_INTERVALS_MS[i])
      now = p.nextReview
    }
  })

  it('intervalLevel 溢出后封顶于最大档（30d），不越界、不 NaN', () => {
    let p = initialProgress('w')
    let now = NOW
    for (let i = 0; i < 12; i += 1) {
      p = applySelfEval(p, '认识', now)
      now = p.nextReview
    }
    expect(p.intervalLevel).toBe(SRS_INTERVALS_MS.length - 1)
    const next = applySelfEval(p, '认识', now)
    expect(next.nextReview - now).toBe(SRS_INTERVALS_MS[SRS_INTERVALS_MS.length - 1])
    expect(Number.isFinite(next.nextReview)).toBe(true)
  })

  it('答错将 intervalLevel 归零，且下次到期为 10min', () => {
    let p = applySelfEval(initialProgress('w'), '认识', NOW)
    p = applySelfEval(p, '认识', p.nextReview)
    expect(p.intervalLevel).toBe(2)
    const wrong = applySelfEval(p, '不认识', NOW + 999)
    expect(wrong.intervalLevel).toBe(0)
    expect(wrong.nextReview - (NOW + 999)).toBe(SRS_INTERVALS_MS[0])
  })
})

describe('QA · srs 跳过（applySkip）', () => {
  it('「学习中」→「未学」，且不计分（wrongCount/seen 不变）', () => {
    const learning: Progress = {
      ...initialProgress('w'),
      state: '学习中',
      seen: true,
      wrongCount: 3,
      intervalLevel: 2,
      nextReview: NOW + DAY,
    }
    const p = applySkip(learning, NOW)
    expect(p.state).toBe('未学')
    expect(p.wrongCount).toBe(3) // 不计分
    expect(p.intervalLevel).toBe(0)
    expect(p.nextReview).toBe(0)
    expect(p.seen).toBe(true) // 仅状态回退，不抹除「出现过」事实
    expect(p.history.at(-1)).toMatchObject({ result: 'skip', to: '未学' })
  })

  it('纯函数：applySkip / applySelfEval / applyReviewResult 均不修改入参', () => {
    const base = initialProgress('w')
    const snapshot = JSON.stringify(base)
    applySkip(base, NOW)
    applySelfEval(base, '认识', NOW)
    applyReviewResult(base, false, NOW)
    expect(JSON.stringify(base)).toBe(snapshot)
  })
})

describe('QA · srs 到期判定', () => {
  it('未学永不到期；nextReview 边界（<不due，=due，>due）', () => {
    expect(isDue(initialProgress('w'), NOW)).toBe(false)
    const p = applySelfEval(initialProgress('w'), '认识', NOW)
    expect(isDue(p, p.nextReview - 1)).toBe(false)
    expect(isDue(p, p.nextReview)).toBe(true)
    expect(isDue(p, p.nextReview + 1)).toBe(true)
  })

  it('跳过回到「未学」后不再到期（seen=true 但 state=未学）', () => {
    const p = applySkip(
      { ...initialProgress('w'), state: '学习中', seen: true },
      NOW,
    )
    expect(isDue(p, NOW + DAY * 99)).toBe(false)
  })

  it('dueTargetIds：仅返回到期项，按 id 稳定排序', () => {
    const map: Record<string, Progress> = {
      z: applySelfEval(initialProgress('z'), '认识', 0), // 到期
      a: applySelfEval(initialProgress('a'), '认识', NOW), // 未到期
      m: initialProgress('m'), // 未学
      b: applySelfEval(initialProgress('b'), '不认识', 0), // 到期
    }
    expect(dueTargetIds(map, NOW)).toEqual(['b', 'z'])
  })

  it('空 map → 空数组（无 NaN 风险）', () => {
    expect(dueTargetIds({}, NOW)).toEqual([])
  })
})
