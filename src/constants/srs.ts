import type { SrsState } from '../types/progress.js'

/** 词条状态机五态（统一术语）。 */
export const SRS_STATES = [
  '未学',
  '学习中',
  '模糊',
  '已掌握',
  '需强化',
] as const

/** 初始态。 */
export const SRS_INITIAL_STATE: SrsState = '未学'

/**
 * 间隔序列（毫秒）：10 分钟 / 1 天 / 3 天 / 7 天 / 15 天 / 30 天。
 * 数组下标即 `Progress.intervalLevel`。
 */
export const SRS_INTERVALS_MS = [
  10 * 60 * 1000,
  1 * 24 * 60 * 60 * 1000,
  3 * 24 * 60 * 60 * 1000,
  7 * 24 * 60 * 60 * 1000,
  15 * 24 * 60 * 60 * 1000,
  30 * 24 * 60 * 60 * 1000,
] as const

/** 连续答对达到该次数视为稳固掌握（统计展示用）。 */
export const MASTERED_THRESHOLD = 2

/**
 * 完成度哨兵：表示「不参与计算」。
 * 用于 `hasContent=false` 的冲刺期，避免出现 0/0 = NaN。
 */
export const NO_CONTENT = -1
