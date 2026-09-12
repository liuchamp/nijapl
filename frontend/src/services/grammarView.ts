import type { Grammar } from '../types/domain.js'

/**
 * P4 语法列表的筛选 / 选项派生（纯函数，架构 §2.9 / T05 判据 1）。
 *
 * 拆出独立模块的原因：页面只做渲染与事件绑定，筛选逻辑保持**纯、可单测**
 * （QA T5-1 的 U 手段）。响应式即时性由 React 状态 + `useMemo` 保证。
 */

/** 语法列表筛选条件：`null` 表示「全部」。 */
export interface GrammarFilter {
  week: number | null
  level: string | null
}

/** 空筛选（全部）。 */
export function emptyGrammarFilter(): GrammarFilter {
  return { week: null, level: null }
}

/** 去重且升序的周次选项。 */
export function grammarWeekOptions(grammars: Grammar[]): number[] {
  const set = new Set<number>()
  for (const grammar of grammars) {
    set.add(grammar.week)
  }
  return [...set].sort((a, b) => a - b)
}

/** 去重且稳定的层级选项（按首次出现顺序，避免排序抖动）。 */
export function grammarLevelOptions(grammars: Grammar[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const grammar of grammars) {
    if (!seen.has(grammar.level)) {
      seen.add(grammar.level)
      result.push(grammar.level)
    }
  }
  return result
}

/**
 * 应用筛选（即时、纯函数、保持入参顺序）。
 * `week` / `level` 为 `null` 时该维度不过滤。
 */
export function filterGrammars(
  grammars: Grammar[],
  filter: GrammarFilter,
): Grammar[] {
  return grammars.filter((grammar) => {
    if (filter.week !== null && grammar.week !== filter.week) {
      return false
    }
    if (filter.level !== null && grammar.level !== filter.level) {
      return false
    }
    return true
  })
}
