/**
 * 手势判定（P2 左滑跳过 / 右滑上一张）。
 *
 * 纯函数抽取以便单测；事件绑定仍写在页面组件的 JSX 内（保留 ReactLynx 的事件类型推断）。
 */

/** 滑动方向判定结果。 */
export type SwipeDirection = 'left' | 'right' | 'none'

/** 主方向判定：纵向位移占比过大视为纵向滚动，不触发横向动作。 */
const MAX_VERTICAL_RATIO = 1

/**
 * 依位移判定滑动方向。
 *
 * - 纵向位移绝对值 >= 横向位移绝对值 → `none`（避免误触）；
 * - 横向向左且超过阈值 → `left`；
 * - 横向向右且超过阈值 → `right`；
 * - 其余 → `none`。
 *
 * @param dx 横向位移（右为正）
 * @param dy 纵向位移
 * @param threshold 触发阈值（像素），须为正
 */
export function classifySwipe(
  dx: number,
  dy: number,
  threshold: number,
): SwipeDirection {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) {
    return 'none'
  }
  const absX = Math.abs(dx)
  const absY = Math.abs(dy)
  if (absY >= absX * MAX_VERTICAL_RATIO && absY > 0) {
    return 'none'
  }
  if (absX < threshold) {
    return 'none'
  }
  return dx < 0 ? 'left' : 'right'
}
