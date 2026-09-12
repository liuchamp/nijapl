import type { GraphNode, GraphView, LayoutResult } from '../../types/graph.js'

const COLOR_EDGE = '#c8ccd4'
const COLOR_EDGE_FOCUS = '#4c6ef5'
const COLOR_NODE_FILL = '#ffffff'
const COLOR_NODE_STROKE = '#4c6ef5'
const FOCUS_DIM_OPACITY = 0.35

/**
 * 由 {@link GraphView} + {@link LayoutResult} 生成 SVG 字符串（背景层）。
 *
 * - 边为静态 `<line>`；`focusId` 命中的边换高亮色。
 * - 节点为 `<circle>`；聚焦时其余节点降低不透明度。
 * - 纯函数：不依赖 DOM；空图返回空 SVG。
 */
export function toSvg(
  view: GraphView,
  layout: LayoutResult,
  focusId?: string,
): string {
  const width = layout.width
  const height = layout.height

  const nodeById = new Map<string, GraphNode>()
  for (const node of layout.nodes) {
    nodeById.set(node.id, node)
  }

  const parts: string[] = [
    `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">`,
  ]

  for (const edge of view.edges) {
    const from = nodeById.get(edge.fromId)
    const to = nodeById.get(edge.toId)
    if (from === undefined || to === undefined) {
      continue
    }
    const focused =
      focusId !== undefined &&
      (edge.fromId === focusId || edge.toId === focusId)
    const color = focused ? COLOR_EDGE_FOCUS : COLOR_EDGE
    parts.push(
      `<line x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}" stroke="${color}" stroke-width="2" />`,
    )
  }

  for (const node of layout.nodes) {
    const focused = node.id === focusId
    const stroke = focused ? COLOR_EDGE_FOCUS : COLOR_NODE_STROKE
    const opacity = focusId === undefined || focused ? 1 : FOCUS_DIM_OPACITY
    parts.push(
      `<circle cx="${node.x}" cy="${node.y}" r="${node.r}" fill="${COLOR_NODE_FILL}" stroke="${stroke}" stroke-width="2" opacity="${opacity}" />`,
    )
  }

  parts.push('</svg>')
  return parts.join('')
}
