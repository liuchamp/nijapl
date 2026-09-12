/**
 * Wails 宿主探测（引擎层共用）。
 *
 * `@wailsio/runtime` 在任何环境都会把 `window._wails` 初始化成 `{}`，
 * 但只有真实宿主才会注入 `environment`（由 Go 侧写入），因此以它为判据：
 * 浏览器里直接打开（vite preview / 单测）时会得到 `false`，自动回退到 Web 实现。
 */
interface WailsGlobal {
  environment?: unknown
}

/** 当前是否运行在 Wails 宿主内。 */
export function hasWailsRuntime(): boolean {
  if (typeof globalThis === 'undefined') {
    return false
  }
  const scope = globalThis as unknown as { _wails?: WailsGlobal }
  const wails = scope._wails
  return wails !== undefined && wails.environment !== undefined
}
