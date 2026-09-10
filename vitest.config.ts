import { defineConfig } from 'vitest/config'

/**
 * vitest 配置：引擎层（纯 TS）与数据管线校验器。
 * 仅覆盖 `src/engine/**` 与 `scripts/gen-data/**`，不加载 Lynx 页面/端口实现。
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'src/engine/__tests__/**/*.test.ts',
      'scripts/gen-data/__tests__/**/*.test.ts',
    ],
  },
})
