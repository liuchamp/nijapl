import type { Grammar, Word } from './domain.js'

/** 词条状态机五态（统一术语）。 */
export type SrsState = '未学' | '学习中' | '模糊' | '已掌握' | '需强化'

/** 三档自评。 */
export type SelfEval = '不认识' | '模糊' | '认识'

/** 复习结果。 */
export type ReviewResult = 'correct' | 'wrong' | 'skip'

/** 单次复习记录。 */
export interface ReviewRecord {
  at: number
  result: ReviewResult
  from: SrsState
  to: SrsState
}

/** 词条 / 语法点的进度。`wrongCount` 为跨会话累计。 */
export interface Progress {
  targetId: string
  state: SrsState
  wrongCount: number
  nextReview: number
  intervalLevel: number
  seen: boolean
  history: ReviewRecord[]
}

/** 断点续学 / 打卡 / 配额快照。 */
export interface Session {
  stageId: string
  moduleId: string
  lastWordIndex: number
  lastStudyDate: string
  todayNewCount: number
  todayReviewCount: number
  streakDays: number
}

/** 学习设置。 */
export interface StudySettings {
  rate: number
  pitch: number
  autoSpeakOnCard: boolean
  unlockRuleEnabled: boolean
}

/**
 * 跳转规则评估上下文。
 * `selfEval` / `grammarIds` 为对架构 §3.3 的向后兼容扩展（可选）：
 * - `selfEval` 必须**显式**为「不认识」才可能触发 J1（缺省 / 其它档位一律不触发，F4）；
 * - `grammarIds` 供 J3 判定当前句涉及的语法点。
 */
export interface JumpContext {
  word: Word
  grammarById: (id: string) => Grammar | undefined
  wordProgress: Progress
  grammarLearned: Record<string, boolean>
  sessionWrongCount: number
  moduleLearned: number
  moduleTotal: number
  selfEval?: SelfEval
  grammarIds?: string[]
}

/** 跳转决策（判别联合）。 */
export type JumpDecision =
  | { rule: 'J1'; kind: 'autoDetailed'; target: 'P3' }
  | { rule: 'J2'; kind: 'promptDetailed'; target: 'P3' }
  | { rule: 'J3'; kind: 'highlightGrammar'; grammarIds: string[]; target: 'P5' }
  | { rule: 'J4'; kind: 'promptGraph'; target: 'P6' }
  | { rule: 'J5'; kind: 'showConjugation'; target: 'P3' }
  | { rule: 'J6'; kind: 'showRelated'; target: 'P3' }
  | { rule: 'none' }
