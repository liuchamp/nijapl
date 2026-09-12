import { defineConfig } from 'vitest/config'

/**
 * 审计专用 vitest 配置（一次性，不影响 `npm test` 基线）。
 *
 * 只跑 `tests/audit/**` 下的取证测试；与主配置 `vitest.config.ts` 完全隔离，
 * 便于在不动 `src/` 与既有配置的前提下复现评审报告指控。
 *
 * 用法：`npx vitest run --config vitest.audit.config.ts`
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/audit/**/*.test.ts'],
  },
})
