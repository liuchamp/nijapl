/**
 * 图标名唯一真相源（与 `constants/` 其余文件同层）。
 *
 * 与 `frontend/src/assets/icons/*.svg` **一一对应**：18 个品牌线性图标
 * （24×24 网格、2px round stroke、`currentColor` 默认）。
 *
 * 为什么放在 `constants/` 而不是 `components/Icon`：
 * `constants/` 是被 `components/` 依赖的**底层**（`components/Sidebar` 与
 * `components/TabBar` 都 import `constants/routes`），若 `constants/routes.ts`
 * 反向 import `components/Icon` 会造成类型循环。本文件**零依赖**，可被两侧安全引用。
 *
 * 消费方：
 * - `components/Icon` —— `SVG_MAP: Record<IconName, string>`，漏一个图标即编译期报错；
 * - `constants/routes` —— 约束 `TabDefinition.icon` / `SidebarItem.icon`，
 *   使 `icon: 'hoem'` 这类拼写错误在 `tsc` 阶段暴露，而不是运行时静默降级成 `?`。
 */

/** 18 个品牌图标名称（与 `assets/icons/*.svg` 一一对应）。 */
export const ICON_NAMES = [
  'audio',
  'book',
  'calendar',
  'check',
  'chevron-left',
  'chevron-right',
  'close',
  'flame',
  'graph',
  'home',
  'plus',
  'review',
  'search',
  'settings',
  'stages',
  'star',
  'study',
  'trophy',
] as const

/** 图标名（`ICON_NAMES` 的联合类型）。 */
export type IconName = (typeof ICON_NAMES)[number]
