import { describe, expect, it } from 'vitest'

import type { BuildData, Grammar, Word } from '../../../src/types/domain.js'
import { layout } from '../../../src/engine/graph/layout.js'
import { toSvg } from '../../../src/engine/graph/svg.js'
import {
  buildGrammarView,
  buildOverview,
  buildWordView,
} from '../../../src/engine/graph/view.js'

/** QA 独立验证 —— T02 `graph/view.ts` + `graph/svg.ts`（构造与渲染鲁棒性）。 */

function word(id: string, moduleId: string, related?: Word['related']): Word {
  return {
    id,
    kana: id,
    kanji: `漢${id}`,
    pos: '名詞',
    meaning: id,
    stageId: 's1',
    moduleId,
    source: 'seed',
    related,
  }
}
function grammar(id: string, stageId: string, related?: Grammar['related']): Grammar {
  return {
    id,
    pattern: `～${id}`,
    connection: 'c',
    scene: 's',
    week: 1,
    level: 'N5',
    stageId,
    source: 'seed',
    related,
  }
}

const data: BuildData = {
  stages: [
    { id: 's1', name: 'A', order: 1, weekRange: { start: 1, end: 6 }, hasContent: true },
    { id: 's2', name: 'B', order: 2, weekRange: { start: 7, end: 13 }, hasContent: true },
  ],
  modules: [
    { id: 'm1', stageId: 's1', name: 'M1', wordCount: 2 },
    { id: 'm2', stageId: 's2', name: 'M2', wordCount: 1 },
  ],
  words: [
    word('w1', 'm1', [{ fromId: 'w1', toId: 'w2', type: 'synonym' }]),
    word('w2', 'm1', [{ fromId: 'w2', toId: 'w1', type: 'synonym' }]),
    word('w3', 'm2'),
  ],
  grammars: [
    grammar('G1', 's1', [{ fromId: 'G1', toId: 'G2', type: 'synonym' }]),
    grammar('G2', 's1', [{ fromId: 'G2', toId: 'G1', type: 'synonym' }]),
  ],
  sentences: [
    {
      id: 'S1',
      ja: 'w1 と G1',
      zh: 'z',
      level: 'N5',
      source: 'seed',
      reviewStatus: 'approved',
      words: [{ sentenceId: 'S1', wordId: 'w1', surface: 'w1' }],
      grammars: [{ sentenceId: 'S1', grammarId: 'G1' }],
    },
  ],
}

function ids(v: { nodes: Array<{ id: string }> }): string[] {
  return v.nodes.map((n) => n.id)
}

describe('QA · graph/view 三视图构造', () => {
  it('overview：阶段按 order 排序 + 模块边指向所属阶段', () => {
    const v = buildOverview(data)
    expect(ids(v)).toEqual(['stage:s1', 'stage:s2', 'module:m1', 'module:m2'])
    expect(v.edges).toEqual(
      expect.arrayContaining([
        { fromId: 'stage:s1', toId: 'module:m1', type: 'contains' },
        { fromId: 'stage:s2', toId: 'module:m2', type: 'contains' },
      ]),
    )
  })

  it('word 视图：中心词 + 关联词 + 相关语法，节点去重', () => {
    const v = buildWordView(data.words[0], data)
    const nodeIds = ids(v)
    expect(nodeIds).toContain('word:w1')
    expect(nodeIds).toContain('word:w2') // 正向关联
    expect(nodeIds).toContain('grammar:G1') // 经例句关联
    expect(new Set(nodeIds).size).toBe(nodeIds.length) // 无重复节点
  })

  it('grammar 视图：中心语法 + 关系语法 + 涉及词，节点去重', () => {
    const v = buildGrammarView(data.grammars[0], data)
    const nodeIds = ids(v)
    expect(nodeIds).toContain('grammar:G1')
    expect(nodeIds).toContain('grammar:G2')
    expect(nodeIds).toContain('word:w1')
    expect(new Set(nodeIds).size).toBe(nodeIds.length)
  })

  it('孤立数据（无关联/无例句）不崩、仅中心节点', () => {
    const lonely = word('lonely', 'm1')
    const v = buildWordView(lonely, data)
    expect(ids(v)).toEqual(['word:lonely'])
  })
})

describe('QA · graph/svg 渲染鲁棒性', () => {
  it('空图 → 合法空 SVG，无 NaN', () => {
    const v = buildOverview({
      ...data,
      stages: [],
      modules: [],
    })
    const out = toSvg(v, layout(v, { width: 100, height: 100 }))
    expect(out).toContain('<svg')
    expect(out).toContain('</svg>')
    expect(out).not.toContain('NaN')
  })

  it('聚焦时输出高亮边/降透明度，且坐标无 NaN', () => {
    const v = buildOverview(data)
    const l = layout(v, { width: 320, height: 320 })
    const out = toSvg(v, l, 'stage:s1')
    expect(out).not.toContain('NaN')
    expect(out).toContain('<line')
    expect(out).toContain('<circle')
    expect(out).toContain('opacity="0.35"') // 非聚焦节点降透明
  })
})
