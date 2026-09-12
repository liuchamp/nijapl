import './App.css'
import { AppRouter } from './router/index.js'
import { useHydrated } from './store/hooks.js'

/**
 * 应用外壳（架构 §2.8）。
 *
 * - **hydration 门控**：持久化恢复完成前渲染极简启动态，避免用默认态闪一帧
 *   （异步存储耗时由门控吸收；另有 store 侧看门狗兜底，绝不永久停留启动态）；
 * - 恢复完成后挂载 `AppRouter`（`MemoryRouter` + 路由表 + 条件 TabBar）；
 * - 脚手架内容（Lynx logo / flappy 动画 / `useFlappy`）已删除（Ruling 4）。
 */
export function App() {
  const hydrated = useHydrated()

  if (!hydrated) {
    return (
      <div className="App">
        <div className="Splash">
          <span className="Splash-title">JLPT N3 単語</span>
          <span className="Splash-hint">正在恢复学习进度…</span>
        </div>
      </div>
    )
  }

  return (
    <div className="App">
      <AppRouter />
    </div>
  )
}
