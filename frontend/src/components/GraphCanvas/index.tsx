import './index.css'
import { useMemo, useRef, useState } from 'react'
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
 * P6 知识图谱画布（原架构 §1.4 / §2.10 / T05 判据 3）。
 *
 * 渲染策略（与原 Lynx 实现逐条对应）：
 * - **背景**：静态 SVG（边 + 节点底圈），由纯函数 `toSvg` 生成；
 * - **前景节点**：绝对定位的 `<div>`，承载可点标签
 *   （词→P3 / 语法→P5 / 模块→P2）；
 * - **聚焦高亮**：`focusId` 命中时 `toSvg` 重算边色，非聚焦底圈降 `opacity`，
 *   前景节点同步降 `opacity`；
 * - **缩放**：外层 `transform: scale(k) translate(dx, dy)`（按钮驱动）；
 *   手势层同样**直接改 DOM style**（不触发每帧重渲染）。
 *
 * 迁移差异（Lynx → Web）：
 * - Lynx `<svg content={string}>`（整段字符串 → 单个原生 view，无子节点事件）改为
 *   Web 的 `dangerouslySetInnerHTML`。SVG 内容由内部纯函数生成（仅数字坐标 + 常量颜色，
 *   不含用户文本），无注入面；几何与视觉与原实现**完全一致**。
 * - `'main thread'` + `el.setStyleProperty()` → `el.style.transform`；
 *   拖拽位移单位由 `rpx` 改为 `px`（浏览器按 CSS 像素跟手，体验等价）。
 * - `catchtap` → `onClick` + `stopPropagation()`（节点点击不得冒泡到"点空白取消聚焦"）。
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

/** rpx → CSS 长度（`--rpx` 基准由 `App.css` 的 `:root` 定义）。 */
function rpx(value: number): string {
  return `calc(${value} * var(--rpx))`
}

/** P6 图谱画布。 */
export function GraphCanvas(props: GraphCanvasProps) {
  const { view, layout, focusId } = props
  const [zoom, setZoom] = useState(1)
  const [panX, setPanX] = useState(0)
  const [panY, setPanY] = useState(0)
  const radiusScale = props.radiusScale ?? DISPLAY_RADIUS_SCALE

  /** 手势期间直接改 DOM style，避免每帧 setState 重渲染（与原主线程策略一致）。 */
  const contentRef = useRef<HTMLDivElement | null>(null)
  /** 手势起始状态（原实现存在 `data-*` 属性上，Web 用 ref 更直接）。 */
  const gestureRef = useRef({ span: 0, scale: 1, x: 0, y: 0 })

  // 布局半径偏小（设计给的是 14/18/22），叠加显示缩放以便标签可读；
  // 位置（x/y）不变，仅放大节点半径，背景 SVG 与前景节点共用同一份。
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

  function onTouchStart(event: React.TouchEvent<HTMLDivElement>): void {
    const first = event.touches[0]
    if (first === undefined) {
      return
    }
    const second = event.touches[1]
    let span = 0
    if (second !== undefined) {
      const dx = second.clientX - first.clientX
      const dy = second.clientY - first.clientY
      span = Math.sqrt(dx * dx + dy * dy)
    }
    gestureRef.current = {
      span,
      scale: zoom,
      x: first.clientX,
      y: first.clientY,
    }
  }

  function onTouchMove(event: React.TouchEvent<HTMLDivElement>): void {
    const el = contentRef.current
    const first = event.touches[0]
    if (el === null || first === undefined) {
      return
    }
    const start = gestureRef.current
    const second = event.touches[1]
    let span = 0
    if (second !== undefined) {
      const dx = second.clientX - first.clientX
      const dy = second.clientY - first.clientY
      span = Math.sqrt(dx * dx + dy * dy)
    }
    let nextScale = start.scale
    if (start.span > 0 && span > 0) {
      nextScale = clampZoom(start.scale * (span / start.span))
    }
    // 浏览器按 CSS 像素跟手（原 Lynx 用 rpx，视觉等价）。
    const panDx = first.clientX - start.x
    const panDy = first.clientY - start.y
    el.style.transform = `scale(${nextScale}) translate(${panDx}px, ${panDy}px)`
  }

  function onTouchEnd(): void {
    // 手势结束同步回 React state，避免下次按钮点击时跳变。
    const el = contentRef.current
    if (el === null) {
      return
    }
    const match =
      /scale\(([-0-9.]+)\)\s*translate\(([-0-9.]+)px,\s*([-0-9.]+)px\)/.exec(
        el.style.transform,
      )
    if (match === null) {
      return
    }
    setZoom(clampZoom(Number(match[1])))
    setPanX(Number(match[2]))
    setPanY(Number(match[3]))
  }

  return (
    <div className="GraphCanvas">
      <div className="GraphCanvas-toolbar">
        <div
          className="GraphCanvas-tool"
          onClick={() => {
            setZoom((current) => clampZoom(current / ZOOM_STEP))
          }}
        >
          <span className="GraphCanvas-toolLabel">{STRINGS.graph.zoomOut}</span>
        </div>
        <div
          className="GraphCanvas-tool"
          onClick={() => {
            setZoom((current) => clampZoom(current * ZOOM_STEP))
          }}
        >
          <span className="GraphCanvas-toolLabel">{STRINGS.graph.zoomIn}</span>
        </div>
        <div
          className="GraphCanvas-tool"
          onClick={() => {
            setZoom(1)
            setPanX(0)
            setPanY(0)
          }}
        >
          <span className="GraphCanvas-toolLabel">{STRINGS.graph.reset}</span>
        </div>
      </div>

      <div className="GraphCanvas-viewport">
        <div
          className="GraphCanvas-outer"
          style={{
            width: rpx(layout.width),
            height: rpx(layout.height),
            transform: `scale(${zoom}) translate(${panX}px, ${panY}px)`,
          }}
          onClick={props.onBackgroundTap}
        >
          <div
            ref={contentRef}
            className="GraphCanvas-content"
            style={{
              width: rpx(layout.width),
              height: rpx(layout.height),
            }}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
          >
            <div
              className="GraphCanvas-svg"
              style={{
                width: rpx(layout.width),
                height: rpx(layout.height),
              }}
              // biome-ignore lint/security/noDangerouslySetInnerHtml: SVG 由内部纯函数 `toSvg` 生成（仅数字坐标 + 常量颜色），不含任何用户输入
              dangerouslySetInnerHTML={{ __html: svg }}
            />

            {displayNodes.map((node) => (
              <div
                key={node.id}
                className="GraphCanvas-node"
                style={{
                  left: rpx(node.x - node.r),
                  top: rpx(node.y - node.r),
                  width: rpx(node.r * 2),
                  height: rpx(node.r * 2),
                  backgroundColor: NODE_COLOR[node.kind],
                  opacity: focusId === null || focusId === node.id ? 1 : 0.35,
                }}
                onClick={(event) => {
                  // 原 `catchtap`：阻止冒泡到 outer 的"点空白取消聚焦"。
                  event.stopPropagation()
                  props.onNodeTap(node)
                }}
              >
                <span
                  className="GraphCanvas-nodeLabel"
                  style={{ fontSize: FONT.xs }}
                >
                  {node.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
