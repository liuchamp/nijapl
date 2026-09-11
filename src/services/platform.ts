/**
 * 运行平台探测（架构 F6）。
 *
 * 背景：P2 卡片容器有两种实现——
 * - `<viewpager>`：横向整页翻页，官方元素表中为 **Limited availability**，
 *   **需要宿主单独注册 Behavior**；
 * - 横向 `<scroll-view>`：全平台内置。
 *
 * 现状：**默认全平台走 `scroll-view`**。
 *
 * 原因：60301 并非只发生在桌面宿主，真机（Android）实测同样复现——
 * `error_stack` 落在 `com.lynx.tasm.behavior.PaintingContext`，
 * 说明该宿主构建的 Lynx 未注册 `viewpager` 的 Behavior，元素在**创建阶段**即失败：
 * `60301 Can't find ui tag`（`node_index` 指向该容器），
 * 并在页面返回卸载时连带抛出 `9902 Trying to remove unknown ui signature`
 * （UI 从未创建成功，removeNode 时找不到签名）。
 *
 * 因此白名单不再是"启用"条件，而只作为**开关打开后**的二次校验；
 * 只有在确认宿主确已内置 viewpager 后，才调用 `setViewpagerEnabled(true)` 启用。
 */

/** 卡片容器模式。 */
export type SlideMode = 'viewpager' | 'scroll'

/**
 * 理论上内置 `<viewpager>` Behavior 的平台（**仅移动端**）。
 *
 * 仅当 `viewpagerEnabled === true` 时参与判定；平台不在其中一律降级
 * `scroll`（桌面宿主不内置 viewpager 的 Behavior，已验证会 60301）。
 */
const NATIVE_VIEWPAGER_PLATFORMS: readonly string[] = [
  'Android',
  'iOS',
  'Harmony',
]

/**
 * `<viewpager>` 全局开关，默认 **关闭**。
 *
 * 关闭时所有平台一律使用横向 `<scroll-view>`，杜绝 60301 / 9902。
 * 确认宿主已内置 viewpager 后可调用 `setViewpagerEnabled(true)` 打开。
 */
let viewpagerEnabled = false

/** 开关 `<viewpager>`。 */
export function setViewpagerEnabled(enabled: boolean): void {
  viewpagerEnabled = enabled
}

/** 当前是否允许使用 `<viewpager>`。 */
export function isViewpagerEnabled(): boolean {
  return viewpagerEnabled
}

/**
 * 依平台标识判定容器模式（纯函数，便于单测）。
 *
 * @param platform `SystemInfo.platform`；`undefined` 表示无 `SystemInfo`（Web 宿主）。
 * @param enabled 是否允许 viewpager，默认取全局开关值。
 */
export function slideModeFor(
  platform: string | undefined,
  enabled: boolean = viewpagerEnabled,
): SlideMode {
  if (!enabled) {
    return 'scroll'
  }
  if (typeof platform !== 'string' || platform === '') {
    return 'scroll'
  }
  return NATIVE_VIEWPAGER_PLATFORMS.includes(platform) ? 'viewpager' : 'scroll'
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
