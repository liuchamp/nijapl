import { useLocation, useNavigate } from 'react-router'
import { TABS } from '../../constants/routes.js'
import { Icon } from '../Icon/index.js'

/**
 * 底部 5 Tab 导航（架构 §2.8）。
 *
 * - 不占独立路由布局层：由 `router/index.tsx` 的外壳决定是否渲染本组件；
 * - **不使用** `<Link>` / `<NavLink>`（Lynx 无此组件），统一 `useNavigate()`；
 * - 当前路径与 Tab 路径完全一致时高亮。
 */
export function TabBar() {
  const navigate = useNavigate()
  const location = useLocation()

  return (
    <div className="TabBar">
      {TABS.map((tab) => {
        const active = location.pathname === tab.path
        return (
          <div
            key={tab.path}
            className={
              active ? 'TabBar-item TabBar-item--active' : 'TabBar-item'
            }
            onClick={() => {
              navigate(tab.path)
            }}
          >
            <Icon name={tab.icon} className="TabBar-icon" />
            <span className="TabBar-label">{tab.label}</span>
          </div>
        )
      })}
    </div>
  )
}
