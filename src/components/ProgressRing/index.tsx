import { COLORS } from '../../constants/theme.js'

/**
 * 今日目标进度环（架构 §2.10 / P0）。
 *
 * 实现说明：Lynx `<svg content={string}>` 为**静态整体渲染**（架构 F1），
 * 不依赖 DOM / canvas，也无需子节点事件；本组件用两段 `<circle>`（轨道 + 进度弧）
 * 生成 SVG 字符串，进度变化时字符串变化即触发重绘。
 */

interface ProgressRingProps {
  /** 进度 0..1（越界自动收敛）。 */
  value: number
  /** 直径（rpx）。 */
  size?: number
  /** 环宽（rpx）。 */
  stroke?: number
  /** 环下方文案；缺省显示百分比。 */
  label?: string
}

function clamp01(value: number): number {
  if (Number.isNaN(value)) {
    return 0
  }
  return Math.min(Math.max(value, 0), 1)
}

/** 生成进度环 SVG 字符串（纯函数）。 */
function buildRingSvg(progress: number, size: number, stroke: number): string {
  const radius = Math.max((size - stroke) / 2, 1)
  const circumference = 2 * Math.PI * radius
  const dash = circumference * progress
  const center = size / 2
  const arc = `<circle cx="${center}" cy="${center}" r="${radius}" fill="none" stroke="${COLORS.primary}" stroke-width="${stroke}" stroke-linecap="round" stroke-dasharray="${dash} ${circumference - dash}" transform="rotate(-90 ${center} ${center})" />`
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg"><circle cx="${center}" cy="${center}" r="${radius}" fill="none" stroke="${COLORS.surfaceAlt}" stroke-width="${stroke}" />${arc}</svg>`
}

/** 今日目标进度环。 */
export function ProgressRing(props: ProgressRingProps) {
  const progress = clamp01(props.value)
  const size = props.size ?? 160
  const stroke = props.stroke ?? 14
  const label = props.label ?? `${Math.round(progress * 100)}%`
  return (
    <view className="ProgressRing">
      <svg
        className="ProgressRing-svg"
        content={buildRingSvg(progress, size, stroke)}
        style={{ width: `${size}rpx`, height: `${size}rpx` }}
      />
      <text className="ProgressRing-label">{label}</text>
    </view>
  )
}
