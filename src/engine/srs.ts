import { WRONG_THRESHOLD } from '../constants/jumpRules.js'
import { SRS_INTERVALS_MS } from '../constants/srs.js'
import type {
  Progress,
  ReviewRecord,
  ReviewResult,
  SelfEval,
  SrsState,
} from '../types/progress.js'

/** 间隔序列最大下标。 */
const MAX_INTERVAL_LEVEL = SRS_INTERVALS_MS.length - 1

/** 取某 level 对应的间隔毫秒（越界收敛）。 */
function intervalAt(level: number): number {
  const clamped = Math.min(Math.max(level, 0), MAX_INTERVAL_LEVEL)
  return SRS_INTERVALS_MS[clamped]
}

/** 追加一条复习记录（返回新数组，不修改入参）。 */
function pushRecord(
  history: ReviewRecord[],
  at: number,
  result: ReviewResult,
  from: SrsState,
  to: SrsState,
): ReviewRecord[] {
  return [...history, { at, result, from, to }]
}

/** 初始进度：未学。 */
export function initialProgress(targetId: string): Progress {
  return {
    targetId,
    state: '未学',
    wrongCount: 0,
    nextReview: 0,
    intervalLevel: 0,
    seen: false,
    history: [],
  }
}

/**
 * 自评后推进状态机（纯函数）。
 *
 * - 认识 → 已掌握，间隔推进到下一档；
 * - 不认识 → 需强化，`wrongCount+1`，间隔重置；
 * - 模糊 → 累计 `wrongCount`，达到 {@link WRONG_THRESHOLD} 转需强化，否则模糊。
 */
export function applySelfEval(
  p: Progress,
  evalr: SelfEval,
  now: number,
): Progress {
  if (evalr === '认识') {
    const intervalLevel = Math.min(p.intervalLevel + 1, MAX_INTERVAL_LEVEL)
    return {
      ...p,
      state: '已掌握',
      seen: true,
      intervalLevel,
      nextReview: now + intervalAt(p.intervalLevel),
      history: pushRecord(p.history, now, 'correct', p.state, '已掌握'),
    }
  }

  const wrongCount = p.wrongCount + 1
  const state: SrsState =
    evalr === '不认识' || wrongCount >= WRONG_THRESHOLD ? '需强化' : '模糊'
  return {
    ...p,
    state,
    seen: true,
    wrongCount,
    intervalLevel: 0,
    nextReview: now + intervalAt(0),
    history: pushRecord(p.history, now, 'wrong', p.state, state),
  }
}

/**
 * 复习结果推进状态机（纯函数）。
 *
 * - 正确 → 已掌握，间隔推进到下一档；
 * - 错误 → `wrongCount+1`，达阈值转需强化，否则模糊。
 */
export function applyReviewResult(
  p: Progress,
  correct: boolean,
  now: number,
): Progress {
  if (correct) {
    const intervalLevel = Math.min(p.intervalLevel + 1, MAX_INTERVAL_LEVEL)
    return {
      ...p,
      state: '已掌握',
      seen: true,
      intervalLevel,
      nextReview: now + intervalAt(p.intervalLevel),
      history: pushRecord(p.history, now, 'correct', p.state, '已掌握'),
    }
  }

  const wrongCount = p.wrongCount + 1
  const state: SrsState = wrongCount >= WRONG_THRESHOLD ? '需强化' : '模糊'
  return {
    ...p,
    state,
    seen: true,
    wrongCount,
    intervalLevel: 0,
    nextReview: now + intervalAt(0),
    history: pushRecord(p.history, now, 'wrong', p.state, state),
  }
}

/**
 * 跳过：`学习中 → 未学`，不计分（`wrongCount` 不变、间隔归零），仅记录 skip。
 */
export function applySkip(p: Progress, now: number): Progress {
  return {
    ...p,
    state: '未学',
    intervalLevel: 0,
    nextReview: 0,
    history: pushRecord(p.history, now, 'skip', p.state, '未学'),
  }
}

/** 是否到期（需要复习）。 */
export function isDue(p: Progress, now: number): boolean {
  return p.seen && p.state !== '未学' && p.nextReview <= now
}

/** 返回所有到期目标的 id（稳定排序）。 */
export function dueTargetIds(
  progressMap: Record<string, Progress>,
  now: number,
): string[] {
  const ids: string[] = []
  for (const id of Object.keys(progressMap)) {
    const p = progressMap[id]
    if (p !== undefined && isDue(p, now)) {
      ids.push(id)
    }
  }
  return ids.sort()
}
