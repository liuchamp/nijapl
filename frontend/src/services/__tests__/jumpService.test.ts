import { describe, expect, it } from 'vitest'

import type { JumpDecision } from '../../types/progress.js'
import {
  detailSheetModeFor,
  emptyStudyEffect,
  toStudyEffect,
} from '../jumpService.js'

describe('jumpService · toStudyEffect 决策翻译', () => {
  it('none → 全否', () => {
    expect(toStudyEffect([{ rule: 'none' }])).toEqual(emptyStudyEffect())
  })

  it('J1 → autoDetail', () => {
    const effect = toStudyEffect([
      { rule: 'J1', kind: 'autoDetailed', target: 'P3' },
    ])
    expect(effect.autoDetail).toBe(true)
    expect(effect.promptDetail).toBe(false)
  })

  it('J2 → promptDetail', () => {
    const effect = toStudyEffect([
      { rule: 'J2', kind: 'promptDetailed', target: 'P3' },
    ])
    expect(effect.promptDetail).toBe(true)
    expect(effect.autoDetail).toBe(false)
  })

  it('J3 → 复制 grammarIds（不共享引用）', () => {
    const grammarIds = ['G1', 'G2']
    const effect = toStudyEffect([
      { rule: 'J3', kind: 'highlightGrammar', grammarIds, target: 'P5' },
    ])
    expect(effect.highlightGrammarIds).toEqual(['G1', 'G2'])
    grammarIds.push('G3')
    expect(effect.highlightGrammarIds).toEqual(['G1', 'G2'])
  })

  it('J4 / J5 / J6 → 对应开关', () => {
    const effect: ReturnType<typeof toStudyEffect> = toStudyEffect([
      { rule: 'J4', kind: 'promptGraph', target: 'P6' },
      { rule: 'J5', kind: 'showConjugation', target: 'P3' },
      { rule: 'J6', kind: 'showRelated', target: 'P3' },
    ])
    expect(effect.promptGraph).toBe(true)
    expect(effect.showConjugation).toBe(true)
    expect(effect.showRelated).toBe(true)
  })

  it('多决策合并', () => {
    const decisions: JumpDecision[] = [
      { rule: 'J5', kind: 'showConjugation', target: 'P3' },
      { rule: 'J6', kind: 'showRelated', target: 'P3' },
    ]
    const effect = toStudyEffect(decisions)
    expect(effect.showConjugation).toBe(true)
    expect(effect.showRelated).toBe(true)
    expect(effect.autoDetail).toBe(false)
  })
})

describe('jumpService · detailSheetModeFor 优先级', () => {
  it('J1 优先于 J2 → auto', () => {
    expect(
      detailSheetModeFor({
        ...emptyStudyEffect(),
        autoDetail: true,
        promptDetail: true,
      }),
    ).toBe('auto')
  })

  it('仅 J2 → prompt', () => {
    expect(
      detailSheetModeFor({ ...emptyStudyEffect(), promptDetail: true }),
    ).toBe('prompt')
  })

  it('无浮层命中 → null', () => {
    expect(detailSheetModeFor(emptyStudyEffect())).toBeNull()
  })
})
