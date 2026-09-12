import { grammars as seedGrammars } from '../../data/source/seed/grammar.js'
import type { Grammar } from '../../src/types/domain.js'

/** 产出 grammar 构建数据。 */
export function buildGrammar(): Grammar[] {
  return seedGrammars.map((grammar) => ({
    ...grammar,
    related: grammar.related?.map((rel) => ({ ...rel })),
  }))
}
