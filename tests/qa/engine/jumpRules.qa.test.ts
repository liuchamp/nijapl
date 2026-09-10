import { describe, expect, it } from 'vitest'

import { POS_LIST, POS_VERB, isVerb } from '../../../src/constants/pos.js'
import type { Grammar, Word } from '../../../src/types/domain.js'
import type { JumpContext } from '../../../src/types/progress.js'
import { evaluate } from '../../../src/engine/jumpRules.js'
import { initialProgress } from '../../../src/engine/srs.js'

/** QA 独立验证 —— T02 `jumpRules.ts`（J1–J6 与 POS_VERB 边界攻击）。 */

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

const rules = (d: ReturnType<typeof evaluate>): string[] => d.map((x) => x.rule)

describe('QA · POS_VERB 显式枚举契约（红线）', () => {
  it('POS_VERB 精确等于设计要求数组', () => {
    expect([...POS_VERB]).toEqual([
      '五段動詞',
      '一段動詞',
      'サ変動詞',
      'カ変動詞',
      '不規則動詞',
    ])
  })

  it('POS_VERB 每一项都在全量 POS_LIST 内', () => {
    for (const p of POS_VERB) {
      expect(POS_LIST, `pos=${p}`).toContain(p)
    }
  })

  it('isVerb：枚举内为 true，枚举外为 false（含空白/子串/单字攻击）', () => {
    for (const p of POS_VERB) expect(isVerb(p), p).toBe(true)

    const attacks = [
      '五段動詞 ', // 尾随半角空格
      ' 五段動詞', // 前导空格
      '五段動詞\t', // 尾随制表符
      '五段動詞\n', // 尾随换行
      '五段動詞　', // 尾随全角空格
      '動詞', // 泛化词性
      '五段', // 去后缀
      '一段',
      'サ変',
      '五',
      '', // 空串
      '動詞五段',
      '五段動詞x',
    ]
    for (const p of attacks) expect(isVerb(p), JSON.stringify(p)).toBe(false)
  })

  it('isVerb：非动词词性为 false', () => {
    for (const p of ['名詞', '代名詞', 'い形容詞', 'な形容詞', '副詞', '接続詞']) {
      expect(isVerb(p), p).toBe(false)
    }
  })
})

describe('QA · J1 首次遇词（seen 门控）', () => {
  it('seen=false + 自评「不认识」→ 触发 J1(autoDetailed→P3)', () => {
    const d = evaluate(makeCtx({ selfEval: '不认识' }), 'selfEval')
    expect(d.find((x) => x.rule === 'J1')).toMatchObject({
      kind: 'autoDetailed',
      target: 'P3',
    })
  })

  it('seen=true + 自评「不认识」→ 不触发（会话内重复不打断）', () => {
    const seen = { ...initialProgress('w-01'), seen: true }
    const d = evaluate(
      makeCtx({ wordProgress: seen, selfEval: '不认识' }),
      'selfEval',
    )
    expect(rules(d)).not.toContain('J1')
  })

  it('seen=false + 自评「模糊」/「认识」→ 不触发 J1', () => {
    for (const evalr of ['模糊', '认识'] as const) {
      expect(rules(evaluate(makeCtx({ selfEval: evalr }), 'selfEval'))).not.toContain(
        'J1',
      )
    }
  })

  it('scene 触发 → 永不评估 J1', () => {
    expect(
      rules(evaluate(makeCtx({ selfEval: '不认识' }), 'scene')),
    ).not.toContain('J1')
  })

  it('【观察性断言】selfEval 缺省 + trigger=selfEval + seen=false 会触发 J1', () => {
    // 设计 §3.3 备注允许缺省退化；此处记录其对「非不认识」自评的潜在穿透风险。
    const d = evaluate(makeCtx(), 'selfEval')
    expect(rules(d)).toContain('J1')
  })
})

describe('QA · J2 连错引导（会话内阈值边界）', () => {
  it('阈值边界：0/1 不触发，2/3 触发', () => {
    expect(
      rules(evaluate(makeCtx({ sessionWrongCount: 0 }), 'selfEval')),
    ).not.toContain('J2')
    expect(
      rules(evaluate(makeCtx({ sessionWrongCount: 1 }), 'selfEval')),
    ).not.toContain('J2')
    for (const n of [2, 3, 5]) {
      expect(
        rules(evaluate(makeCtx({ sessionWrongCount: n }), 'selfEval')),
        `n=${n}`,
      ).toContain('J2')
    }
  })

  it('J2 决策形如 promptDetailed→P3', () => {
    const d = evaluate(makeCtx({ sessionWrongCount: 2 }), 'selfEval')
    expect(d.find((x) => x.rule === 'J2')).toMatchObject({
      kind: 'promptDetailed',
      target: 'P3',
    })
  })

  it('scene 触发 → 不评估 J2', () => {
    expect(
      rules(evaluate(makeCtx({ sessionWrongCount: 9 }), 'scene')),
    ).not.toContain('J2')
  })
})

