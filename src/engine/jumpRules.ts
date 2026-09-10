import {
  MODULE_COMPLETE_RATIO,
  WRONG_THRESHOLD,
} from '../constants/jumpRules.js'
import { isVerb } from '../constants/pos.js'
import type { JumpContext, JumpDecision, Progress } from '../types/progress.js'

/** 触发场景：自评后（selfEval） / 页面渲染场景（scene）。 */
export type JumpTrigger = 'selfEval' | 'scene'

/**
 * 是否「首次遇词」（J1 门控，PRD §5.5 / §J1）。
 *
 * 语义为「**作答前**从未出现过」：
 * 1. `seen === false` —— 从未作答（最直接）；
 * 2. 或仅由「展示即转态」标记过（`state === '学习中'` 且 `history` 为空）——
 *    卡片刚首次可见、尚未作答（T04 `applyPresented` 会置 `seen=true`，
 *    若 J1 只看 `seen` 则真实链路中 J1 永不可达，与 PRD 链路①冲突）。
 *
 * 一旦发生任意作答（`history` 非空：correct / wrong / skip），即不再是首次遇词。
 */
function isFirstEncounter(p: Progress): boolean {
  if (!p.seen) {
    return true
  }
  return p.state === '学习中' && p.history.length === 0
}

/** J1：首次遇词且自评「不认识」→ 自动展开详解。 */
function evaluateJ1(
  ctx: JumpContext,
  trigger: JumpTrigger,
): JumpDecision | null {
  if (trigger !== 'selfEval') {
    return null
  }
  // 必须**显式**为「不认识」：`selfEval` 缺省（scene 场景 / 旧调用方）不得误判。
  if (ctx.selfEval !== '不认识') {
    return null
  }
  if (!isFirstEncounter(ctx.wordProgress)) {
    return null
  }
  return { rule: 'J1', kind: 'autoDetailed', target: 'P3' }
}

/** J2：会话内累计答错达阈值 → 弹详解引导。 */
function evaluateJ2(
  ctx: JumpContext,
  trigger: JumpTrigger,
): JumpDecision | null {
  if (trigger !== 'selfEval') {
    return null
  }
  if (ctx.sessionWrongCount < WRONG_THRESHOLD) {
    return null
  }
  return { rule: 'J2', kind: 'promptDetailed', target: 'P3' }
}

/** J3：例句含未掌握语法 → 高亮并下划线。 */
function evaluateJ3(
  ctx: JumpContext,
  trigger: JumpTrigger,
): JumpDecision | null {
  if (trigger !== 'scene') {
    return null
  }
  const candidates = ctx.grammarIds ?? []
  const grammarIds = candidates.filter((id) => ctx.grammarLearned[id] !== true)
  if (grammarIds.length === 0) {
    return null
  }
  return { rule: 'J3', kind: 'highlightGrammar', grammarIds, target: 'P5' }
}

/** J4：模块学完 → 弹知识脑图。 */
function evaluateJ4(ctx: JumpContext): JumpDecision | null {
  if (ctx.moduleTotal <= 0) {
    return null
  }
  if (ctx.moduleLearned / ctx.moduleTotal < MODULE_COMPLETE_RATIO) {
    return null
  }
  return { rule: 'J4', kind: 'promptGraph', target: 'P6' }
}

/** J5：词性为动词 → 详解附变形表（基于 POS_VERB 显式枚举）。 */
function evaluateJ5(ctx: JumpContext): JumpDecision | null {
  if (!isVerb(ctx.word.pos)) {
    return null
  }
  return { rule: 'J5', kind: 'showConjugation', target: 'P3' }
}

/** J6：存在关联词 → 详解显示关联 chips。 */
function evaluateJ6(ctx: JumpContext): JumpDecision | null {
  const related = ctx.word.related
  if (related === undefined || related.length === 0) {
    return null
  }
  return { rule: 'J6', kind: 'showRelated', target: 'P3' }
}

/**
 * 评估跳转规则，返回命中的决策数组（按 J1→J6 排序）。
 * 未命中任何规则时返回 `[{ rule: 'none' }]`。
 *
 * - `selfEval` 触发：J1 / J2 / J4 / J5 / J6
 * - `scene` 触发：J3 / J4 / J5 / J6
 */
export function evaluate(
  ctx: JumpContext,
  triggeredBy: JumpTrigger,
): JumpDecision[] {
  const decisions: JumpDecision[] = []
  const candidates: Array<JumpDecision | null> = [
    evaluateJ1(ctx, triggeredBy),
    evaluateJ2(ctx, triggeredBy),
    evaluateJ3(ctx, triggeredBy),
    evaluateJ4(ctx),
    evaluateJ5(ctx),
    evaluateJ6(ctx),
  ]
  for (const decision of candidates) {
    if (decision !== null) {
      decisions.push(decision)
    }
  }
  if (decisions.length === 0) {
    return [{ rule: 'none' }]
  }
  return decisions
}
