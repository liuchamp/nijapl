/** 跳转规则 ID（J1–J6），唯一来源。 */
export const JUMP_RULE_IDS = ['J1', 'J2', 'J3', 'J4', 'J5', 'J6'] as const

export type JumpRuleId = (typeof JUMP_RULE_IDS)[number]

/** J2：会话内累计答错达到该阈值触发详解引导。 */
export const WRONG_THRESHOLD = 2

/** J4：模块学完判定阈值（learned / total）。 */
export const MODULE_COMPLETE_RATIO = 1
