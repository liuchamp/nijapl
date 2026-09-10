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

/**
 * 阶段解锁阈值：上一**含词**阶段完成度达到该比例才解锁当前阶段
 * （可在设置中用 `unlockRuleEnabled` 关闭）。
 */
export const STAGE_UNLOCK_RATIO = 0.8

/**
 * 每日目标：新学 / 复习词条数 + 语法点数（P0 首页「今日任务」三项进度环分母）。
 *
 * **配额对齐（team-lead Ruling 3 / QA N4）**：新 20 / 复习 35 / 语法 2。
 * 数值为产品默认值，未随设置持久化，便于后续迭代为可配置项。
 */
export const DAILY_NEW_GOAL = 20
export const DAILY_REVIEW_GOAL = 35
export const DAILY_GRAMMAR_GOAL = 2

/**
 * 阶段 / 模块节点展示态：`locked`（未满足解锁条件）+ SRS 五态。
 * 阶段树节点与模块节点共用（架构 §7 T04 完成判据 7）。
 */
export type NodeState = 'locked' | SrsState
