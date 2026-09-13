import { AppRouter } from './router/index.js'
import { useHydrated } from './store/hooks.js'

/**
 * 应用外壳（架构 §2.8）。
 *
 * - **hydration 门控**：持久化恢复完成前渲染极简启动态，避免用默认态闪一帧
 *   （异步存储耗时由门控吸收；另有 store 侧看门狗兜底，绝不永久停留启动态）；
 * - 恢复完成后挂载 `AppRouter`（`MemoryRouter` + 路由表 + 条件 TabBar / PC 侧边栏）；
 * - 脚手架内容（Lynx logo / flappy 动画 / `useFlappy`）已删除（Ruling 4）。
 *
 * 样式：原 `App.css` 已随 T05 迁移为 Tailwind 工具类并删除；全仓仅剩
 * `src/styles/index.css` 一个 CSS 文件（Tailwind 入口 + 设计令牌 + preflight 对齐）。
 */
export function App() {
  const hydrated = useHydrated()

  if (!hydrated) {
    return (
      <div className="App flex flex-col w-full h-full bg-bg">
        <div className="Splash flex-1 flex flex-col items-center justify-center">
          <span className="Splash-title text-xl font-bold mb-md">
            JLPT N3 単語
          </span>
          <span className="Splash-hint text-sm text-text-muted">
            正在恢复学习进度…
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="App flex flex-col w-full h-full bg-bg">
      <AppRouter />
    </div>
  )
}
