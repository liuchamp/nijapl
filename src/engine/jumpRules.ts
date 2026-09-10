import {
  MODULE_COMPLETE_RATIO,
  WRONG_THRESHOLD,
} from '../constants/jumpRules.js'
import { isVerb } from '../constants/pos.js'
import type { JumpContext, JumpDecision } from '../types/progress.js'

/** 触发场景：自评后（selfEval） / 页面渲染场景（scene）。 */
export type JumpTrigger = 'selfEval' | 'scene'

/** J1：首次遇词且自评「不认识」→ 自动展开详解。 */
function evaluateJ1(
  ctx: JumpContext,
  trigger: JumpTrigger,
): JumpDecision | null {
  if (trigger !== 'selfEval') {
    return null
  }
  if (ctx.wordProgress.seen) {
    return null
  }
  if (ctx.selfEval !== undefined && ctx.selfEval !== '不认识') {
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
