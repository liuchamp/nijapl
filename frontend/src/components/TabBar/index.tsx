import { useLocation, useNavigate } from 'react-router'
import { TABS } from '../../constants/routes.js'
import { Icon } from '../Icon/index.js'

/**
 * 底部 5 Tab 导航（架构 §2.8）。
 *
 * - 不占独立路由布局层：由 `router/index.tsx` 的外壳决定是否渲染本组件
 *   （窄窗 <768px 显示；宽窗 ≥768px 改为左侧 `Sidebar`，见 `router/useIsWide.ts`）；
 * - **不使用** `<Link>` / `<NavLink>`（Lynx 无此组件），统一 `useNavigate()`；
 * - 当前路径与 Tab 路径完全一致时高亮。
 *
 * 样式：原 `App.css` 的 `.TabBar*` 已迁为 Tailwind 工具类（T05）。
 * 原 `.TabBar-item--active .TabBar-icon` / `.TabBar-label` 两条**后代选择器**
 * 下沉为子元素上的条件类（Tailwind 无后代组合工具类），激活态由父级 `active` 驱动。
 *
 * 注：`.TabBar-icon` 的 `w-40 h-40` 会被 `Icon` 的内联 `style`（默认 `size=24`
 * → `calc(24 * var(--rpx))`）覆盖，属**既有行为**（原 CSS 同理被内联样式压过），
 * 此处保留类名以维持语义锚点，不改变渲染尺寸。
 */
export function TabBar() {
  const navigate = useNavigate()
  const location = useLocation()

  return (
    <div className="TabBar flex flex-row items-center justify-around w-full h-110 flex-none bg-surface border-t-[calc(1*var(--rpx))] border-border">
      {TABS.map((tab) => {
        const active = location.pathname === tab.path
        return (
          <div
            key={tab.path}
            className={
              active
                ? 'TabBar-item TabBar-item--active flex-1 flex flex-col items-center justify-center h-full cursor-pointer select-none gap-4 bg-primary-soft'
                : 'TabBar-item flex-1 flex flex-col items-center justify-center h-full cursor-pointer select-none gap-4'
            }
            onClick={() => {
              navigate(tab.path)
            }}
          >
            <Icon
              name={tab.icon}
              className={
                active
                  ? 'TabBar-icon w-40 h-40 shrink-0 text-primary'
                  : 'TabBar-icon w-40 h-40 shrink-0 text-text-muted'
              }
            />
            <span
              className={
                active
                  ? 'TabBar-label text-sm text-primary font-bold'
                  : 'TabBar-label text-sm text-text-muted'
              }
            >
              {tab.label}
            </span>
          </div>
        )
      })}
    </div>
  )
}