describe('QA · J3 例句生语法高亮（scene 专用）', () => {
  it('仅保留未掌握语法，决策携带 grammarIds', () => {
    const d = evaluate(
      makeCtx({
        grammarIds: ['G001', 'G002', 'G003'],
        grammarLearned: { G001: true, G003: true },
      }),
      'scene',
    )
    expect(d.find((x) => x.rule === 'J3')).toMatchObject({
      kind: 'highlightGrammar',
      grammarIds: ['G002'],
      target: 'P5',
    })
  })

  it('全部已掌握 / 空 grammarIds → 不触发', () => {
    expect(
      rules(
        evaluate(
          makeCtx({ grammarIds: ['G001'], grammarLearned: { G001: true } }),
          'scene',
        ),
      ),
    ).not.toContain('J3')
    expect(rules(evaluate(makeCtx({ grammarIds: [] }), 'scene'))).not.toContain(
      'J3',
    )
    expect(rules(evaluate(makeCtx(), 'scene'))).not.toContain('J3')
  })

  it('selfEval 触发 → 不评估 J3', () => {
    expect(
      rules(evaluate(makeCtx({ grammarIds: ['G001'] }), 'selfEval')),
    ).not.toContain('J3')
  })
})

describe('QA · J4 模块学完（total>0 门控）', () => {
  it('learned===total 且 total>0 → 触发 promptGraph→P6', () => {
    const d = evaluate(
      makeCtx({ moduleLearned: 5, moduleTotal: 5 }),
      'selfEval',
    )
    expect(d.find((x) => x.rule === 'J4')).toMatchObject({
      kind: 'promptGraph',
      target: 'P6',
    })
  })

  it('total=0 → 不触发（无 0/0=NaN）', () => {
    expect(
      rules(evaluate(makeCtx({ moduleLearned: 0, moduleTotal: 0 }), 'selfEval')),
    ).not.toContain('J4')
  })

  it('learned<total → 不触发', () => {
    expect(
      rules(evaluate(makeCtx({ moduleLearned: 4, moduleTotal: 5 }), 'selfEval')),
    ).not.toContain('J4')
  })

  it('负 total → 不触发', () => {
    expect(
      rules(
        evaluate(makeCtx({ moduleLearned: 0, moduleTotal: -3 }), 'selfEval'),
      ),
    ).not.toContain('J4')
  })
})

describe('QA · J5 动词变形（POS_VERB 显式枚举，非单字匹配）', () => {
  it('POS_VERB 每一项 → 触发 J5(showConjugation→P3)', () => {
    for (const pos of POS_VERB) {
      const d = evaluate(makeCtx({ word: makeWord({ pos }) }), 'selfEval')
      expect(rules(d), `pos=${pos}`).toContain('J5')
    }
  })

  it('非动词 → 不触发 J5', () => {
    for (const pos of ['名詞', 'い形容詞', 'な形容詞', '副詞', '接続詞'] as const) {
      const d = evaluate(makeCtx({ word: makeWord({ pos }) }), 'selfEval')
      expect(rules(d), `pos=${pos}`).not.toContain('J5')
    }
  })

  it('边界攻击：空白/子串/单字词性一律不得误判为动词', () => {
    const attacks = [
      '五段動詞 ',
      '動詞',
      '五段',
      '五',
      '一段',
      'サ変',
      '',
      '五段動詞x',
    ]
    for (const pos of attacks) {
      const d = evaluate(
        makeCtx({ word: makeWord({ pos: pos as Word['pos'] }) }),
        'selfEval',
      )
      expect(rules(d), `pos=${JSON.stringify(pos)}`).not.toContain('J5')
    }
  })
})

describe('QA · J6 关联词 chips', () => {
  it('related 非空 → 触发 showRelated→P3', () => {
    const word = makeWord({
      pos: '名詞',
      related: [{ fromId: 'w-01', toId: 'w-02', type: 'synonym' }],
    })
    const d = evaluate(makeCtx({ word }), 'selfEval')
    expect(d.find((x) => x.rule === 'J6')).toMatchObject({
      kind: 'showRelated',
      target: 'P3',
    })
  })

  it('related=[] 或 undefined → 不触发', () => {
    expect(
      rules(evaluate(makeCtx({ word: makeWord({ pos: '名詞', related: [] }) }))),
    ).not.toContain('J6')
    expect(
      rules(evaluate(makeCtx({ word: makeWord({ pos: '名詞' }) }))),
    ).not.toContain('J6')
  })
})

describe('QA · evaluate 汇总行为', () => {
  it('未命中任何规则 → 返回哨兵 [{ rule: "none" }]', () => {
    const d = evaluate(
      makeCtx({
        word: makeWord({ pos: '名詞' }),
        selfEval: '认识',
        sessionWrongCount: 0,
        moduleLearned: 1,
        moduleTotal: 5,
      }),
      'selfEval',
    )
    expect(d).toEqual([{ rule: 'none' }])
    expect(d.filter((x) => x.rule === 'none')).toHaveLength(1) // 哨兵唯一
  })

  it('一次自评可同时命中 J1+J5+J6，且顺序为 J1<J5<J6', () => {
    const word = makeWord({
      related: [{ fromId: 'w-01', toId: 'w-02', type: 'sameModule' }],
    })
    const d = evaluate(makeCtx({ word, selfEval: '不认识' }), 'selfEval')
    const ids = rules(d)
    expect(ids).toEqual(expect.arrayContaining(['J1', 'J5', 'J6']))
    const idx = (r: string): number => ids.indexOf(r)
    expect(idx('J1')).toBeLessThan(idx('J5'))
    expect(idx('J5')).toBeLessThan(idx('J6'))
  })

  it('J4 在 scene 与 selfEval 下均可触发（非场景限定）', () => {
    const ctx = makeCtx({ moduleLearned: 3, moduleTotal: 3 })
    expect(rules(evaluate(ctx, 'scene'))).toContain('J4')
    expect(rules(evaluate(ctx, 'selfEval'))).toContain('J4')
  })
})
