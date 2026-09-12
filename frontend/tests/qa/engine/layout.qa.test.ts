import { describe, expect, it } from 'vitest'
import { layout } from '../../../src/engine/graph/layout.js'
import type {
  GraphEdge,
  GraphNode,
  GraphView,
} from '../../../src/types/graph.js'

/** QA 独立验证 —— T02 `graph/layout.ts`（确定性 + 边界不崩 + 无 NaN 坐标）。 */

const CONFIG = { width: 320, height: 480, padding: 40 }

function node(id: string, r = 14): GraphNode {
  return { id, kind: 'word', label: id, x: 0, y: 0, r }
}
function edge(from: string, to: string): GraphEdge {
  return { fromId: from, toId: to, type: 'x' }
}
function view(nodes: GraphNode[], edges: GraphEdge[] = []): GraphView {
  return { mode: 'word', nodes, edges }
}
function assertFinite(result: ReturnType<typeof layout>): void {
  for (const n of result.nodes) {
    expect(Number.isFinite(n.x), `${n.id}.x`).toBe(true)
    expect(Number.isFinite(n.y), `${n.id}.y`).toBe(true)
    expect(Number.isFinite(n.r), `${n.id}.r`).toBe(true)
  }
  expect(Number.isFinite(result.width)).toBe(true)
  expect(Number.isFinite(result.height)).toBe(true)
}

describe('QA · layout 确定性', () => {
  it('相同输入 → 逐字节相同的坐标（重复 5 次）', () => {
    const v = view(
      [node('a'), node('b'), node('c'), node('d'), node('e')],
      [edge('a', 'b'), edge('c', 'd')],
    )
    const first = layout(v, CONFIG)
    for (let i = 0; i < 5; i += 1) {
      expect(layout(v, CONFIG).nodes).toEqual(first.nodes)
    }
    assertFinite(first)
  })

  it('边数组为浅拷贝（不复用入参引用）', () => {
    const edges = [edge('a', 'b')]
    const v = view([node('a'), node('b')], edges)
    const result = layout(v, CONFIG)
    expect(result.edges).toEqual(edges)
    expect(result.edges[0]).not.toBe(edges[0])
  })

  it('不修改入参 view', () => {
    const v = view([node('a'), node('b')], [edge('a', 'b')])
    const snapshot = JSON.stringify(v)
    layout(v, CONFIG)
    expect(JSON.stringify(v)).toBe(snapshot)
  })
})

describe('QA · layout 边界（不崩 / 无 NaN）', () => {
  it('空图 → 空节点，保留画布尺寸', () => {
    const r = layout(view([]), CONFIG)
    expect(r.nodes).toEqual([])
    expect(r.width).toBe(320)
    expect(r.height).toBe(480)
    assertFinite(r)
  })

  it('单节点 → 置于画布正中', () => {
    const r = layout(view([node('only')]), CONFIG)
    expect(r.nodes).toHaveLength(1)
    expect(r.nodes[0]).toMatchObject({ x: 160, y: 240 })
    assertFinite(r)
  })

  it('孤立节点（无边）→ 仍得到有限坐标', () => {
    const r = layout(
      view([node('a'), node('b'), node('c')], [edge('a', 'b')]),
      CONFIG,
    )
    expect(r.nodes).toHaveLength(3)
    assertFinite(r)
  })

  it('重复边 → 不崩，边数保持', () => {
    const r = layout(
      view([node('a'), node('b')], [edge('a', 'b'), edge('a', 'b')]),
      CONFIG,
    )
    expect(r.edges).toHaveLength(2)
    assertFinite(r)
  })

  it('退化画布尺寸（0×0 / 负值）→ 无 NaN，坐标有限', () => {
    for (const cfg of [
      { width: 0, height: 0 },
      { width: -100, height: -50 },
      { width: 0, height: 480 },
    ]) {
      const r = layout(view([node('a'), node('b'), node('c')]), cfg)
      expect(r.width).toBe(Math.max(0, Math.round(cfg.width)))
      expect(r.height).toBe(Math.max(0, Math.round(cfg.height)))
      assertFinite(r)
    }
  })

  it('节点 r<=0 时回落默认半径（>0）', () => {
    const r = layout(view([node('a', 0), node('b', -5)]), CONFIG)
    for (const n of r.nodes) expect(n.r).toBeGreaterThan(0)
  })

  it('大数量节点（100）坐标全部有限', () => {
    const nodes = Array.from({ length: 100 }, (_, i) => node(`n${i}`))
    const r = layout(view(nodes), CONFIG)
    expect(r.nodes).toHaveLength(100)
    assertFinite(r)
  })

  it('baseRadius 显式提供时被采用（坐标不越界 NaN）', () => {
    const r = layout(view([node('a'), node('b')]), {
      ...CONFIG,
      baseRadius: 100,
    })
    assertFinite(r)
  })
})
