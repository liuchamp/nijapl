import { describe, expect, it } from 'vitest'

import {
  isViewpagerEnabled,
  setViewpagerEnabled,
  slideModeFor,
} from '../platform.js'

describe('platform · slideModeFor 容器降级判定', () => {
  it('默认（开关关闭）→ 所有平台一律 scroll（Android 真机实测 60301）', () => {
    expect(isViewpagerEnabled()).toBe(false)
    for (const platform of [
      'Android',
      'iOS',
      'Harmony',
      'windows',
      'macOS',
      'pc',
      'Linux',
      'web',
      undefined,
      '',
    ]) {
      expect(slideModeFor(platform)).toBe('scroll')
    }
  })

  it('开关打开后：移动端宿主 → viewpager', () => {
    setViewpagerEnabled(true)
    try {
      expect(isViewpagerEnabled()).toBe(true)
      for (const platform of ['Android', 'iOS', 'Harmony']) {
        expect(slideModeFor(platform)).toBe('viewpager')
      }
    } finally {
      setViewpagerEnabled(false)
    }
  })

  it('开关打开后：PC / 桌面 / 未知宿主 → 仍降级 scroll', () => {
    for (const platform of [
      'windows',
      'macOS',
      'pc',
      'Linux',
      'darwin',
      'web',
      'linux',
      undefined,
      '',
    ]) {
      expect(slideModeFor(platform, true)).toBe('scroll')
    }
  })
})
