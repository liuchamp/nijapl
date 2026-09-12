import react from '@vitejs/plugin-react'
import wails from '@wailsio/runtime/plugins/vite'
import { defineConfig } from 'vite'

/**
 * rpx → calc(var(--rpx) * N) 的 PostCSS 插件。
 *
 * 原 Lynx 工程全量使用 `rpx`（1rpx = 视口宽 / 750）。Wails/Web 下没有该单位，
 * 统一在构建期改写为 `calc(N * var(--rpx))`，`--rpx` 由 `App.css` 的 `:root` 定义。
 * 这样所有搬运过来的 CSS 可以**保持 rpx 原文**，无需逐条手改。
 */
const rpxPlugin = {
  postcssPlugin: 'postcss-rpx',
  Declaration(decl: { value: string }) {
    if (typeof decl.value === 'string' && decl.value.includes('rpx')) {
      decl.value = decl.value.replace(
        /(-?\d*\.?\d+)rpx/g,
        (_m: string, n: string) => `calc(${n} * var(--rpx))`,
      )
    }
  },
}

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    host: '127.0.0.1',
    port: Number(process.env.WAILS_VITE_PORT) || 9245,
    strictPort: true,
  },
  css: {
    postcss: {
      plugins: [rpxPlugin],
    },
  },
  plugins: [react(), wails('./bindings')],
})
