import { COLORS } from '../../constants/theme.js'

/**
 * 今日目标进度环（架构 §2.10 / P0）。
 *
 * 迁移说明：原 Lynx 用 `<svg content={string}>`（整段字符串 → 单个原生 view，无子节点）。
 * Web 下改为**真正的 SVG DOM**（两个 `<circle>`：轨道 + 进度弧），几何计算与原实现逐字段一致
 * （半径 / 周长 / dasharray / 旋转原点均未改动），仅渲染方式变化。
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

/** 今日目标进度环。 */
export function ProgressRing(props: ProgressRingProps) {
  const progress = clamp01(props.value)
  const size = props.size ?? 160
  const stroke = props.stroke ?? 14
  const label = props.label ?? `${Math.round(progress * 100)}%`

  const radius = Math.max((size - stroke) / 2, 1)
  const circumference = 2 * Math.PI * radius
  const dash = circumference * progress
  const center = size / 2

  return (
    <div className="ProgressRing flex flex-col">
      <svg
        className="ProgressRing-svg"
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        xmlns="http://www.w3.org/2000/svg"
        style={{
          width: `calc(${size} * var(--rpx))`,
          height: `calc(${size} * var(--rpx))`,
        }}
      >
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={COLORS.surfaceAlt}
          strokeWidth={stroke}
        />
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={COLORS.primary}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference - dash}`}
          transform={`rotate(-90 ${center} ${center})`}
        />
      </svg>
      <span className="ProgressRing-label">{label}</span>
    </div>
  )
}
