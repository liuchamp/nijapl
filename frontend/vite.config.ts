import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import wails from '@wailsio/runtime/plugins/vite'
import { defineConfig } from 'vite'

/**
 * 原 Lynx 工程全量使用 `rpx`（1rpx = 视口宽 / 750）。Wails/Web 下没有该单位，
 * 迁移期由 PostCSS 插件 `rpxPlugin` 在构建期改写为 `calc(N * var(--rpx))`，
 * 使搬运过来的 CSS 可保持 rpx 原文。
 *
 * T05：24 个页面/组件 `.css` + `App.css` **全部**迁为 Tailwind 工具类并删除，
 * 全仓仅剩 `src/styles/index.css`，其中已直接书写 `calc(N * var(--rpx))`，
 * 不再需要 PostCSS 改写 —— **插件与 `css.postcss` 配置块一并移除**。
 * `var(--rpx)` 本身保留为运行期变量（定义见 `src/styles/index.css` 的 `:root`），
 * Tailwind 的 `--spacing` 基准即 `calc(1 * var(--rpx))`，故数字工具类仍是 rpx 语义。
 */

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    host: '127.0.0.1',
    port: Number(process.env.WAILS_VITE_PORT) || 9245,
    strictPort: true,
  },
  plugins: [react(), wails('./bindings'), tailwindcss()],
  build: {
    cssTarget: 'safari14',
  },
})
