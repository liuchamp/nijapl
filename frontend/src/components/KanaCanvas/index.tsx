import { useCallback, useEffect, useRef, useState } from 'react'
import { KANA_CANVAS_GRID } from '../../constants/kana.js'
import { STRINGS } from '../../constants/strings.js'
import { COLORS } from '../../constants/theme.js'

/**
 * 描红画布（K1 段④ / 设计 §7.5、§10.3）。
 *
 * **v1 只描红，不做笔顺动画**：Q2 裁决——笔顺数据无可靠来源，
 * 与其画一套猜的笔顺，不如把「描 + 默」做扎实。`Kana.strokePaths` 字段已预留，
 * 后续补数据后本组件的改动点是「按 path 逐笔描画」，不需要改调用方。
 *
 * 分层（关键）：
 * - **底字是 DOM `<span>`，不是 canvas**——默写 / 偷看只是改它的 `opacity`，
 *   不需要重绘画布；若把底字画进 canvas，每次书写路径变化都要连带重绘底字与田字格。
 * - **田字格与笔迹共用一块 canvas**：清空 = `clearRect` + 重画田字格。
 *
 * 判定归属：本组件**不做**手写识别（§10.3）——写对没写对由用户点三档自评决定。
 */

interface KanaCanvasProps {
  /** 当前书写体系的目标字（平假名或片假名）。 */
  char: string
  /** 默写态：遮盖底字，凭记忆书写。 */
  memoryMode: boolean
  /** 「偷看一眼」揭示中（仅默写态有意义）。 */
  peekVisible: boolean
  onToggleMemory(): void
  onPeek(): void
}

/** 画田字格（横竖各 `KANA_CANVAS_GRID` 条等分线）。 */
function drawGrid(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
): void {
  ctx.clearRect(0, 0, width, height)
  ctx.strokeStyle = COLORS.border
  ctx.lineWidth = 1
  for (let i = 1; i <= KANA_CANVAS_GRID; i += 1) {
    const x = (width * i) / (KANA_CANVAS_GRID + 1)
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, height)
    ctx.stroke()
    const y = (height * i) / (KANA_CANVAS_GRID + 1)
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(width, y)
    ctx.stroke()
  }
}

/** 底字层公共样式（原 `.KanaCanvas-guide`：绝对定位铺满 + `line-height:1` + 半透明底字）。 */
const GUIDE_BASE =
  'KanaCanvas-guide absolute inset-0 flex flex-row items-center justify-center text-[calc(200*var(--rpx))] leading-none text-text-muted select-none pointer-events-none'

/** 按钮公共样式（原 `.KanaCanvas-btn`）；变体只覆盖背景 / 透明度。 */
const BTN_BASE =
  'KanaCanvas-btn cursor-pointer select-none flex flex-row items-center justify-center flex-1 py-xs rounded-pill'

