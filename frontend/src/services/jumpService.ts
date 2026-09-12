import type { JumpDecision } from '../types/progress.js'

/**
 * 跳转决策 → 界面效果 的翻译层（架构 §3.3 / §4.1）。
 *
 * `src/engine/jumpRules.ts`（T02 纯引擎）只产出**决策**；本文件把决策数组收敛为一个
 * 不可变的 {@link StudyEffect}，供页面直接消费。这样：
 * - 页面无需 `switch (rule)` 解析决策（避免各页重复实现，架构 §1.3「无重复实现」）；
 * - 引擎与 UI 解耦，便于单测（纯函数 `toStudyEffect`）。
 */

/** 一次评估在界面上产生的全部效果（默认全否）。 */
export interface StudyEffect {
  /** J1：自动展开半屏详解（C2，`auto` 模式）。 */
  autoDetail: boolean
  /** J2：引导展开半屏详解（C2，`prompt` 模式）。 */
  promptDetail: boolean
  /** J3：需要高亮下划线的「未掌握语法点」id 列表。 */
  highlightGrammarIds: string[]
  /** J4：模块学完 → 引导知识脑图（P6）。 */
  promptGraph: boolean
  /** J5：详解页展示动词变形表。 */
  showConjugation: boolean
  /** J6：详解页展示关联词 chips。 */
  showRelated: boolean
}

/** 归一化：任何决策数组都可翻译为效果。 */
export function toStudyEffect(decisions: JumpDecision[]): StudyEffect {
  const effect: StudyEffect = {
    autoDetail: false,
    promptDetail: false,
    highlightGrammarIds: [],
    promptGraph: false,
    showConjugation: false,
    showRelated: false,
  }
  for (const decision of decisions) {
    switch (decision.rule) {
      case 'J1':
        effect.autoDetail = true
        break
      case 'J2':
        effect.promptDetail = true
        break
      case 'J3':
        effect.highlightGrammarIds = [...decision.grammarIds]
        break
      case 'J4':
        effect.promptGraph = true
        break
      case 'J5':
        effect.showConjugation = true
        break
      case 'J6':
        effect.showRelated = true
        break
      case 'none':
        break
      default:
        // 判别联合已穷尽；此处仅为防御未来新增规则。
        break
    }
  }
  return effect
}

/** 空效果（无任何跳转命中）。 */
export function emptyStudyEffect(): StudyEffect {
  return toStudyEffect([{ rule: 'none' }])
}

/**
 * 由效果推导半屏详解（C2）应采用的模式。
 * J1（首次遇词「不认识」）优先于 J2（会话累计答错）。
 */
export function detailSheetModeFor(
  effect: StudyEffect,
): 'auto' | 'prompt' | null {
  if (effect.autoDetail) {
    return 'auto'
  }
  if (effect.promptDetail) {
    return 'prompt'
  }
  return null
}
