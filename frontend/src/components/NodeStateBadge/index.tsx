import type { NodeState } from '../../constants/srs.js'
import { STRINGS } from '../../constants/strings.js'
import { COLORS, RADIUS, SPACING } from '../../constants/theme.js'

/**
 * 五态徽章（架构 §2.10）：未解锁 / 未学 / 学习中 / 已掌握 / 需强化。
 *
 * 颜色语义：未解锁与未学为中性灰；学习中为告警黄；已掌握为成功绿；需强化为危险红。
 * 文案统一取自 `STRINGS.nodeState`（唯一文案入口）。
 */

export interface NodeStateStyle {
  color: string
  background: string
}

/**
 * 五态配色表（唯一来源）。
 *
 * 导出理由：K 域音表的「每格右上角五态小圆点」（设计 §5.1）只需要**颜色语义**，
 * 不需要徽章文本。导出本表让圆点与其后徽章共用同一份配色，
 * 避免在 `KanaTable` 里再抄一份颜色映射（两处漂移后「黄=学习中」的口径会不一致）。
 */
export const STATE_STYLE: Record<NodeState, NodeStateStyle> = {
  locked: { color: COLORS.textMuted, background: 'rgba(154, 164, 196, 0.14)' },
  未学: { color: COLORS.textMuted, background: 'rgba(154, 164, 196, 0.14)' },
  学习中: { color: COLORS.warning, background: 'rgba(240, 180, 74, 0.16)' },
  模糊: { color: COLORS.warning, background: 'rgba(240, 180, 74, 0.12)' },
  已掌握: { color: COLORS.success, background: 'rgba(57, 196, 122, 0.16)' },
  需强化: { color: COLORS.danger, background: 'rgba(255, 95, 109, 0.16)' },
}

interface NodeStateBadgeProps {
  state: NodeState
}

/** 节点五态徽章。 */
export function NodeStateBadge(props: NodeStateBadgeProps) {
  const style = STATE_STYLE[props.state]
  return (
    <div
      className="NodeStateBadge"
      style={{
        backgroundColor: style.background,
        borderRadius: RADIUS.pill,
        paddingLeft: SPACING.sm,
        paddingRight: SPACING.sm,
        paddingTop: SPACING.xs,
        paddingBottom: SPACING.xs,
      }}
    >
      <span className="NodeStateBadge-label" style={{ color: style.color }}>
        {STRINGS.nodeState[props.state]}
      </span>
    </div>
  )
}
