import ReactDOM from 'react-dom/client'
import { App } from './App'
import './styles/index.css'

/**
 * Web 入口（原 Lynx 入口 `src/index.tsx` 的等价物）。
 *
 * - 不使用 `React.StrictMode`：原 Lynx 运行时无该模式，StrictMode 会双调用
 *   effects，导致 hydration 门控与 TTS 首次手势解锁出现双触发，属于行为漂移。
 * - 全局样式入口为 `styles/index.css`（Tailwind v4 + 设计令牌 + body 基准）。
 */
ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <App />,
)
