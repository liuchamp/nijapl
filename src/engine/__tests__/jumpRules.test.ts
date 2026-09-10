import { describe, expect, it } from 'vitest'

import { POS_VERB } from '../../constants/pos.js'
import type { Grammar, Word } from '../../types/domain.js'
import type { JumpContext } from '../../types/progress.js'
import { evaluate, isFirstEncounter } from '../jumpRules.js'
import {
  applyPresented,
  applySelfEval,
  applySkip,
  initialProgress,
} from '../srs.js'

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

  it('已评估过（history 非空）→ 不触发 J1（会话内不再打断）', () => {
    const answered = applySelfEval(initialProgress('w-01'), '认识', 1_000)
    const decisions = evaluate(
      makeCtx({ wordProgress: answered, selfEval: '不认识' }),
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

describe('jumpRules · J1 必须显式 selfEval（F4 边界）', () => {
  it('selfEval 缺省 → 不触发 J1（不得因缺省而误穿）', () => {
    const decisions = evaluate(makeCtx({ selfEval: undefined }), 'selfEval')
    expect(rules(decisions)).not.toContain('J1')
  })

  it("selfEval='模糊' → 不触发 J1", () => {
    const decisions = evaluate(makeCtx({ selfEval: '模糊' }), 'selfEval')
    expect(rules(decisions)).not.toContain('J1')
  })

  it("selfEval='认识' → 不触发 J1", () => {
    const decisions = evaluate(makeCtx({ selfEval: '认识' }), 'selfEval')
    expect(rules(decisions)).not.toContain('J1')
  })

  it("selfEval='不认识' 且未出现 → 触发 J1（正向基线）", () => {
    const decisions = evaluate(makeCtx({ selfEval: '不认识' }), 'selfEval')
    expect(rules(decisions)).toContain('J1')
  })

  it('收紧 J1 不影响其它规则（模糊 + 连错 2 仍触发 J2）', () => {
    const decisions = evaluate(
      makeCtx({ selfEval: '模糊', sessionWrongCount: 2 }),
      'selfEval',
    )
    expect(rules(decisions)).not.toContain('J1')
    expect(rules(decisions)).toContain('J2')
  })
})

describe('jumpRules · J1 首次遇词语义裁决（Ruling 1：history.length === 0）', () => {
  it('isFirstEncounter：history 为空 → true；有评估记录 → false', () => {
    expect(isFirstEncounter(initialProgress('w-01'))).toBe(true)
    // 仅展示（applyPresented）不写 history → 仍视为首次遇词
    expect(
      isFirstEncounter(applyPresented(initialProgress('w-01'), 1_000)),
    ).toBe(true)
    expect(
      isFirstEncounter(applySelfEval(initialProgress('w-01'), '认识', 1_000)),
    ).toBe(false)
  })

  it('(a) 展示后自评「不认识」→ J1 触发', () => {
    // 展示即转态：seen=true / 学习中，但 history 仍为空
    const presented = applyPresented(initialProgress('w-01'), 1_000)
    expect(presented.seen).toBe(true)
    expect(presented.state).toBe('学习中')
    expect(presented.history).toHaveLength(0)
    const decisions = evaluate(
      makeCtx({ wordProgress: presented, selfEval: '不认识' }),
      'selfEval',
    )
    expect(rules(decisions)).toContain('J1')
  })

  it('(b) 跳过后再展示并自评「不认识」→ J1 仍触发（history 未被跳过污染）', () => {
    const presented = applyPresented(initialProgress('w-01'), 1_000)
    const skipped = applySkip(presented, 2_000)
    // 跳过不计分、不写评估历史
    expect(skipped.history).toHaveLength(0)
    expect(isFirstEncounter(skipped)).toBe(true)
    const decisions = evaluate(
      makeCtx({ wordProgress: skipped, selfEval: '不认识' }),
      'selfEval',
    )
    expect(rules(decisions)).toContain('J1')
  })

  it('(c) 已评估过（history 非空）后再自评「不认识」→ J1 不触发', () => {
    const answered = applySelfEval(initialProgress('w-01'), '认识', 1_000)
    expect(answered.history.length).toBeGreaterThan(0)
    const decisions = evaluate(
      makeCtx({ wordProgress: answered, selfEval: '不认识' }),
      'selfEval',
    )
    expect(rules(decisions)).not.toContain('J1')
  })

  it('(d) selfEval 缺省 / 「模糊」/ 「认识」→ J1 不触发', () => {
    for (const selfEval of [undefined, '模糊', '认识'] as const) {
      const decisions = evaluate(
        makeCtx({ selfEval, wordProgress: initialProgress('w-01') }),
        'selfEval',
      )
      expect(rules(decisions), `selfEval=${String(selfEval)}`).not.toContain(
        'J1',
      )
    }
  })
})
