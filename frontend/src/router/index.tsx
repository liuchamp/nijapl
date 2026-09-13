import { MemoryRouter, useLocation } from 'react-router'
import { Sidebar } from '../components/Sidebar/index.js'
import { TabBar } from '../components/TabBar/index.js'
import { isTabPath, ROUTES } from '../constants/routes.js'
import { AppRoutes } from './routes.js'
import { useIsWide } from './useIsWide.js'

/**
 * 路由装配（架构 §1.2 / §2.8）。
 *
 * - 必须使用 `MemoryRouter`：Lynx 无浏览器地址栏、无 `history API`；
 * - **不使用** `<Link>` / `<NavLink>`，导航统一走 `useNavigate()`（见 `navigation.ts`）；
 * - TabBar 不占独立路由布局层：由外壳根据 `location.pathname` 是否命中 5 个 Tab 路径决定渲染。
 *
 * PC / Mobile 差异化（T05，决策 5）：
 * - **`<768px`（移动 / 窄窗）**：保持原 Lynx 保真布局——`.Shell` 纵向 + 可滚动内容
 *   + 条件 TabBar，**不新增任何元素**；
 * - **`≥768px`（PC / 宽窗）**：左侧 `Sidebar` + 内容区，内容**居中限宽**并保留纵向滚动；
 *   不再渲染底部 TabBar（导航由侧栏承担）。
 */

/** 窄窗（<768px）：原移动端单列 + 条件底部 TabBar。 */
function NarrowShell() {
  const location = useLocation()
  const showTabBar = isTabPath(location.pathname)
  return (
    <div className="Shell flex-1 flex flex-col w-full min-h-0 overflow-hidden">
      <div className="Shell-content flex-1 flex flex-col w-full min-h-0 overflow-y-auto overscroll-contain">
        <AppRoutes />
      </div>
      {showTabBar ? <TabBar /> : null}
    </div>
  )
}

/**
 * 宽窗（≥768px）：左侧栏 + 居中限宽内容区。
 *
 * 内容列宽 **480rpx**（PRD §响应式方案；宽屏下 `--rpx` 已冻结为 1px，即 480px）。
 * 注意与原手机列 **420px 并非同一个值**——480 是 PRD 选定的、略宽于原列的阅读宽度，
 * 见 `styles/index.css` 末段的断点说明。
 */
function WideShell() {
  return (
    <div className="Shell flex-1 flex flex-row w-full min-h-0 overflow-hidden">
      <Sidebar />
      <div className="Shell-content flex-1 flex flex-col min-w-0 min-h-0 overflow-y-auto overscroll-contain">
        <div className="Shell-inner w-full max-w-[calc(480*var(--rpx))] mx-auto flex flex-col flex-1 min-h-0">
          <AppRoutes />
        </div>
      </div>
    </div>
  )
}

/** 应用外壳：按视口宽度在「移动端单列」与「PC 侧栏」两套骨架间切换。 */
function AppShell() {
  const isWide = useIsWide()
  return isWide ? <WideShell /> : <NarrowShell />
}

/** 应用路由根组件（供 `App.tsx` 在 hydration 完成后挂载）。 */
export function AppRouter() {
  return (
    <MemoryRouter initialEntries={[ROUTES.home]}>
      <AppShell />
    </MemoryRouter>
  )
}
