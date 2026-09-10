import './index.css'
import { useMemo, useState } from '@lynx-js/react'
import { STRINGS } from '../../constants/strings.js'
import { COLORS, FONT } from '../../constants/theme.js'
import { toSvg } from '../../engine/graph/svg.js'
import type {
  GraphNode,
  GraphNodeKind,
  GraphView,
  LayoutResult,
} from '../../types/graph.js'

/**
 * P6 知识图谱画布（架构 §1.4 / §2.10 / T05 判据 3）。
 *
 * 渲染策略：
 * - **背景**：静态 `<svg content={string}>`，只画边 + 节点底圈（`toSvg`，纯函数）；
 * - **前景节点**：绝对定位的 `<view>`（每个节点一个），承载可点标签，
 *   `bindtap` 可点击（词→P3 / 语法→P5 / 模块→P2）；
 * - **聚焦高亮**：`focusId` 命中时 `toSvg` 重算边色并对非聚焦底圈降 opacity，
 *   前景节点同步降 opacity；
 * - **缩放**：外层 `transform: scale(k) translate(dx,dy)`（按钮驱动）；
 *   手势层为**主线程**函数（`'main thread'`），直接对该元素 `setStyleProperty`
 *   做双指缩放 / 拖拽 —— 该函数内**禁止调用任何 Native Module**（§8.5 红线）。
 */

interface GraphCanvasProps {
  view: GraphView
  layout: LayoutResult
  focusId: string | null
  /** 节点半径显示放大系数（缺省 {@link DISPLAY_RADIUS_SCALE}）。 */
  radiusScale?: number
  /** 点节点（聚焦 / 进入）。 */
  onNodeTap: (node: GraphNode) => void
  /** 点空白（取消聚焦）。 */
  onBackgroundTap: () => void
}

/** 节点半径显示放大系数（设计半径偏小，放大以便标签可读）。 */
const DISPLAY_RADIUS_SCALE = 2.4

/** 节点种类 → 主题色。 */
const NODE_COLOR: Record<GraphNodeKind, string> = {
  stage: COLORS.warning,
  module: COLORS.primary,
  word: COLORS.success,
  grammar: COLORS.danger,
}

const MIN_ZOOM = 0.5
const MAX_ZOOM = 3
const ZOOM_STEP = 1.25

function clampZoom(value: number): number {
  if (Number.isNaN(value)) {
    return 1
  }
  return Math.min(Math.max(value, MIN_ZOOM), MAX_ZOOM)
}

