import type { FormFactor, PlatformKind } from './types.js'

export type { FormFactor, PlatformKind }

/**
 * 平台探测单一真相源（六边形边界层的宿主判定）。
 *
 * 页面 / store / service **一律**经本文件读写平台态，禁止散落 `userAgent`
 * 判断或直读 `_wails`（红线：平台能力隔离）。
 *
 * 探测优先级（守卫式、永不 throw）：
 * ① Wails 宿主注入的 `globalThis._wails.environment.OS`
 *    （值为 `darwin|windows|linux|ios|android`）；
 * ② 缺失 / 非预期 → **UA 兜底**：`navigator.userAgent` 含 `android` → android；
 *    含 `iphone|ipad|ipod`（或 `platform==='MacIntel' && maxTouchPoints>1`，兼容
 *    iPadOS 伪装成桌面）→ ios；否则 `web`。
 *
 * ⚠️ **UA 兜底必须保留**：`_wails.environment` 可能晚于模块加载才注入（Android 尤甚），
 * 而 UA 在模块加载期就可靠——既有代码在 Android 上正是靠 UA 选路（见 TTS 同源 handler）。
 *
 * 由此推出两条硬约束（否则会出现「平台判定与宿主判定互相矛盾」）：
 * ① `hasWailsRuntime()` 必须**实时读取**、不缓存；
 * ② `detectPlatform()` **不缓存** UA 兜底得到的 `'web'`（见下方 `cached` 的注释）。
 * 二者共同保证：宿主注入晚到时，`detectPlatform()` 与 `hasWailsRuntime()` 仍收敛到同一结论。
 *
 * 实现约束：本文件**不** import `@wailsio/runtime`（引擎层保持纯净，避免测试环境
 * `window` 未定义报错），直接读 `globalThis._wails`，与既有风格一致。
 */

/** 宿主注入的全局形态（仅声明用到的字段）。 */
interface WailsGlobal {
  environment?: { OS?: unknown }
}

/** 归一化 Wails `environment.OS` 值 → `PlatformKind`（未知 / 非字符串返回 `undefined`）。 */
function normalizeOS(os: unknown): PlatformKind | undefined {
  if (typeof os !== 'string' || os === '') {
    return undefined
  }
  switch (os.toLowerCase()) {
    case 'darwin':
      return 'macos'
    case 'windows':
      return 'windows'
    case 'linux':
      return 'linux'
    case 'ios':
      return 'ios'
    case 'android':
      return 'android'
    default:
      return undefined
  }
}

/** 读取并归一化 `_wails.environment.OS`（宿主注入；浏览器 / 单测下不存在）。 */
function readWailsOS(): PlatformKind | undefined {
  try {
    if (typeof globalThis === 'undefined') {
      return undefined
    }
    const scope = globalThis as unknown as { _wails?: WailsGlobal }
    return normalizeOS(scope._wails?.environment?.OS)
  } catch {
    return undefined
  }
}

/** 读取 `navigator` 相关字段（守卫式，永不 throw）。 */
function readNavigator(): {
  ua: string
  platform: string
  maxTouchPoints: number
} {
  try {
    const scope = globalThis as unknown as {
      navigator?: {
        userAgent?: unknown
        platform?: unknown
        maxTouchPoints?: unknown
      }
    }
    const nav = scope.navigator
    return {
      ua: typeof nav?.userAgent === 'string' ? nav.userAgent.toLowerCase() : '',
      platform: typeof nav?.platform === 'string' ? nav.platform : '',
      maxTouchPoints:
        typeof nav?.maxTouchPoints === 'number' ? nav.maxTouchPoints : 0,
    }
  } catch {
    return { ua: '', platform: '', maxTouchPoints: 0 }
  }
}

/** 纯探测（不带缓存）：优先 Wails OS，缺失 / 未知时回退 UA。 */
function resolvePlatform(): PlatformKind {
  const fromWails = readWailsOS()
  if (fromWails !== undefined) {
    return fromWails
  }

  const { ua, platform, maxTouchPoints } = readNavigator()
  if (ua.includes('android')) {
    return 'android'
  }
  if (ua.includes('iphone') || ua.includes('ipad') || ua.includes('ipod')) {
    return 'ios'
  }
  // iPadOS 13+ 默认以桌面 UA（MacIntel）上报，用触摸点数识别。
  if (platform === 'MacIntel' && maxTouchPoints > 1) {
    return 'ios'
  }
  return 'web'
}

/**
 * 首次探测结果缓存 —— **只缓存确定判据**。
 *
 * - **会缓存**：宿主注入的 `_wails.environment.OS`（明确值），或 UA 命中的
 *   `android` / `ios`（移动端 UA 在模块加载期就可靠，见文件头 ⚠️ 注）。
 * - **不缓存 `'web'`**：桌面 Wails 的 WebView UA 与普通浏览器**无法区分**，
 *   若在此锁定 `'web'`，而 `hasWailsRuntime()` 稍后随宿主注入变成 `true`，
 *   两者就会**永久背离**（`detectPlatform()` 说浏览器、`hasWailsRuntime()` 说在宿主内），
 *   使「按平台选路」的装配点选错实现（典型：`engine/tts` 的合成源，见其
 *   `createTtsSource()`）。不缓存时每次重算只做几次字符串判断，开销可忽略。
 */
let cached: PlatformKind | undefined

/** 探测当前平台（守卫式，永不 throw）。 */
export function detectPlatform(): PlatformKind {
  if (cached !== undefined) {
    return cached
  }
  const resolved = resolvePlatform()
  // 仅在判据明确时锁定；`'web'` 可能是「宿主尚未注入」的暂态，留给下次调用重判。
  if (resolved !== 'web') {
    cached = resolved
  }
  return resolved
}

/**
 * 当前是否运行在 Wails 宿主内。
 *
 * **实时读取、不缓存**：`@wailsio/runtime` 在任何环境都会把 `window._wails`
 * 初始化成 `{}`，但只有真实宿主才注入 `environment`；该注入可能晚于模块加载，
 * 故与旧 `engine/wails.ts` 保持一致按调用即读（浏览器 / 单测下为 `false`）。
 */
export function hasWailsRuntime(): boolean {
  try {
    if (typeof globalThis === 'undefined') {
      return false
    }
    const scope = globalThis as unknown as { _wails?: WailsGlobal }
    const wails = scope._wails
    return wails !== undefined && wails.environment !== undefined
  } catch {
    return false
  }
}

/** 当前是否为移动端（iOS / Android）。 */
export function isMobile(): boolean {
  const kind = detectPlatform()
  return kind === 'ios' || kind === 'android'
}

/** 当前是否为桌面端（macOS / Windows / Linux）。 */
export function isDesktop(): boolean {
  const kind = detectPlatform()
  return kind === 'macos' || kind === 'windows' || kind === 'linux'
}

/** 当前是否为 iOS / iPadOS。 */
export function isIOS(): boolean {
  return detectPlatform() === 'ios'
}

/** 当前是否为 Android。 */
export function isAndroid(): boolean {
  return detectPlatform() === 'android'
}

/** 形态因子（移动优先布局判据）：`mobile` / `desktop`。 */
export function getFormFactor(): FormFactor {
  return isMobile() ? 'mobile' : 'desktop'
}
