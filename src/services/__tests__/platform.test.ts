import { describe, expect, it } from 'vitest'

import { slideModeFor } from '../platform.js'

describe('platform · slideModeFor 容器降级判定', () => {
  it('无 SystemInfo（Web 宿主）→ scroll 降级', () => {
    expect(slideModeFor(undefined)).toBe('scroll')
    expect(slideModeFor('')).toBe('scroll')
  })

  it('原生 / PC 平台 → viewpager', () => {
    for (const platform of [
      'Android',
      'iOS',
      'Harmony',
      'windows',
      'macOS',
      'pc',
    ]) {
      expect(slideModeFor(platform)).toBe('viewpager')
    }
  })

  it('未知平台标识 → scroll 降级', () => {
    expect(slideModeFor('web')).toBe('scroll')
    expect(slideModeFor('linux')).toBe('scroll')
  })
})
