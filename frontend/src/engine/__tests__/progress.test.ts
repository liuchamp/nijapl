import { describe, expect, it } from 'vitest'

import { NO_CONTENT } from '../../constants/srs.js'
import type { Module, Stage, Word } from '../../types/domain.js'
import type { Progress } from '../../types/progress.js'
import {
  moduleCompletion,
  overallCompletion,
  stageCompletion,
  wordCompletion,
} from '../progress.js'
import { initialProgress } from '../srs.js'

function mastered(id: string): Progress {
  return { ...initialProgress(id), state: '已掌握', seen: true }
}

function makeWord(id: string, stageId: string, moduleId: string): Word {
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

const stages: Stage[] = [
  {
    id: 's1',
    name: 'N5 基础期',
    order: 1,
    weekRange: { start: 1, end: 6 },
    hasContent: true,
    source: 'seed',
  },
  {
    id: 's4',
    name: '冲刺期',
    order: 4,
    weekRange: { start: 23, end: 26 },
    hasContent: false,
    source: 'seed',
  },
]
const modules: Module[] = [
  { id: 'm01', stageId: 's1', name: '模块一', wordCount: 2, source: 'seed' },
]
const words: Word[] = [
  makeWord('w-01', 's1', 'm01'),
  makeWord('w-02', 's1', 'm01'),
]

describe('progress · wordCompletion', () => {
  it('从未出现 → 0', () => {
    expect(wordCompletion(initialProgress('w-01'))).toBe(0)
  })

  it('已掌握 → 1', () => {
    expect(wordCompletion(mastered('w-01'))).toBe(1)
  })
})

describe('progress · moduleCompletion', () => {
  it('全部掌握 → 1', () => {
    const pm = { 'w-01': mastered('w-01'), 'w-02': mastered('w-02') }
    expect(moduleCompletion(words, pm)).toBe(1)
  })

  it('全部未学（无进度记录）→ 0', () => {
    expect(moduleCompletion(words, {})).toBe(0)
  })

  it('半掌握 → 0.5（误差 0）', () => {
    const pm = { 'w-01': mastered('w-01'), 'w-02': initialProgress('w-02') }
    expect(moduleCompletion(words, pm)).toBe(0.5)
  })

  it('空模块 → 0（无 NaN）', () => {
    const result = moduleCompletion([], {})
    expect(result).toBe(0)
    expect(Number.isNaN(result)).toBe(false)
  })
})

describe('progress · stageCompletion', () => {
  it('hasContent=false（冲刺期）→ NO_CONTENT，且无 NaN', () => {
    const sprint = stages[1]
    const result = stageCompletion(sprint, modules, words, {})
    expect(result).toBe(NO_CONTENT)
    expect(Number.isNaN(result)).toBe(false)
  })

  it('含词阶段全部掌握 → 1', () => {
    const pm = { 'w-01': mastered('w-01'), 'w-02': mastered('w-02') }
    expect(stageCompletion(stages[0], modules, words, pm)).toBe(1)
  })

  it('含词阶段无进度 → 0', () => {
    expect(stageCompletion(stages[0], modules, words, {})).toBe(0)
  })
})

describe('progress · overallCompletion', () => {
  it('忽略 hasContent=false 的阶段', () => {
    const pm = { 'w-01': mastered('w-01'), 'w-02': mastered('w-02') }
    // 仅 s1 参与 → 1；s4 被忽略而非拉低为 0.5
    expect(overallCompletion(stages, modules, words, pm)).toBe(1)
  })

  it('全部阶段无内容 → 0（无 NaN）', () => {
    const onlySprint: Stage[] = [stages[1]]
    const result = overallCompletion(onlySprint, modules, words, {})
    expect(result).toBe(0)
    expect(Number.isNaN(result)).toBe(false)
  })
})
