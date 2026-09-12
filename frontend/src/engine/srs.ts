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
 * 卡片「展示即转态」（PRD §5.5）：`未学 → 学习中`，并置 `seen = true`。
 *
 * - 这是「学习中」态的唯一入口；不调用它则五态中的「学习中」不可达，
 *   `applySkip`（学习中 → 未学）也随之失去意义；
 * - 转入时为该词排定**首个间隔**（10 分钟），使其不会立刻混入「今日到期」队列；
 * - 对已是「学习中 / 模糊 / 已掌握 / 需强化」的**保持幂等**：直接返回原对象，
 *   不倒退状态、不改动 `intervalLevel` / `nextReview` / `wrongCount` / `history`。
 */
export function applyPresented(p: Progress, now: number): Progress {
  if (p.state !== '未学') {
    return p
  }
  return {
    ...p,
    state: '学习中',
    seen: true,
    nextReview: now + intervalAt(0),
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
 * 跳过：`学习中 → 未学`，**不计分且不写入评估历史**（PRD §5.5「跳过不计分」）。
 *
 * **语义裁决（team-lead Ruling 1）**：跳过不产生任何**评估**记录，
 * 因此 `history` 原样保留（`history.length` 不变），使「跳过后再展示并自评不认识」
 * 仍属首次遇词（J1 仍触发）。`wrongCount` 不变、间隔归零，仅状态回退。
 */
export function applySkip(p: Progress, _now: number): Progress {
  return {
    ...p,
    state: '未学',
    intervalLevel: 0,
    nextReview: 0,
    history: p.history,
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