/** 描红画布。 */
export function KanaCanvas(props: KanaCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  /** 当前绘制笔画是否进行中（用 ref 而非 state：绘制热路径不该触发重渲染）。 */
  const drawingRef = useRef(false)
  /** 画布是否已有笔迹（决定「清空」按钮是否可点）。 */
  const [hasInk, setHasInk] = useState(false)

  /** 按容器实际尺寸（含 DPR）重建画布并重画田字格。 */
  const resetCanvas = useCallback((): void => {
    const canvas = canvasRef.current
    if (canvas === null) {
      return
    }
    const rect = canvas.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) {
      return
    }
    const dpr = window.devicePixelRatio > 0 ? window.devicePixelRatio : 1
    canvas.width = Math.round(rect.width * dpr)
    canvas.height = Math.round(rect.height * dpr)
    const ctx = canvas.getContext('2d')
    if (ctx === null) {
      return
    }
    // 用 setTransform 把坐标系搬回 CSS 像素，后续 lineWidth / 坐标都按 CSS 像素思考。
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    drawGrid(ctx, rect.width, rect.height)
    setHasInk(false)
  }, [])

  // 换字 / 尺寸变化都重建画布（换字后旧笔迹必须消失，否则上一个音的笔画会叠在新字上）。
  useEffect(() => {
    resetCanvas()
    const onResize = (): void => {
      resetCanvas()
    }
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
    }
  }, [props.char, resetCanvas])

  /** 取指针在画布内的 CSS 像素坐标。 */
  function pointOf(event: React.PointerEvent<HTMLCanvasElement>): {
    x: number
    y: number
  } {
    const rect = event.currentTarget.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }

  function onPointerDown(event: React.PointerEvent<HTMLCanvasElement>): void {
    const ctx = canvasRef.current?.getContext('2d')
    if (ctx === null || ctx === undefined) {
      return
    }
    const rect = event.currentTarget.getBoundingClientRect()
    ctx.lineWidth = Math.max(4, rect.width * 0.02)
    ctx.strokeStyle = COLORS.primary
    const point = pointOf(event)
    ctx.beginPath()
    ctx.moveTo(point.x, point.y)
    // 单点也要落墨：只点一下不拖动时，用户期望看到一个点。
    ctx.lineTo(point.x, point.y)
    ctx.stroke()
    drawingRef.current = true
    setHasInk(true)
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function onPointerMove(event: React.PointerEvent<HTMLCanvasElement>): void {
    if (!drawingRef.current) {
      return
    }
    const ctx = canvasRef.current?.getContext('2d')
    if (ctx === null || ctx === undefined) {
      return
    }
    const point = pointOf(event)
    ctx.lineTo(point.x, point.y)
    ctx.stroke()
  }

  function onPointerUp(event: React.PointerEvent<HTMLCanvasElement>): void {
    if (!drawingRef.current) {
      return
    }
    drawingRef.current = false
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  // 默写态下底字默认被遮盖；「偷看」只临时揭示（恢复由服务层计时，本组件不碰计时器）。
  const guideHidden = props.memoryMode && !props.peekVisible
  const guideClass = guideHidden
    ? `${GUIDE_BASE} KanaCanvas-guide--hidden opacity-0`
    : props.memoryMode
      ? `${GUIDE_BASE} KanaCanvas-guide--peek opacity-60`
      : `${GUIDE_BASE} opacity-45`

  return (
    <div className="KanaCanvas flex flex-col w-full">
      <div className="KanaCanvas-board relative w-full h-[calc(320*var(--rpx))] bg-surface-alt rounded-md overflow-hidden">
        <span className={guideClass}>{props.char}</span>
        <canvas
          ref={canvasRef}
          className="KanaCanvas-surface absolute top-0 left-0 w-full h-full cursor-crosshair touch-none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
      </div>

      <span className="KanaCanvas-hint mt-xs text-xs text-text-muted">
        {STRINGS.kana.writingHint}
      </span>

      <div className="KanaCanvas-actions flex flex-row items-center gap-sm w-full mt-sm">
        <div
          className={
            hasInk
              ? `${BTN_BASE} KanaCanvas-btn--on bg-primary-soft`
              : `${BTN_BASE} KanaCanvas-btn--disabled bg-surface-alt opacity-45`
          }
          onClick={() => {
            if (hasInk) {
              resetCanvas()
            }
          }}
        >
          <span className="KanaCanvas-btnLabel text-xs text-text">
            {STRINGS.kana.clearCanvas}
          </span>
        </div>

        <div
          className={`${BTN_BASE} bg-surface-alt`}
          onClick={props.onToggleMemory}
        >
          <span className="KanaCanvas-btnLabel text-xs text-text">
            {props.memoryMode
              ? `${STRINGS.kana.memoryMode}·${STRINGS.kana.memoryOn}`
              : `${STRINGS.kana.memoryMode}·${STRINGS.kana.memoryOff}`}
          </span>
        </div>

        {props.memoryMode ? (
          <div
            className={`${BTN_BASE} KanaCanvas-btn--peek bg-primary-soft`}
            onClick={props.onPeek}
          >
            <span className="KanaCanvas-btnLabel text-xs text-text">
              {STRINGS.kana.peek}
            </span>
          </div>
        ) : null}
      </div>

      {props.memoryMode ? (
        <span className="KanaCanvas-peekHint mt-xs text-xs text-text-muted">
          {STRINGS.kana.peekHint}
        </span>
      ) : null}
    </div>
  )
}
