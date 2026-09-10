/**
 * 运行平台探测（架构 F6）。
 *
 * 背景：P2 卡片容器在 **Lynx 原生端** 使用 `<viewpager>`（横向翻页）；
 * 在 **Web**（浏览器 / 无 `SystemInfo` 的宿主）`<viewpager>` 行为不可预期，
 * 因此降级为横向 `<scroll-view>` 逐页浏览（文案见 `STRINGS.study.webFallbackHint`）。
 *
 * 探测依据：ReactLynx 在原生运行时会把 `lynx.SystemInfo` 注入为全局 `SystemInfo`
 * （见 `@lynx-js/react` runtime），其中 `platform` 为原生平台标识；
 * Web 宿主无此全局或平台标识非原生，即判定为降级。
 */

/** 卡片容器模式。 */
export type SlideMode = 'viewpager' | 'scroll'

/** Lynx 原生（含 PC）平台标识（架构 §F6：均可使用 `<viewpager>`）。 */
const NATIVE_PLATFORMS: readonly string[] = [
  'Android',
  'iOS',
  'Harmony',
  'windows',
  'macOS',
  'pc',
]

/**
 * 依平台标识判定容器模式（纯函数，便于单测）。
 *
 * @param platform `SystemInfo.platform`；`undefined` 表示无 `SystemInfo`（Web 宿主）。
 */
export function slideModeFor(platform: string | undefined): SlideMode {
  if (typeof platform !== 'string' || platform === '') {
    return 'scroll'
  }
  return NATIVE_PLATFORMS.includes(platform) ? 'viewpager' : 'scroll'
}

/** `SystemInfo` 最小结构（只关心 `platform`）。 */
interface SystemInfoLike {
  platform?: string
}

/** 读取当前宿主平台标识；无 `SystemInfo` 时返回 `undefined`。 */
export function readPlatform(): string | undefined {
  const scope = globalThis as unknown as { SystemInfo?: SystemInfoLike }
  const platform = scope.SystemInfo?.platform
  return typeof platform === 'string' ? platform : undefined
}

/** 探测当前应使用的卡片容器模式。 */
export function detectSlideMode(): SlideMode {
  return slideModeFor(readPlatform())
}
