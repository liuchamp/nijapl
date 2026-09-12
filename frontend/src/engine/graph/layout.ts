import type {
  GraphNode,
  GraphView,
  LayoutConfig,
  LayoutResult,
} from '../../types/graph.js'

const DEFAULT_PADDING = 40
const DEFAULT_RADIUS = 16

/**
 * 纯计算布局：以画布中心为圆心做**径向**摆放。
 *
 * - 确定性：相同输入恒产出相同坐标（不使用随机数、不依赖 DOM / 时间）。
 * - 边界安全：空图返回空节点；单节点置于正中；不抛错。
 */
export function layout(view: GraphView, ctx: LayoutConfig): LayoutResult {
  const width = Math.max(0, Math.round(ctx.width))
  const height = Math.max(0, Math.round(ctx.height))
  const padding = ctx.padding ?? DEFAULT_PADDING
  const edges = view.edges.map((edge) => ({ ...edge }))
  const count = view.nodes.length

  if (count === 0) {
    return { nodes: [], edges, width, height }
  }

  const centerX = width / 2
  const centerY = height / 2

  if (count === 1) {
    const only = view.nodes[0]
    const node: GraphNode = {
      ...only,
      x: Math.round(centerX),
      y: Math.round(centerY),
      r: only.r > 0 ? only.r : DEFAULT_RADIUS,
    }
    return { nodes: [node], edges, width, height }
  }

  const autoRadius = Math.max(0, Math.min(width, height) / 2 - padding)
  const radius = ctx.baseRadius ?? autoRadius

  const nodes: GraphNode[] = view.nodes.map((node, index) => {
    const angle = (2 * Math.PI * index) / count - Math.PI / 2
    return {
      ...node,
      x: Math.round(centerX + radius * Math.cos(angle)),
      y: Math.round(centerY + radius * Math.sin(angle)),
      r: node.r > 0 ? node.r : DEFAULT_RADIUS,
    }
  })

  return { nodes, edges, width, height }
}
