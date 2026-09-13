/**
 * Icon 组件：品牌 18 个线性 SVG 图标（24×24 网格，2px round stroke，currentColor 默认）。
 *
 * 迁移说明（Lynx → Web）：原工程 18 个 SVG 图标未被任何页面引用（保真红线 §4），
 * 本组件首次接入，保持 `viewBox="0 0 24 24"`、`fill="none"`、`stroke="currentColor"`
 * 原始契约不变。颜色语义：`check` → Sage `#8FB89B`、`flame` → Sakura `#F5A8BC`，
 * 其余默认 `currentColor`（跟随文字色，品牌规范 §4）。
 */
import './index.css'

import audioSvg from '../../assets/icons/audio.svg?raw'
import bookSvg from '../../assets/icons/book.svg?raw'
import calendarSvg from '../../assets/icons/calendar.svg?raw'
import checkSvg from '../../assets/icons/check.svg?raw'
import chevronLeftSvg from '../../assets/icons/chevron-left.svg?raw'
import chevronRightSvg from '../../assets/icons/chevron-right.svg?raw'
import closeSvg from '../../assets/icons/close.svg?raw'
import flameSvg from '../../assets/icons/flame.svg?raw'
import graphSvg from '../../assets/icons/graph.svg?raw'
import homeSvg from '../../assets/icons/home.svg?raw'
import plusSvg from '../../assets/icons/plus.svg?raw'
import reviewSvg from '../../assets/icons/review.svg?raw'
import searchSvg from '../../assets/icons/search.svg?raw'
import settingsSvg from '../../assets/icons/settings.svg?raw'
import stagesSvg from '../../assets/icons/stages.svg?raw'
import starSvg from '../../assets/icons/star.svg?raw'
import studySvg from '../../assets/icons/study.svg?raw'
import trophySvg from '../../assets/icons/trophy.svg?raw'

/** 18 个品牌图标名称（与 `assets/icons/*.svg` 一一对应）。 */
export type IconName =
  | 'audio'
  | 'book'
  | 'calendar'
  | 'check'
  | 'chevron-left'
  | 'chevron-right'
  | 'close'
  | 'flame'
  | 'graph'
  | 'home'
  | 'plus'
  | 'review'
  | 'search'
  | 'settings'
  | 'stages'
  | 'star'
  | 'study'
  | 'trophy'

/** SVG 原文映射（`?raw` 导入，零运行时 fetch）。 */
const SVG_MAP: Record<IconName, string> = {
  audio: audioSvg,
  book: bookSvg,
  calendar: calendarSvg,
  check: checkSvg,
  'chevron-left': chevronLeftSvg,
  'chevron-right': chevronRightSvg,
  close: closeSvg,
  flame: flameSvg,
  graph: graphSvg,
  home: homeSvg,
  plus: plusSvg,
  review: reviewSvg,
  search: searchSvg,
  settings: settingsSvg,
  stages: stagesSvg,
  star: starSvg,
  study: studySvg,
  trophy: trophySvg,
}

/** 语义色例外（品牌规范 §4）：`check` → Sage、`flame` → Sakura。 */
const SEMANTIC_COLOR: Partial<Record<IconName, string>> = {
  check: '#8FB89B',
  flame: '#F5A8BC',
}

export interface IconProps {
  /** 图标名称（18 个品牌图标之一，或兼容旧用法的任意字符串）。 */
  name: IconName | string
  /** 尺寸：数字时渲染为 `calc(N * var(--rpx))`，字符串时直接透传（兼容旧用法）。默认 24。 */
  size?: number | string
  /** 显式颜色；未传时 `check`/`flame` 走语义色，其余 `currentColor`。 */
  color?: string
  /** 容器语义类名（兼容旧用法，如 TabBar 的 `.TabBar-icon`）。 */
  className?: string
}

/**
 * 品牌线性图标渲染器。
 *
 * - 内联 SVG（`dangerouslySetInnerHTML`），无外部请求；
 * - `aria-hidden={true}`：纯装饰图标，不参与无障碍树；
 * - 尺寸与颜色均通过内联 `style` 传递（与 Lynx 内联样式习惯一致）。
 */
export function Icon({ name, size = 24, color, className = '' }: IconProps) {
  const svgText = (SVG_MAP as Record<string, string>)[name as string]
  if (svgText === undefined) {
    // 端口契约：永不静默失败，给出可见降级提示（此处为开发期防御）。
    const sizeValue =
      typeof size === 'number' ? `calc(${size} * var(--rpx))` : size
    return (
      <span
        className={`Icon Icon-degraded ${className}`.trim()}
        aria-hidden={true}
        style={{
          display: 'inline-flex',
          width: sizeValue,
          height: sizeValue,
          color: 'currentColor',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize:
            typeof size === 'number'
              ? `calc(${size * 0.6} * var(--rpx))`
              : 'calc(14 * var(--rpx))',
        }}
      >
        ?
      </span>
    )
  }

  const resolvedColor =
    color ??
    (SEMANTIC_COLOR as Partial<Record<string, string>>)[name as string] ??
    'currentColor'
  const sizeValue =
    typeof size === 'number' ? `calc(${size} * var(--rpx))` : size

  return (
    <span
      className={`Icon ${className}`.trim()}
      aria-hidden={true}
      style={{
        display: 'inline-flex',
        width: sizeValue,
        height: sizeValue,
        color: resolvedColor,
        flexShrink: 0,
        alignItems: 'center',
        justifyContent: 'center',
        lineHeight: 0,
      }}
      // biome-ignore lint/security/noDangerouslySetInnerHtml: SVG 由 `assets/icons/*.svg` 静态 `?raw` 导入（构建期常量，非用户输入），与 GraphCanvas 背景 SVG 同理
      dangerouslySetInnerHTML={{ __html: svgText }}
    />
  )
}
