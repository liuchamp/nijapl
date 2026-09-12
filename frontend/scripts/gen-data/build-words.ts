import { words as seedWords } from '../../data/source/seed/words.js'
import type { Word } from '../../src/types/domain.js'

/** 产出 words 构建数据。 */
export function buildWords(): Word[] {
  return seedWords.map((word) => ({
    ...word,
    related: word.related?.map((rel) => ({ ...rel })),
  }))
}
