import { sentences as seedSentences } from '../../data/source/seed/sentences.js'
import type { Sentence } from '../../src/types/domain.js'

/** 产出 sentences 构建数据（内联 word / grammar 关联）。 */
export function buildSentences(): Sentence[] {
  return seedSentences.map((sentence) => ({
    ...sentence,
    words: sentence.words.map((word) => ({ ...word })),
    grammars: sentence.grammars.map((grammar) => ({ ...grammar })),
  }))
}
