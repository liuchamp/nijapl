import { describe, expect, it } from 'vitest'

import type { Grammar } from '../../types/domain.js'
import {
  emptyGrammarFilter,
  filterGrammars,
  grammarLevelOptions,
  grammarWeekOptions,
} from '../grammarView.js'

function makeGrammar(overrides: Partial<Grammar> = {}): Grammar {
  return {
    id: 'G001',
    pattern: '〜ている',
    connection: '動詞て形 + いる',
    scene: '日常',
    week: 1,
    level: 'N4',
    stageId: 's1',
    source: 'seed',
    ...overrides,
  }
}

const GRAMMARS: Grammar[] = [
  makeGrammar({ id: 'G001', week: 1, level: 'N4' }),
  makeGrammar({ id: 'G002', week: 2, level: 'N4' }),
  makeGrammar({ id: 'G003', week: 2, level: 'N3' }),
  makeGrammar({ id: 'G004', week: 1, level: 'N3' }),
]

describe('grammarView · 选项派生', () => {
  it('周次选项：去重且升序', () => {
    expect(grammarWeekOptions(GRAMMARS)).toEqual([1, 2])
    expect(grammarWeekOptions([])).toEqual([])
  })

  it('层级选项：去重且保持首次出现顺序', () => {
    expect(grammarLevelOptions(GRAMMARS)).toEqual(['N4', 'N3'])
  })
})

describe('grammarView · filterGrammars（即时筛选）', () => {
  it('空筛选（全部）→ 原样返回', () => {
    expect(filterGrammars(GRAMMARS, emptyGrammarFilter())).toHaveLength(4)
  })

  it('仅按周次筛选', () => {
    const result = filterGrammars(GRAMMARS, { week: 2, level: null })
    expect(result.map((g) => g.id)).toEqual(['G002', 'G003'])
  })

  it('仅按层级筛选', () => {
    const result = filterGrammars(GRAMMARS, { week: null, level: 'N3' })
    expect(result.map((g) => g.id)).toEqual(['G003', 'G004'])
  })

  it('周次 + 层级 组合筛选', () => {
    const result = filterGrammars(GRAMMARS, { week: 1, level: 'N3' })
    expect(result.map((g) => g.id)).toEqual(['G004'])
  })

  it('无匹配 → 空数组（不抛错）', () => {
    expect(filterGrammars(GRAMMARS, { week: 99, level: null })).toEqual([])
  })

  it('纯函数：不修改入参', () => {
    const snapshot = JSON.stringify(GRAMMARS)
    filterGrammars(GRAMMARS, { week: 1, level: 'N3' })
    expect(JSON.stringify(GRAMMARS)).toBe(snapshot)
  })
})
