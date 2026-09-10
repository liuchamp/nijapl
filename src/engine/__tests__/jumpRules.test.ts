import { describe, expect, it } from 'vitest'

import { POS_VERB } from '../../constants/pos.js'
import type { Grammar, Word } from '../../types/domain.js'
import type { JumpContext } from '../../types/progress.js'
import { evaluate } from '../jumpRules.js'
import { initialProgress } from '../srs.js'

const grammarById = (_id: string): Grammar | undefined => undefined

function makeWord(overrides: Partial<Word> = {}): Word {
  return {
    id: 'w-01',
    kana: 'のむ',
    kanji: '飲む',
    pos: '五段動詞',
    meaning: '喝',
    stageId: 's1',
    moduleId: 'm01',
    source: 'seed',
    ...overrides,
  }
}

function makeCtx(overrides: Partial<JumpContext> = {}): JumpContext {
  return {
    word: makeWord(),
    grammarById,
    wordProgress: initialProgress('w-01'),
    grammarLearned: {},
    sessionWrongCount: 0,
    moduleLearned: 0,
    moduleTotal: 5,
    ...overrides,
  }
}

function rules(decisions: ReturnType<typeof evaluate>): string[] {
  return decisions.map((d) => d.rule)
}

describe('jumpRules · J1 首次遇词', () => {
  it('seen=false 且自评不认识 → autoDetailed', () => {
    const decisions = evaluate(makeCtx({ selfEval: '不认识' }), 'selfEval')
    expect(rules(decisions)).toContain('J1')
    expect(decisions.find((d) => d.rule === 'J1')).toMatchObject({
      kind: 'autoDetailed',
      target: 'P3',
    })
  })

  it('seen=true → 不触发 J1（会话内不再打断）', () => {
    const seen = initialProgress('w-01')
    seen.seen = true
    const decisions = evaluate(
      makeCtx({ wordProgress: seen, selfEval: '不认识' }),
      'selfEval',
    )
    expect(rules(decisions)).not.toContain('J1')
  })

  it('自评认识 → 不触发 J1', () => {
    const decisions = evaluate(makeCtx({ selfEval: '认识' }), 'selfEval')
    expect(rules(decisions)).not.toContain('J1')
  })

  it('scene 触发 → 不评估 J1', () => {
    const decisions = evaluate(makeCtx({ selfEval: '不认识' }), 'scene')
    expect(rules(decisions)).not.toContain('J1')
  })
})

describe('jumpRules · J2 连错引导', () => {
  it('sessionWrongCount >= 2 → promptDetailed', () => {
    const decisions = evaluate(makeCtx({ sessionWrongCount: 2 }), 'selfEval')
    expect(decisions.find((d) => d.rule === 'J2')).toMatchObject({
      kind: 'promptDetailed',
      target: 'P3',
    })
  })

  it('sessionWrongCount < 2 → 不触发 J2', () => {
    expect(
      rules(evaluate(makeCtx({ sessionWrongCount: 1 }), 'selfEval')),
    ).not.toContain('J2')
  })
})

describe('jumpRules · J3 例句生语法高亮', () => {
  it('scene 且存在未掌握语法 → highlightGrammar', () => {
    const decisions = evaluate(
      makeCtx({ grammarIds: ['G001', 'G002'], grammarLearned: { G001: true } }),
      'scene',
    )
    expect(decisions.find((d) => d.rule === 'J3')).toMatchObject({
      kind: 'highlightGrammar',
      grammarIds: ['G002'],
      target: 'P5',
    })
  })

  it('全部已掌握 → 不触发 J3', () => {
    const decisions = evaluate(
      makeCtx({ grammarIds: ['G001'], grammarLearned: { G001: true } }),
      'scene',
    )
    expect(rules(decisions)).not.toContain('J3')
  })

  it('selfEval 触发 → 不评估 J3', () => {
    const decisions = evaluate(makeCtx({ grammarIds: ['G001'] }), 'selfEval')
    expect(rules(decisions)).not.toContain('J3')
  })
})

describe('jumpRules · J4 模块学完', () => {
  it('learned/total === 1 且 total > 0 → promptGraph', () => {
    const decisions = evaluate(
      makeCtx({ moduleLearned: 5, moduleTotal: 5 }),
      'selfEval',
    )
    expect(decisions.find((d) => d.rule === 'J4')).toMatchObject({
      kind: 'promptGraph',
      target: 'P6',
    })
  })

  it('total=0 → 不触发 J4（无 NaN）', () => {
    expect(
      rules(
        evaluate(makeCtx({ moduleLearned: 0, moduleTotal: 0 }), 'selfEval'),
      ),
    ).not.toContain('J4')
  })

  it('未学完 → 不触发 J4', () => {
    expect(
      rules(
        evaluate(makeCtx({ moduleLearned: 4, moduleTotal: 5 }), 'selfEval'),
      ),
    ).not.toContain('J4')
  })
})

describe('jumpRules · J5 动词变形（POS_VERB 显式枚举边界）', () => {
  it('POS_VERB 中每个词性都触发 J5', () => {
    for (const pos of POS_VERB) {
      const decisions = evaluate(
        makeCtx({ word: makeWord({ pos }) }),
        'selfEval',
      )
      expect(rules(decisions), `pos=${pos}`).toContain('J5')
    }
  })

  it('非动词（名詞 / い形容詞 / 副詞）不触发 J5', () => {
    for (const pos of ['名詞', 'い形容詞', 'な形容詞', '副詞'] as const) {
      const decisions = evaluate(
        makeCtx({ word: makeWord({ pos }) }),
        'selfEval',
      )
      expect(rules(decisions), `pos=${pos}`).not.toContain('J5')
    }
  })

  it('单字/近似值不得误判（防单字匹配回归）', () => {
    for (const pos of ['動詞', '五', '一段', 'サ変'] as const) {
      const decisions = evaluate(
        makeCtx({ word: makeWord({ pos: pos as Word['pos'] }) }),
        'selfEval',
      )
      expect(rules(decisions), `pos=${pos}`).not.toContain('J5')
    }
  })
})

describe('jumpRules · J6 关联词', () => {
  it('存在关联词 → showRelated', () => {
    const word = makeWord({
      pos: '名詞',
      related: [{ fromId: 'w-01', toId: 'w-02', type: 'synonym' }],
    })
    const decisions = evaluate(makeCtx({ word }), 'selfEval')
    expect(decisions.find((d) => d.rule === 'J6')).toMatchObject({
      kind: 'showRelated',
      target: 'P3',
    })
  })

  it('无关联词 → 不触发 J6', () => {
    expect(
      rules(evaluate(makeCtx({ word: makeWord({ pos: '名詞' }) }), 'selfEval')),
    ).not.toContain('J6')
  })
})

describe('jumpRules · 未命中', () => {
  it('无任何规则命中 → 返回 [{ rule: none }]', () => {
    const word = makeWord({ pos: '名詞' })
    const ctx = makeCtx({
      word,
      selfEval: '认识',
      sessionWrongCount: 0,
      moduleLearned: 1,
      moduleTotal: 5,
    })
    expect(evaluate(ctx, 'selfEval')).toEqual([{ rule: 'none' }])
  })

  it('一次自评可同时命中多条（J1+J5+J6）', () => {
    const word = makeWord({
      related: [{ fromId: 'w-01', toId: 'w-02', type: 'sameModule' }],
    })
    const decisions = evaluate(
      makeCtx({ word, selfEval: '不认识' }),
      'selfEval',
    )
    expect(rules(decisions)).toEqual(expect.arrayContaining(['J1', 'J5', 'J6']))
  })
})
