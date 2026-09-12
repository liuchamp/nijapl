/**
 * 设计令牌唯一来源（架构 §8.4 / §8.2）。
 *
 * - CSS 变量写在 `src/App.css` 的 `:root`（`--color-*` / `--space-*` / `--font-*` / `--radius-*`）；
 * - 本文件提供 **JS 侧同名常量**，供内联 `style` 复用（Lynx 样式 = 内联 style + className）。
 *
 * 单位统一使用 `rpx`（响应式），颜色使用 `#RRGGBB` / `rgba()`。
 */

/** 颜色令牌。 */
export const COLORS = {
  bg: '#0b1020',
  surface: '#151b30',
  surfaceAlt: '#1d2540',
  text: '#f5f7ff',
  textMuted: '#9aa4c4',
  primary: '#5b8cff',
  primarySoft: 'rgba(91, 140, 255, 0.16)',
  success: '#39c47a',
  warning: '#f0b44a',
  danger: '#ff5f6d',
  border: 'rgba(255, 255, 255, 0.12)',
} as const

/** 间距令牌。 */
export const SPACING = {
  xs: 'calc(8 * var(--rpx))',
  sm: 'calc(16 * var(--rpx))',
  md: 'calc(24 * var(--rpx))',
  lg: 'calc(32 * var(--rpx))',
  xl: 'calc(48 * var(--rpx))',
} as const

/** 字号令牌。 */
export const FONT = {
  xs: 'calc(20 * var(--rpx))',
  sm: 'calc(24 * var(--rpx))',
  md: 'calc(28 * var(--rpx))',
  lg: 'calc(36 * var(--rpx))',
  xl: 'calc(56 * var(--rpx))',
} as const

/** 圆角令牌。 */
export const RADIUS = {
  sm: 'calc(8 * var(--rpx))',
  md: 'calc(16 * var(--rpx))',
  lg: 'calc(24 * var(--rpx))',
  pill: 'calc(999 * var(--rpx))',
} as const

export type ColorToken = keyof typeof COLORS
export type SpacingToken = keyof typeof SPACING
export type FontToken = keyof typeof FONT
export type RadiusToken = keyof typeof RADIUS
