import { useState } from 'react'
import { useLocation } from 'react-router'
import {
  matchSidebarAction,
  SIDEBAR_GROUPS,
  type SidebarAction,
} from '../../constants/routes.js'
import { STRINGS } from '../../constants/strings.js'
import { useNavigation } from '../../router/navigation.js'
import { enterKanaGroup } from '../../services/kanaWriteSession.js'
import { useAppStore } from '../../store/hooks.js'
import {
  selectContinueTarget,
  selectKanaContinueTarget,
} from '../../store/selectors.js'
import { Icon } from '../Icon/index.js'

/**
 * PC 侧边栏导航（T05）。
 *
 * - **只在宽屏渲染**：`<768px` 走底部 `TabBar`（移动端保真，零改动），
 *   `≥768px` 由 `router/index.tsx` 的外壳改用本组件（判定见 `router/useIsWide.ts`）。
 * - **不使用 `<Link>` / `<NavLink>`**（红线），跳转全部走 `useNavigation()`；
 *   P2 / K1 这类**需要参数**的路由复用首页同款「断点续学」选择器
 *   （`selectContinueTarget` / `selectKanaContinueTarget`），
 *   没有续学目标时退化到入口页（P1 阶段地图 / K0 五十音），**不跳不存在的路径**。
 * - 中文文案一律走 `STRINGS.sidebar`，不硬编码。
 *
 * 尺寸说明：侧栏是**纯 PC 组件**，宽度用 px 任意值（`w-[220px]`），
 * 字号 / 间距也用 px 任意值——避免被 `--rpx`（`100vw / 750`）在宽窗口下整体放大。
 */

/** 分组标题（分组结构在 `constants/routes.ts`，文案在 `constants/strings.ts`）。 */
const GROUP_LABEL: Record<string, string> = {
  kana: STRINGS.sidebar.kanaGroup,
}

/** PC 侧边栏。 */
export function Sidebar() {
  const nav = useNavigation()
  const location = useLocation()
  const state = useAppStore((snapshot) => snapshot)
  /** 折叠状态按分组 key 存放；缺省（undefined）= 展开。 */
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const active = matchSidebarAction(location.pathname)

  /** 侧栏跳转：与首页主按钮同源的续学逻辑，避免侧栏出现死链。 */
  function go(action: SidebarAction): void {
    if (action === 'home') {
      nav.goHome()
      return
    }
    if (action === 'study') {
      const target = selectContinueTarget(state)
      if (target === null) {
        nav.goStages()
        return
      }
      nav.goStudy(target.moduleId)
      return
    }
    if (action === 'stages') {
      nav.goStages()
      return
    }
    if (action === 'review') {
      nav.goReview()
      return
    }
    if (action === 'grammar') {
      nav.goGrammarList()
      return
    }
    if (action === 'graph') {
      nav.goGraph()
      return
    }
    if (action === 'me') {
      nav.goMe()
      return
    }
    if (action === 'kana') {
      nav.goKana()
      return
    }
    if (action === 'kanaStudy') {
      const target = selectKanaContinueTarget(state)
      if (target === null) {
        nav.goKana()
        return
      }
      // 与首页 / P3 拆音同路径：先写关内续学断点，再导航。
      enterKanaGroup(target.groupId, target.index)
      nav.goKanaStudy(target.groupId)
      return
    }
    nav.goKanaQuiz()
  }

  return (
    <aside className="Sidebar w-[220px] flex-none flex flex-col h-full bg-surface border-r-[calc(1*var(--rpx))] border-border overflow-y-auto overscroll-contain">
      <div className="Sidebar-brand px-[16px] py-[20px] text-[16px] font-bold text-text-muted select-none">
        {STRINGS.app.name}
      </div>

      <nav className="Sidebar-nav flex flex-col px-[8px] pb-[20px]">
        {SIDEBAR_GROUPS.map((group) => {
          const label = GROUP_LABEL[group.key]
          const open = group.collapsible ? collapsed[group.key] !== true : true
          return (
            <div
              key={group.key}
              className="Sidebar-group flex flex-col w-full mt-[8px]"
            >
              {label === undefined ? null : (
                <div
                  className="Sidebar-groupHead cursor-pointer select-none flex flex-row items-center justify-between w-full px-[12px] py-[8px] text-[13px] text-text-muted"
                  onClick={() => {
                    setCollapsed((prev) => ({
                      ...prev,
                      [group.key]: !prev[group.key],
                    }))
                  }}
                >
                  <span className="Sidebar-groupLabel">{label}</span>
                  <Icon
                    name="chevron-right"
                    size="14px"
                    className={open ? 'rotate-90' : ''}
                  />
                </div>
              )}

              {open
                ? group.items.map((item) => {
                    const on = active === item.action
                    return (
                      <div
                        key={item.action}
                        className={
                          on
                            ? 'Sidebar-item Sidebar-item--on cursor-pointer select-none flex flex-row items-center w-full px-[12px] py-[10px] mb-[4px] gap-[10px] rounded-[8px] bg-primary-soft text-primary'
                            : 'Sidebar-item cursor-pointer select-none flex flex-row items-center w-full px-[12px] py-[10px] mb-[4px] gap-[10px] rounded-[8px] text-text hover:bg-surface-alt'
                        }
                        onClick={() => {
                          go(item.action)
                        }}
                      >
                        <Icon name={item.icon} size="18px" />
                        <span className="Sidebar-label flex-1 text-[15px] truncate">
                          {STRINGS.sidebar[item.action]}
                        </span>
                      </div>
                    )
                  })
                : null}
            </div>
          )
        })}
      </nav>
    </aside>
  )
}
