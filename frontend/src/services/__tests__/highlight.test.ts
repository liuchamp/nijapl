import { describe, expect, it } from 'vitest'

import type { Sentence } from '../../types/domain.js'
import { buildSegments, buildSentenceHighlight } from '../highlight.js'

describe('highlight · buildSegments 切分', () => {
  it('无区间 → 单一片段（纯文本）', () => {
    const segments = buildSegments('みずをのみます。', [])
    expect(segments).toHaveLength(1)
    expect(segments[0]?.text).toBe('みずをのみます。')
    expect(segments[0]?.word).toBe(false)
    expect(segments[0]?.grammar).toBe(false)
  })

  it('空文本 → 空数组', () => {
    expect(buildSegments('', [])).toEqual([])
  })

  it('词条区间命中 → 该片段 word=true，其余 false', () => {
    const segments = buildSegments('みずをのみます。', [
      { start: 0, end: 2, kind: 'word' },
    ])
    expect(segments.map((s) => s.text)).toEqual(['みず', 'をのみます。'])
    expect(segments[0]?.word).toBe(true)
    expect(segments[1]?.word).toBe(false)
  })

  it('语法区间带 id → grammar=true 且 grammarId 正确', () => {
    const segments = buildSegments('わたしはほんをよんでいます。', [
      { start: 7, end: 13, kind: 'grammar', id: 'G001' },
    ])
    const hit = segments.find((s) => s.grammar)
    expect(hit?.text).toBe('よんでいます')
    expect(hit?.grammarId).toBe('G001')
  })

  it('词与语法重叠 → 片段同时 word 与 grammar，语法 id 保留', () => {
    const segments = buildSegments('のみたい', [
      { start: 0, end: 4, kind: 'word' },
      { start: 2, end: 4, kind: 'grammar', id: 'G002' },
    ])
    const overlapped = segments.find((s) => s.word && s.grammar)
    expect(overlapped?.text).toBe('たい')
    expect(overlapped?.grammarId).toBe('G002')
  })

  it('越界 / 逆序 / 非整数区间被忽略', () => {
    const segments = buildSegments('あいう', [
      { start: 2, end: 2, kind: 'word' },
      { start: 5, end: 9, kind: 'word' },
      { start: Number.NaN, end: 2, kind: 'word' },
      { start: -3, end: 1, kind: 'grammar', id: 'G9' },
    ])
    // 仅 [-3,1) 被夹取为 [0,1)。
    expect(segments.map((s) => s.text)).toEqual(['あ', 'いう'])
    expect(segments[0]?.grammar).toBe(true)
    expect(segments[0]?.grammarId).toBe('G9')
  })
})

/** 构造最小例句。 */
function makeSentence(overrides: Partial<Sentence>): Sentence {
  return {
    id: 'S1',
    ja: 'あいうえお',
    zh: '测试',
    level: 'N5',
    source: 'seed',
    reviewStatus: 'approved',
    words: [],
    grammars: [],
    ...overrides,
  }
}

describe('highlight · buildSentenceHighlight 退化策略', () => {
  it('词条带偏移 → 生成 word 区间', () => {
    const sentence = makeSentence({
      words: [
        { sentenceId: 'S1', wordId: 'w-01', surface: 'あい', start: 0, end: 2 },
      ],
    })
    const result = buildSentenceHighlight(sentence, 'w-01', [])
    expect(result.ranges).toEqual([{ start: 0, end: 2, kind: 'word' }])
    expect(result.missingGrammarIds).toEqual([])
  })

  it('词条无偏移 → 不生成区间（不猜位置）', () => {
    const sentence = makeSentence({
      words: [{ sentenceId: 'S1', wordId: 'w-01', surface: 'あい' }],
    })
    const result = buildSentenceHighlight(sentence, 'w-01', [])
    expect(result.ranges).toEqual([])
  })

  it('需高亮语法带偏移 → 生成 grammar 区间', () => {
    const sentence = makeSentence({
      grammars: [{ sentenceId: 'S1', grammarId: 'G1', start: 0, end: 3 }],
    })
    const result = buildSentenceHighlight(sentence, 'w-x', ['G1'])
    expect(result.ranges).toEqual([
      { start: 0, end: 3, kind: 'grammar', id: 'G1' },
    ])
    expect(result.missingGrammarIds).toEqual([])
  })

  it('需高亮语法缺偏移 → 落入 missingGrammarIds（退化列表）', () => {
    const sentence = makeSentence({
      grammars: [{ sentenceId: 'S1', grammarId: 'G1' }],
    })
    const result = buildSentenceHighlight(sentence, 'w-x', ['G1'])
    expect(result.ranges).toEqual([])
    expect(result.missingGrammarIds).toEqual(['G1'])
  })

  it('未列入高亮的语法 → 既不内联也不退化', () => {
    const sentence = makeSentence({
      grammars: [{ sentenceId: 'S1', grammarId: 'G1' }],
    })
    const result = buildSentenceHighlight(sentence, 'w-x', [])
    expect(result.ranges).toEqual([])
    expect(result.missingGrammarIds).toEqual([])
  })
})