/** P6 图谱画布。 */
export function GraphCanvas(props: GraphCanvasProps) {
  const { view, layout, focusId } = props
  const [zoom, setZoom] = useState(1)
  const [panX, setPanX] = useState(0)
  const [panY, setPanY] = useState(0)
  const radiusScale = props.radiusScale ?? DISPLAY_RADIUS_SCALE

  // 布局半径偏小（设计给的是 14/18/22），叠加显示缩放以便标签可读；
  // 位置（x/y）不变，仅放大节点半径，背景 SVG 与前景 view 共用同一份。
  const displayNodes = useMemo(
    () =>
      layout.nodes.map((node) => ({
        ...node,
        r: Math.round(node.r * radiusScale),
      })),
    [layout, radiusScale],
  )
  const displayLayout = useMemo<LayoutResult>(
    () => ({ ...layout, nodes: displayNodes }),
    [layout, displayNodes],
  )

  const svg = useMemo(
    () => toSvg(view, displayLayout, focusId ?? undefined),
    [view, displayLayout, focusId],
  )

  return (
    <view className="GraphCanvas">
      <view className="GraphCanvas-toolbar">
        <view
          className="GraphCanvas-tool"
          catchtap={() => {
            setZoom((current) => clampZoom(current / ZOOM_STEP))
          }}
        >
          <text className="GraphCanvas-toolLabel">{STRINGS.graph.zoomOut}</text>
        </view>
        <view
          className="GraphCanvas-tool"
          catchtap={() => {
            setZoom((current) => clampZoom(current * ZOOM_STEP))
          }}
        >
          <text className="GraphCanvas-toolLabel">{STRINGS.graph.zoomIn}</text>
        </view>
        <view
          className="GraphCanvas-tool"
          catchtap={() => {
            setZoom(1)
            setPanX(0)
            setPanY(0)
          }}
        >
          <text className="GraphCanvas-toolLabel">{STRINGS.graph.reset}</text>
        </view>
      </view>

      <view className="GraphCanvas-viewport">
        <view
          className="GraphCanvas-outer"
          style={{
            width: `${layout.width}rpx`,
            height: `${layout.height}rpx`,
            transform: `scale(${zoom}) translate(${panX}rpx, ${panY}rpx)`,
          }}
          bindtap={props.onBackgroundTap}
        >
          <view
            className="GraphCanvas-content"
            style={{
              width: `${layout.width}rpx`,
              height: `${layout.height}rpx`,
              transform: 'scale(1) translate(0rpx, 0rpx)',
            }}
            main-thread:bindtouchstart={(event) => {
              'main thread'
              const el = event.currentTarget
              const first = event.touches[0]
              if (first === undefined) {
                return
              }
              const second = event.touches[1]
              let span = 0
              if (second !== undefined) {
                const ddx = second.clientX - first.clientX
                const ddy = second.clientY - first.clientY
                span = Math.sqrt(ddx * ddx + ddy * ddy)
              }
              const rawScale = Number(el.getAttribute('data-cur-scale') ?? '1')
              const curScale = rawScale > 0 ? rawScale : 1
              el.setAttribute('data-gesture-span', span)
              el.setAttribute('data-gesture-scale', curScale)
              el.setAttribute('data-gesture-x', first.clientX)
              el.setAttribute('data-gesture-y', first.clientY)
            }}
            main-thread:bindtouchmove={(event) => {
              'main thread'
              const el = event.currentTarget
              const first = event.touches[0]
              if (first === undefined) {
                return
              }
              const startScale = Number(
                el.getAttribute('data-gesture-scale') ?? '1',
              )
              const startSpan = Number(
                el.getAttribute('data-gesture-span') ?? '0',
              )
              const startX = Number(
                el.getAttribute('data-gesture-x') ?? `${first.clientX}`,
              )
              const startY = Number(
                el.getAttribute('data-gesture-y') ?? `${first.clientY}`,
              )
              const second = event.touches[1]
              let span = 0
              if (second !== undefined) {
                const ddx = second.clientX - first.clientX
                const ddy = second.clientY - first.clientY
                span = Math.sqrt(ddx * ddx + ddy * ddy)
              }
              let nextScale = startScale
              if (startSpan > 0 && span > 0) {
                nextScale = startScale * (span / startSpan)
              }
              if (nextScale < 0.5) {
                nextScale = 0.5
              }
              if (nextScale > 3) {
                nextScale = 3
              }
              const panDx = first.clientX - startX
              const panDy = first.clientY - startY
              el.setAttribute('data-cur-scale', nextScale)
              el.setStyleProperty(
                'transform',
                `scale(${nextScale}) translate(${panDx}rpx, ${panDy}rpx)`,
              )
            }}
            main-thread:bindtouchend={(event) => {
              'main thread'
              const el = event.currentTarget
              const rawScale = Number(el.getAttribute('data-cur-scale') ?? '1')
              el.setAttribute('data-gesture-span', 0)
              el.setAttribute('data-gesture-scale', rawScale > 0 ? rawScale : 1)
            }}
          >
            <svg
              className="GraphCanvas-svg"
              content={svg}
              style={{
                width: `${layout.width}rpx`,
                height: `${layout.height}rpx`,
              }}
            />

            {displayNodes.map((node) => (
              <view
                key={node.id}
                className="GraphCanvas-node"
                style={{
                  left: `${node.x - node.r}rpx`,
                  top: `${node.y - node.r}rpx`,
                  width: `${node.r * 2}rpx`,
                  height: `${node.r * 2}rpx`,
                  backgroundColor: NODE_COLOR[node.kind],
                  opacity: focusId === null || focusId === node.id ? 1 : 0.35,
                }}
                catchtap={() => props.onNodeTap(node)}
              >
                <text
                  className="GraphCanvas-nodeLabel"
                  style={{ fontSize: FONT.xs }}
                >
                  {node.label}
                </text>
              </view>
            ))}
          </view>
        </view>
      </view>
    </view>
  )
}
