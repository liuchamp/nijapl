import type { Sentence } from '../types/domain.js'

/**
 * 例句高亮切分（架构 §2.10 / J3）——**纯逻辑**，与渲染解耦，便于单测。
 *
 * 高亮依据 `SentenceWord.start/end` 与 `SentenceGrammar.start/end`（左闭右开，指向 `ja` 下标）。
 * 语法点若缺偏移（可选字段），不做内联高亮，改由 {@link buildSentenceHighlight} 的
 * `missingGrammarIds` 输出，供页面退化为文字列表（不猜位置、不越界）。
 */

/** 高亮区间。 */
export interface HighlightRange {
  /** 起始下标（含）。 */
  start: number
  /** 结束下标（不含）。 */
  end: number
  kind: 'word' | 'grammar'
  /** 语法点 id（`kind === 'grammar'` 时有意义）。 */
  id?: string
}

/** 切分后的文本片段。 */
export interface TextSegment {
  key: string
  text: string
  word: boolean
  grammar: boolean
  grammarId?: string
}

/**
 * 把例句按高亮区间切分为片段。
 *
 * 规则：越界 / 非整数 / `end <= start` 的区间被忽略；词与语法可重叠（两者样式同时生效）。
 */
export function buildSegments(
  text: string,
  ranges: HighlightRange[],
): TextSegment[] {
  const length = text.length
  if (length === 0) {
    return []
  }

  const wordFlag = new Array<boolean>(length).fill(false)
  const grammarFlag = new Array<boolean>(length).fill(false)
  const grammarIdAt = new Array<string | undefined>(length).fill(undefined)

  for (const range of ranges) {
    if (!Number.isFinite(range.start) || !Number.isFinite(range.end)) {
      continue
    }
    const start = Math.max(0, Math.floor(range.start))
    const end = Math.min(length, Math.floor(range.end))
    if (end <= start) {
      continue
    }
    for (let i = start; i < end; i += 1) {
      if (range.kind === 'word') {
        wordFlag[i] = true
      } else {
        grammarFlag[i] = true
        if (range.id !== undefined) {
          grammarIdAt[i] = range.id
        }
      }
    }
  }

  const segments: TextSegment[] = []
  let runStart = 0
  for (let i = 1; i <= length; i += 1) {
    const changed =
      i === length ||
      wordFlag[i] !== wordFlag[runStart] ||
      grammarFlag[i] !== grammarFlag[runStart] ||
      grammarIdAt[i] !== grammarIdAt[runStart]
    if (!changed) {
      continue
    }
    segments.push({
      key: `${runStart}-${i}`,
      text: text.slice(runStart, i),
      word: wordFlag[runStart] === true,
      grammar: grammarFlag[runStart] === true,
      grammarId: grammarIdAt[runStart],
    })
    runStart = i
  }
  return segments
}

/** 单句高亮结果。 */
export interface SentenceHighlight {
  ranges: HighlightRange[]
  /** 命中高亮但缺偏移、无法内联标注的语法 id。 */
  missingGrammarIds: string[]
}

/**
 * 计算某例句的高亮区间。
 *
 * @param sentence 例句
 * @param wordId 当前详解词条（其出现位置高亮为词条色）
 * @param grammarIdsToHighlight 需高亮的语法点（通常为「未掌握」集合）
 */
export function buildSentenceHighlight(
  sentence: Sentence,
  wordId: string,
  grammarIdsToHighlight: string[],
): SentenceHighlight {
  const highlight = new Set(grammarIdsToHighlight)
  const ranges: HighlightRange[] = []
  const missingGrammarIds: string[] = []

  for (const wordRef of sentence.words) {
    if (
      wordRef.wordId === wordId &&
      wordRef.start !== undefined &&
      wordRef.end !== undefined
    ) {
      ranges.push({ start: wordRef.start, end: wordRef.end, kind: 'word' })
    }
  }

  for (const grammarRef of sentence.grammars) {
    if (!highlight.has(grammarRef.grammarId)) {
      continue
    }
    if (grammarRef.start !== undefined && grammarRef.end !== undefined) {
      ranges.push({
        start: grammarRef.start,
        end: grammarRef.end,
        kind: 'grammar',
        id: grammarRef.grammarId,
      })
    } else {
      missingGrammarIds.push(grammarRef.grammarId)
    }
  }

  return { ranges, missingGrammarIds }
}
