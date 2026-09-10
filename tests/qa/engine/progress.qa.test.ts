import { describe, expect, it } from 'vitest'

import { NO_CONTENT } from '../../../src/constants/srs.js'
import type { Module, Stage, Word } from '../../../src/types/domain.js'
import type { Progress, SrsState } from '../../../src/types/progress.js'
import {
  moduleCompletion,
  overallCompletion,
  stageCompletion,
  wordCompletion,
} from '../../../src/engine/progress.js'
import { initialProgress } from '../../../src/engine/srs.js'

/** QA 独立验证 —— T02 `progress.ts`（三级完成度手算比对 + 无 NaN 边界）。 */

function word(id: string, stageId: string, moduleId: string): Word {
  return {
    id,
    kana: id,
    kanji: id,
    pos: '名詞',
    meaning: id,
    stageId,
    moduleId,
    source: 'seed',
  }
}

function withState(p: Progress, state: SrsState): Progress {
  return { ...p, state, seen: state !== '未学' }
}

describe('QA · wordCompletion 逐态权重', () => {
  const cases: Array<[SrsState, number]> = [
    ['未学', 0],
    ['学习中', 0.25],
    ['模糊', 0.5],
    ['需强化', 0.5],
    ['已掌握', 1],
  ]
  it('未出现过的词（seen=false）恒为 0', () => {
    expect(wordCompletion(initialProgress('w'))).toBe(0)
  })
  it.each(cases)('state=%s → %s', (state, expected) => {
    expect(wordCompletion(withState(initialProgress('w'), state))).toBe(expected)
  })
})

/**
 * 手算数据集：
 *   s1(hasContent) → m1 → [a, b]
 *   s2(hasContent) → m2 → [c]
 *   s4(冲刺, hasContent=false) → 无模块/无词
 * 进度：a=已掌握(1)，b=未学(0)，c=已掌握(1)
 *   moduleCompletion(m1) = (1+0)/2 = 0.5
 *   stageCompletion(s1)  = 0.5
 *   stageCompletion(s2)  = 1
 *   overall              = (0.5 + 1)/2 = 0.75
 */
const stages: Stage[] = [
  { id: 's1', name: 's1', order: 1, weekRange: { start: 1, end: 6 }, hasContent: true },
  { id: 's2', name: 's2', order: 2, weekRange: { start: 7, end: 13 }, hasContent: true },
  { id: 's4', name: 's4', order: 4, weekRange: { start: 23, end: 26 }, hasContent: false },
]
const modules: Module[] = [
  { id: 'm1', stageId: 's1', name: 'm1', wordCount: 2 },
  { id: 'm2', stageId: 's2', name: 'm2', wordCount: 1 },
]
const words: Word[] = [
  word('a', 's1', 'm1'),
  word('b', 's1', 'm1'),
  word('c', 's2', 'm2'),
]
const pm: Record<string, Progress> = {
  a: withState(initialProgress('a'), '已掌握'),
  b: initialProgress('b'),
  c: withState(initialProgress('c'), '已掌握'),
}

describe('QA · 三级完成度手算比对（误差必须为 0）', () => {
  it('moduleCompletion(m1)=0.5, moduleCompletion(m2)=1', () => {
    expect(moduleCompletion([words[0], words[1]], pm)).toBe(0.5)
    expect(moduleCompletion([words[2]], pm)).toBe(1)
  })

  it('stageCompletion(s1)=0.5, stageCompletion(s2)=1', () => {
    expect(stageCompletion(stages[0], modules, words, pm)).toBe(0.5)
    expect(stageCompletion(stages[1], modules, words, pm)).toBe(1)
  })

  it('overallCompletion=0.75（冲刺期被排除，非 0.5）', () => {
    expect(overallCompletion(stages, modules, words, pm)).toBe(0.75)
  })

  it('全部已掌握 → 各级均为 1', () => {
    const all: Record<string, Progress> = {
      a: withState(initialProgress('a'), '已掌握'),
      b: withState(initialProgress('b'), '已掌握'),
      c: withState(initialProgress('c'), '已掌握'),
    }
    expect(moduleCompletion([words[0], words[1]], all)).toBe(1)
    expect(stageCompletion(stages[0], modules, words, all)).toBe(1)
    expect(overallCompletion(stages, modules, words, all)).toBe(1)
  })

  it('全部未学 → 各级均为 0', () => {
    expect(moduleCompletion([words[0], words[1]], {})).toBe(0)
    expect(stageCompletion(stages[0], modules, words, {})).toBe(0)
    expect(overallCompletion(stages, modules, words, {})).toBe(0)
  })
})

describe('QA · 冲刺期（hasContent=false）与空集边界：绝不 NaN/Infinity', () => {
  it('冲刺期 → NO_CONTENT 哨兵', () => {
    const r = stageCompletion(stages[2], modules, words, pm)
    expect(r).toBe(NO_CONTENT)
    expect(Number.isNaN(r)).toBe(false)
  })

  it('overall 全部为冲刺期 → 0（无参与阶段）', () => {
    const r = overallCompletion([stages[2]], modules, words, pm)
    expect(r).toBe(0)
    expect(Number.isFinite(r)).toBe(true)
  })

  it('阶段下无模块 → 退化为按词条计算（无 NaN）', () => {
    const r = stageCompletion(stages[0], [], [words[0]], pm) // 仅 a=已掌握
    expect(r).toBe(1)
  })

  it('阶段下无模块且无词 → 0', () => {
    const r = stageCompletion(stages[1], [], [], pm)
    expect(r).toBe(0)
    expect(Number.isFinite(r)).toBe(true)
  })

  it('模块下无词 → 0', () => {
    expect(moduleCompletion([], pm)).toBe(0)
  })

  it('空阶段/空模块/空词整体调用均无 NaN', () => {
    const results = [
      overallCompletion([], [], [], {}),
      overallCompletion(stages, [], [], {}),
      stageCompletion(stages[0], [], [], {}),
      moduleCompletion([], {}),
    ]
    for (const r of results) {
      expect(Number.isNaN(r)).toBe(false)
      expect(Number.isFinite(r)).toBe(true)
    }
    expect(results[0]).toBe(0)
  })
})

describe('QA · progress 纯函数性', () => {
  it('不修改入参 progress map', () => {
    const snapshot = JSON.stringify(pm)
    moduleCompletion(words, pm)
    stageCompletion(stages[0], modules, words, pm)
    overallCompletion(stages, modules, words, pm)
    expect(JSON.stringify(pm)).toBe(snapshot)
  })
})
