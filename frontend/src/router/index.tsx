import { MemoryRouter, useLocation } from 'react-router'
import { TabBar } from '../components/TabBar/index.js'
import { isTabPath, ROUTES } from '../constants/routes.js'
import { AppRoutes } from './routes.js'

/**
 * 路由装配（架构 §1.2 / §2.8）。
 *
 * - 必须使用 `MemoryRouter`：Lynx 无浏览器地址栏、无 `history API`；
 * - **不使用** `<Link>` / `<NavLink>`，导航统一走 `useNavigate()`（见 `navigation.ts`）；
 * - TabBar 不占独立路由布局层：由外壳根据 `location.pathname` 是否命中 5 个 Tab 路径决定渲染。
 */

/** 应用外壳：路由出口 + 条件 TabBar。 */
function AppShell() {
  const location = useLocation()
  const showTabBar = isTabPath(location.pathname)
  return (
    <div className="Shell">
      <div className="Shell-content">
        <AppRoutes />
      </div>
      {showTabBar ? <TabBar /> : null}
    </div>
  )
}

/** 应用路由根组件（供 `App.tsx` 在 hydration 完成后挂载）。 */
export function AppRouter() {
  return (
    <MemoryRouter initialEntries={[ROUTES.home]}>
      <AppShell />
    </MemoryRouter>
  )
}
