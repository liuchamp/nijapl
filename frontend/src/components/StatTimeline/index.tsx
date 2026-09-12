import './index.css'

/**
 * 学习统计横条列表（架构 §2.10 / P9）。
 *
 * 每行：标签 + 进度条（`ratio` 0..1）+ 数值文案。纯展示组件，
 * 数据由页面（`MePage`）从 store / 仓库派生后传入。
 */

/** 单行统计项。 */
export interface StatRow {
  /** 行标签（唯一，作为 key）。 */
  label: string
  /** 原始数值（用于占比参考）。 */
  value: number
  /** 展示文案（如 `12 / 20`）。 */
  display: string
  /** 进度条占比 0..1（越界自动收敛）。 */
  ratio: number
}

interface StatTimelineProps {
  rows: StatRow[]
}

function clamp01(value: number): number {
  if (Number.isNaN(value)) {
    return 0
  }
  return Math.min(Math.max(value, 0), 1)
}

/** 学习统计横条列表。 */
export function StatTimeline(props: StatTimelineProps) {
  return (
    <div className="StatTimeline">
      {props.rows.map((row) => (
        <div key={row.label} className="StatTimeline-row">
          <span className="StatTimeline-label">{row.label}</span>
          <div className="StatTimeline-track">
            <div
              className="StatTimeline-fill"
              style={{ width: `${Math.round(clamp01(row.ratio) * 100)}%` }}
            />
          </div>
          <span className="StatTimeline-value">{row.display}</span>
        </div>
      ))}
    </div>
  )
}
