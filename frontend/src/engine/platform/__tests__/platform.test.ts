import { afterEach, describe, expect, it, vi } from 'vitest'

import type { PlatformKind } from '../types.js'

type PlatformModule = typeof import('../index.js')

/**
 * 平台探测单测。
 *
 * `engine/platform/index.ts` **首次调用即 memoize**，故每个用例先用
 * `vi.resetModules()` 重置模块注册表，再 `import()` 取一份全新实例，
 * 配合 `vi.stubGlobal` 精确控制 `globalThis._wails` / `navigator`。
 */
async function loadPlatform(): Promise<PlatformModule> {
  vi.resetModules()
  return await import('../index.js')
}

/** 仅设置 `_wails.environment.OS`（不带 navigator，隔离出宿主分支）。 */
function stubWailsOS(os: string): void {
  vi.stubGlobal('_wails', { environment: { OS: os } })
  vi.stubGlobal('navigator', undefined)
}

/** 仅设置 UA 相关字段（不带 `_wails`，隔离出 UA 兜底分支）。 */
function stubNavigator(input: {
  userAgent?: string
  platform?: string
  maxTouchPoints?: number
}): void {
  vi.stubGlobal('_wails', undefined)
  vi.stubGlobal('navigator', {
    userAgent: input.userAgent,
    platform: input.platform,
    maxTouchPoints: input.maxTouchPoints,
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('platform · 宿主注入 _wails.environment.OS 优先', () => {
  const cases: { os: string; kind: PlatformKind }[] = [
    { os: 'darwin', kind: 'macos' },
    { os: 'windows', kind: 'windows' },
    { os: 'linux', kind: 'linux' },
    { os: 'ios', kind: 'ios' },
    { os: 'android', kind: 'android' },
  ]

  for (const { os, kind } of cases) {
    it(`OS=${os} → ${kind}`, async () => {
      stubWailsOS(os)
      const platform = await loadPlatform()
      expect(platform.detectPlatform()).toBe(kind)
    })
  }

  it('OS 大小写不敏感', async () => {
    stubWailsOS('iOS')
    const platform = await loadPlatform()
    expect(platform.detectPlatform()).toBe('ios')
  })

  it('未知 OS 值 → 回退 UA（此处无 UA → web）', async () => {
    stubWailsOS('fuchsia')
    const platform = await loadPlatform()
    expect(platform.detectPlatform()).toBe('web')
  })
})

describe('platform · isMobile / isDesktop / getFormFactor', () => {
  it('ios → mobile', async () => {
    stubWailsOS('ios')
    const p = await loadPlatform()
    expect(p.isMobile()).toBe(true)
    expect(p.isIOS()).toBe(true)
    expect(p.isAndroid()).toBe(false)
    expect(p.isDesktop()).toBe(false)
    expect(p.getFormFactor()).toBe('mobile')
  })

  it('android → mobile', async () => {
    stubWailsOS('android')
    const p = await loadPlatform()
    expect(p.isMobile()).toBe(true)
    expect(p.isAndroid()).toBe(true)
    expect(p.isIOS()).toBe(false)
    expect(p.getFormFactor()).toBe('mobile')
  })

  it('darwin → desktop', async () => {
    stubWailsOS('darwin')
    const p = await loadPlatform()
    expect(p.isMobile()).toBe(false)
    expect(p.isDesktop()).toBe(true)
    expect(p.getFormFactor()).toBe('desktop')
  })

  it('纯浏览器（web）→ 非 mobile 非 desktop，formFactor desktop', async () => {
    stubNavigator({ userAgent: 'Mozilla/5.0 (Macintosh)' })
    const p = await loadPlatform()
    expect(p.detectPlatform()).toBe('web')
    expect(p.isMobile()).toBe(false)
    expect(p.isDesktop()).toBe(false)
    expect(p.getFormFactor()).toBe('desktop')
  })
})

describe('platform · UA 兜底（宿主 OS 缺失时）', () => {
  it('UA 含 android → android（Android 选路依赖此分支）', async () => {
    stubNavigator({
      userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36',
    })
    const p = await loadPlatform()
    expect(p.detectPlatform()).toBe('android')
    expect(p.isAndroid()).toBe(true)
  })

  it('UA 含 iphone → ios', async () => {
    stubNavigator({
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
    })
    const p = await loadPlatform()
    expect(p.detectPlatform()).toBe('ios')
    expect(p.isIOS()).toBe(true)
  })

  it('UA 含 ipad → ios', async () => {
    stubNavigator({
      userAgent: 'Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X)',
    })
    const p = await loadPlatform()
    expect(p.detectPlatform()).toBe('ios')
  })

  it('iPadOS 伪装桌面（MacIntel + 多触点）→ ios', async () => {
    stubNavigator({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)',
      platform: 'MacIntel',
      maxTouchPoints: 5,
    })
    const p = await loadPlatform()
    expect(p.detectPlatform()).toBe('ios')
  })

  it('桌面 UA + 单触点 → web', async () => {
    stubNavigator({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)',
      platform: 'MacIntel',
      maxTouchPoints: 0,
    })
    const p = await loadPlatform()
    expect(p.detectPlatform()).toBe('web')
  })
})

describe('platform · hasWailsRuntime（实时读取，不缓存）', () => {
  it('_wails 不存在 → false', async () => {
    vi.stubGlobal('_wails', undefined)
    const p = await loadPlatform()
    expect(p.hasWailsRuntime()).toBe(false)
  })

  it('_wails 为空对象（runtime 初始化但无 environment）→ false', async () => {
    vi.stubGlobal('_wails', {})
    const p = await loadPlatform()
    expect(p.hasWailsRuntime()).toBe(false)
  })

  it('_wails.environment 存在 → true', async () => {
    vi.stubGlobal('_wails', { environment: { OS: 'darwin' } })
    const p = await loadPlatform()
    expect(p.hasWailsRuntime()).toBe(true)
  })

  it('运行中注入 environment 会被立即读到（不因首次调用而缓存 false）', async () => {
    vi.stubGlobal('_wails', {})
    const p = await loadPlatform()
    expect(p.hasWailsRuntime()).toBe(false)
    // 模拟宿主晚于模块加载才注入 environment。
    vi.stubGlobal('_wails', { environment: { OS: 'ios' } })
    expect(p.hasWailsRuntime()).toBe(true)
  })
})

describe('platform · 守卫与缓存', () => {
  it('navigator 完全缺失 / 异常时不 throw，回退 web', async () => {
    vi.stubGlobal('_wails', undefined)
    vi.stubGlobal('navigator', undefined)
    const p = await loadPlatform()
    expect(() => p.detectPlatform()).not.toThrow()
    expect(p.detectPlatform()).toBe('web')
    expect(p.isMobile()).toBe(false)
  })

  it('首次调用后 memoize：后续改变全局不改变结果', async () => {
    stubWailsOS('ios')
    const p = await loadPlatform()
    expect(p.detectPlatform()).toBe('ios')
    // 即便此时把宿主 OS 改成 android，已缓存实例仍返回 ios。
    vi.stubGlobal('_wails', { environment: { OS: 'android' } })
    expect(p.detectPlatform()).toBe('ios')
    expect(p.isMobile()).toBe(true)
  })

  it('UA 兜底得到 web **不锁定**缓存：宿主晚注入时能重判（桌面 Wails 场景）', async () => {
    // 模块加载期：桌面 Wails 的 WebView UA 与普通浏览器无法区分 → 暂判 web。
    stubNavigator({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)',
      platform: 'MacIntel',
      maxTouchPoints: 0,
    })
    const p = await loadPlatform()
    expect(p.detectPlatform()).toBe('web')
    expect(p.isDesktop()).toBe(false)

    // 宿主**晚于模块加载**才注入 environment（`platform/index.ts` 文件头的 ⚠️ 场景）。
    vi.stubGlobal('_wails', { environment: { OS: 'darwin' } })
    expect(p.hasWailsRuntime()).toBe(true)
    // 若 'web' 被缓存，这里会错误地停在 'web'，与 hasWailsRuntime() 永久背离。
    expect(p.detectPlatform()).toBe('macos')
    expect(p.isDesktop()).toBe(true)
  })

  it('UA 兜底得到移动端**会**锁定（移动端 UA 在加载期即可靠）', async () => {
    stubNavigator({
      userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36',
    })
    const p = await loadPlatform()
    expect(p.detectPlatform()).toBe('android')
    // 已锁定：此后即使全局变化也不再重判。
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Macintosh)' })
    expect(p.detectPlatform()).toBe('android')
    expect(p.isAndroid()).toBe(true)
  })
})
