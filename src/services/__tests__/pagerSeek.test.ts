import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  PAGER_ID,
  PAGER_SELECTOR,
  type SeekPagerParams,
  seekPager,
} from '../pagerSeek.js'

/**
 * 程序化翻页（60301 修复）：容器只创建一次，靠官方 UI 方法定位，
 * 宿主不支持 / 节点未就绪时才回退到重建方案。
 */

/** 记录 invoke 调用的假 SelectorQuery。 */
interface RecordedInvoke {
  method: string
  params?: Record<string, unknown>
  fail?: (res: { code: number }) => void
}

function stubLynx(handlers: {
  onInvoke: (invoke: RecordedInvoke) => void
}): void {
  const query = {
    select: () => query,
    invoke: (options: RecordedInvoke) => {
      handlers.onInvoke(options)
      return query
    },
    exec: () => undefined,
  }
  vi.stubGlobal('lynx', { createSelectorQuery: () => query })
}

function seek(mode: SeekPagerParams['mode'], index: number) {
  const onUnsupported = vi.fn()
  seekPager({ mode, index, onUnsupported })
  return onUnsupported
}

describe('pagerSeek · 程序化翻页', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('容器 id 选择器与 Study 页容器一致', () => {
    expect(PAGER_ID).toBe('study-pager')
    expect(PAGER_SELECTOR).toBe('#study-pager')
  })

  it('viewpager 模式 → selectTab，参数带 index', () => {
    const invoked: RecordedInvoke[] = []
    stubLynx({ onInvoke: (options) => invoked.push(options) })

    seek('viewpager', 3)

    expect(invoked).toHaveLength(1)
    expect(invoked[0]?.method).toBe('selectTab')
    expect(invoked[0]?.params).toEqual({ index: 3, smooth: true })
  })

  it('scroll 模式 → scrollTo，参数带 index', () => {
    const invoked: RecordedInvoke[] = []
    stubLynx({ onInvoke: (options) => invoked.push(options) })

    seek('scroll', 0)

    expect(invoked[0]?.method).toBe('scrollTo')
    expect(invoked[0]?.params).toEqual({ index: 0, smooth: true })
  })

  it('宿主无 SelectorQuery → 回调 onUnsupported（回退重建）', () => {
    vi.stubGlobal('lynx', undefined)

    const onUnsupported = seek('viewpager', 2)

    expect(onUnsupported).toHaveBeenCalledTimes(1)
  })

  it('节点未就绪（invoke fail）→ 回调 onUnsupported + onFail', () => {
    let captured: RecordedInvoke | undefined
    stubLynx({ onInvoke: (options) => (captured = options) })

    const onUnsupported = vi.fn()
    const onFail = vi.fn()
    seekPager({ mode: 'viewpager', index: 2, onUnsupported, onFail })
    expect(onUnsupported).not.toHaveBeenCalled()
    expect(onFail).not.toHaveBeenCalled()

    captured?.fail?.({ code: 2 })

    expect(onUnsupported).toHaveBeenCalledTimes(1)
    expect(onFail).toHaveBeenCalledTimes(1)
  })

  it('宿主无 SelectorQuery → 只回调 onUnsupported，不算定位失败', () => {
    vi.stubGlobal('lynx', undefined)

    const onUnsupported = vi.fn()
    const onFail = vi.fn()
    seekPager({ mode: 'scroll', index: 1, onUnsupported, onFail })

    expect(onUnsupported).toHaveBeenCalledTimes(1)
    expect(onFail).not.toHaveBeenCalled()
  })
})
