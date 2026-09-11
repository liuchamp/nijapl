import { describe, expect, it } from 'vitest'
import { buildConjugationTable } from '../../../src/engine/conjugation.js'
import type { Word } from '../../../src/types/domain.js'

/** QA 独立验证 —— T02 `conjugation.ts`（按词性生成变形表的正确性）。 */

function verb(kana: string, pos: Word['pos']): Word {
  return {
    id: 'w',
    kana,
    kanji: kana,
    pos,
    meaning: 'x',
    stageId: 's1',
    moduleId: 'm01',
    source: 'seed',
  }
}

function table(kana: string, pos: Word['pos']): Record<string, string> {
  const rows = buildConjugationTable(verb(kana, pos))
  return Object.fromEntries(rows.map((r) => [r.form, r.value]))
}

describe('QA · conjugation 非动词/未知词性安全返回', () => {
  it('非动词词性 → 空数组', () => {
    for (const pos of [
      '名詞',
      'い形容詞',
      'な形容詞',
      '副詞',
      '接続詞',
    ] as const) {
      expect(buildConjugationTable(verb('x', pos)), pos).toEqual([])
    }
  })
})

describe('QA · conjugation 一段動詞（正确性）', () => {
  it('たべる：完整五形正确', () => {
    expect(table('たべる', '一段動詞')).toEqual({
      辞書形: 'たべる',
      ます形: 'たべます',
      て形: 'たべて',
      た形: 'たべた',
      ない形: 'たべない',
    })
  })

  it('みる：完整五形正确', () => {
    expect(table('みる', '一段動詞')).toEqual({
      辞書形: 'みる',
      ます形: 'みます',
      て形: 'みて',
      た形: 'みた',
      ない形: 'みない',
    })
  })
})

describe('QA · conjugation サ変動詞 / カ変動詞（正确性）', () => {
  it('する：完整五形正确', () => {
    expect(table('する', 'サ変動詞')).toEqual({
      辞書形: 'する',
      ます形: 'します',
      て形: 'して',
      た形: 'した',
      ない形: 'しない',
    })
  })

  it('くる：完整五形正确', () => {
    expect(table('くる', 'カ変動詞')).toEqual({
      辞書形: 'くる',
      ます形: 'きます',
      て形: 'きて',
      た形: 'きた',
      ない形: 'こない',
    })
  })
})

describe('QA · conjugation 五段動詞（正确性）', () => {
  it('のむ：ます/て/た形正确', () => {
    const t = table('のむ', '五段動詞')
    expect(t.ます形).toBe('のみます')
    expect(t.て形).toBe('のんで')
    expect(t.た形).toBe('のんだ')
  })

  it('はなす：ます/て/た形正确', () => {
    const t = table('はなす', '五段動詞')
    expect(t.ます形).toBe('はなします')
    expect(t.て形).toBe('はなして')
    expect(t.た形).toBe('はなした')
  })

  it('かく：ます/て/た形正确', () => {
    const t = table('かく', '五段動詞')
    expect(t.ます形).toBe('かきます')
    expect(t.て形).toBe('かいて')
    expect(t.た形).toBe('かいた')
  })

  it('【应为 あ行】五段 ない形 必须使用あ行（のむ→のまない）', () => {
    // 未然形（あ行）+ ない：这是 JLPT 学习内容的正确形态
    expect(table('のむ', '五段動詞').ない形).toBe('のまない')
    expect(table('かく', '五段動詞').ない形).toBe('かかない')
    expect(table('はなす', '五段動詞').ない形).toBe('はなさない')
    expect(table('まつ', '五段動詞').ない形).toBe('またない')
  })

  it('【う→わ】五段 ない形：う 结尾的未然形是 わ（つかう→つかわない）', () => {
    const t = table('つかう', '五段動詞')
    expect(t.ます形).toBe('つかいます')
    expect(t.て形).toBe('つかって')
    expect(t.た形).toBe('つかった')
    expect(t.ない形).toBe('つかわない')
  })

  it('【不规则】いく：て/た形应为 いって / いった', () => {
    const t = table('いく', '五段動詞')
    expect(t.て形).toBe('いって')
    expect(t.た形).toBe('いった')
    expect(t.ます形).toBe('いきます')
    expect(t.ない形).toBe('いかない')
  })

  it('【不规则】ある：ない形应为 ない（而非 あらない）', () => {
    expect(table('ある', '五段動詞').ない形).toBe('ない')
  })

  it('五段各词尾（ぐ/ぬ/ぶ/る/む）全五形正确', () => {
    const expected: Record<string, [string, string, string, string, string]> = {
      およぐ: ['およぐ', 'およぎます', 'およいで', 'およいだ', 'およがない'],
      しぬ: ['しぬ', 'しにます', 'しんで', 'しんだ', 'しなない'],
      よぶ: ['よぶ', 'よびます', 'よんで', 'よんだ', 'よばない'],
      わかる: ['わかる', 'わかります', 'わかって', 'わかった', 'わからない'],
      のむ: ['のむ', 'のみます', 'のんで', 'のんだ', 'のまない'],
    }
    for (const [kana, [d, m, te, ta, nai]] of Object.entries(expected)) {
      expect(table(kana, '五段動詞'), kana).toEqual({
        辞書形: d,
        ます形: m,
        て形: te,
        た形: ta,
        ない形: nai,
      })
    }
  })
})

describe('QA · conjugation サ変動詞 复合词', () => {
  it('べんきょうする：按词干生成 します/して/した/しない', () => {
    expect(table('べんきょうする', 'サ変動詞')).toEqual({
      辞書形: 'べんきょうする',
      ます形: 'べんきょうします',
      て形: 'べんきょうして',
      た形: 'べんきょうした',
      ない形: 'べんきょうしない',
    })
  })
})
