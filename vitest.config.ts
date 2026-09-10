import { defineConfig } from 'vitest/config'

/**
 * vitest 配置：引擎层（纯 TS）、T04 纯逻辑服务/派生查询，与数据管线校验器。
 *
 * 仅收录**不依赖 Lynx 运行时**（不含页面 / 端口实现 / CSS）的纯模块：
 * `src/engine/**`、`src/services/**`（highlight / jumpService / swipe / platform）、
 * `src/store/**`（selectors）、`scripts/gen-data/**` 与 `tests/qa/**`。
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'src/engine/__tests__/**/*.test.ts',
      'src/services/__tests__/**/*.test.ts',
      'src/store/__tests__/**/*.test.ts',
      'scripts/gen-data/__tests__/**/*.test.ts',
      'tests/qa/**/*.test.ts',
    ],
  },
})
