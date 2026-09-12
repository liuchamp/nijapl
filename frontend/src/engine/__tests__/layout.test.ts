import { describe, expect, it } from 'vitest'

import type { GraphNode, GraphView } from '../../types/graph.js'
import { layout } from '../graph/layout.js'

const CONFIG = { width: 320, height: 480, padding: 40 }

function node(id: string): GraphNode {
  return { id, kind: 'word', label: id, x: 0, y: 0, r: 14 }
}

describe('layout · 确定性', () => {
  const view: GraphView = {
    mode: 'word',
    nodes: [node('a'), node('b'), node('c'), node('d')],
    edges: [{ fromId: 'a', toId: 'b', type: 'x' }],
  }

  it('相同输入 → 相同坐标', () => {
    const first = layout(view, CONFIG)
    const second = layout(view, CONFIG)
    expect(second.nodes).toEqual(first.nodes)
    expect(second.edges).toEqual(first.edges)
  })

  it('不改动入参 view', () => {
    const snapshot = JSON.stringify(view)
    layout(view, CONFIG)
    expect(JSON.stringify(view)).toBe(snapshot)
  })
})

describe('layout · 边界', () => {
  it('空图不崩，返回空节点', () => {
    const result = layout({ mode: 'overview', nodes: [], edges: [] }, CONFIG)
    expect(result.nodes).toHaveLength(0)
    expect(result.width).toBe(320)
    expect(result.height).toBe(480)
  })

  it('单节点置于画布中心', () => {
    const result = layout(
      { mode: 'overview', nodes: [node('only')], edges: [] },
      CONFIG,
    )
    expect(result.nodes).toHaveLength(1)
    expect(result.nodes[0].x).toBe(160)
    expect(result.nodes[0].y).toBe(240)
  })

  it('保留边数据', () => {
    const edges = [{ fromId: 'a', toId: 'b', type: 'x' }]
    const result = layout(
      { mode: 'word', nodes: [node('a'), node('b')], edges },
      CONFIG,
    )
    expect(result.edges).toEqual(edges)
  })
})
