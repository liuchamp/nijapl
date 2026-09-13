import { useEffect, useState } from 'react'

/**
 * 宽屏判定（PC 响应式，T05）。
 *
 * - 断点 **768px**：`<768px` 走移动端单列 + 底部 TabBar（原 Lynx 保真布局，零改动）；
 *   `≥768px` 走左侧 `Sidebar` + 居中限宽内容区。
 * - **守卫式**：无 `window` / 无 `matchMedia`（SSR、单测、极旧 WebView）时恒返回
 *   `false`（即移动端布局），**永不 throw**——窄布局是无条件安全的退化方向。
 */

/** 宽屏断点（与 Tailwind 的 `md:` 一致，但本项目用 JS 分支而非 CSS 断点）。 */
export const WIDE_BREAKPOINT_PX = 768

/** `matchMedia` 查询串。 */
export const WIDE_MEDIA_QUERY = `(min-width: ${WIDE_BREAKPOINT_PX}px)`

/**
 * 同步读取一次当前是否宽屏。
 *
 * 拆成独立函数是为了让 `useState` 初始值与 effect 内的首次对齐复用同一段守卫逻辑。
 */
function readIsWide(): boolean {
  if (typeof window === 'undefined') {
    return false
  }
  if (typeof window.matchMedia !== 'function') {
    return false
  }
  return window.matchMedia(WIDE_MEDIA_QUERY).matches
}

/** 当前视口是否 ≥768px（宽屏 / PC 布局）。 */
export function useIsWide(): boolean {
  const [isWide, setIsWide] = useState<boolean>(readIsWide)

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }
    if (typeof window.matchMedia !== 'function') {
      return
    }
    const query = window.matchMedia(WIDE_MEDIA_QUERY)
    // 首次对齐：初始值在 SSR / 水合前后可能与真实视口不一致。
    setIsWide(query.matches)

    const onChange = (event: MediaQueryListEvent): void => {
      setIsWide(event.matches)
    }

    // Safari <14 的 `MediaQueryList` 只有已废弃的 `addListener`；两者都不存在时
    // 退化为「只在挂载时读一次」（仍不 throw）。
    if (typeof query.addEventListener === 'function') {
      query.addEventListener('change', onChange)
      return () => {
        query.removeEventListener('change', onChange)
      }
    }
    if (typeof query.addListener === 'function') {
      query.addListener(onChange)
      return () => {
        query.removeListener(onChange)
      }
    }
    return undefined
  }, [])

  return isWide
}
