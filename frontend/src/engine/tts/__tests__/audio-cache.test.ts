import { describe, expect, it } from 'vitest'

import type { TtsAudioClip } from '../../../types/tts.js'
import { TtsAudioCache } from '../audio-cache.js'

/** 构造测试片段。 */
function clip(
  key: string,
  byteLength: number,
  extra: Partial<TtsAudioClip> = {},
): TtsAudioClip {
  return { key, mime: 'audio/mpeg', byteLength, lastUsedAt: 0, ...extra }
}

describe('audio-cache · 条目双限', () => {
  it('超过条目上限按 LRU 淘汰最久未用', () => {
    const cache = new TtsAudioCache({
      maxEntries: 2,
      maxBytes: 1_000,
      now: () => 0,
    })
    cache.put('a', clip('a', 1, { lastUsedAt: 0 }))
    cache.put('b', clip('b', 1, { lastUsedAt: 1 }))
    cache.put('c', clip('c', 1, { lastUsedAt: 2 }))
    expect(cache.size).toBe(2)
    expect(cache.get('a')).toBeUndefined()
    expect(cache.get('b')).toBeDefined()
    expect(cache.get('c')).toBeDefined()
  })

  it('超过字节上限按 LRU 淘汰', () => {
    const cache = new TtsAudioCache({
      maxEntries: 100,
      maxBytes: 10,
      now: () => 0,
    })
    cache.put('a', clip('a', 6, { lastUsedAt: 0 }))
    cache.put('b', clip('b', 6, { lastUsedAt: 1 }))
    expect(cache.size).toBe(1)
    expect(cache.bytes).toBe(6)
    expect(cache.get('a')).toBeUndefined()
    expect(cache.get('b')).toBeDefined()
  })

  it('single 超大片段仍可写入（清空后落盘，不崩）', () => {
    const cache = new TtsAudioCache({
      maxEntries: 4,
      maxBytes: 10,
      now: () => 0,
    })
    cache.put('a', clip('a', 100))
    expect(cache.size).toBe(1)
    expect(cache.bytes).toBe(100)
  })
})

describe('audio-cache · 淘汰 revoke', () => {
  it('淘汰时调用 revokeObjectURL', () => {
    const revoked: string[] = []
    const cache = new TtsAudioCache({
      maxEntries: 1,
      maxBytes: 1_000,
      now: () => 0,
      revokeObjectUrl: (url) => revoked.push(url),
    })
    cache.put('a', clip('a', 1, { objectUrl: 'blob:a' }))
    cache.put('b', clip('b', 1, { objectUrl: 'blob:b' }))
    expect(revoked).toEqual(['blob:a'])
    expect(cache.size).toBe(1)
  })

  it('同 key 覆盖时 revoke 旧 objectUrl', () => {
    const revoked: string[] = []
    const cache = new TtsAudioCache({
      maxEntries: 4,
      maxBytes: 1_000,
      now: () => 0,
      revokeObjectUrl: (url) => revoked.push(url),
    })
    cache.put('a', clip('a', 1, { objectUrl: 'blob:old' }))
    cache.put('a', clip('a', 1, { objectUrl: 'blob:new' }))
    expect(revoked).toEqual(['blob:old'])
    expect(cache.bytes).toBe(1)
  })

  it('clear() revoke 全部 objectUrl', () => {
    const revoked: string[] = []
    const cache = new TtsAudioCache({
      maxEntries: 4,
      maxBytes: 1_000,
      now: () => 0,
      revokeObjectUrl: (url) => revoked.push(url),
    })
    cache.put('a', clip('a', 1, { objectUrl: 'blob:a' }))
    cache.put('b', clip('b', 1, { objectUrl: 'blob:b' }))
    cache.clear()
    expect(revoked).toEqual(['blob:a', 'blob:b'])
    expect(cache.size).toBe(0)
    expect(cache.bytes).toBe(0)
  })
})

describe('audio-cache · 命中触碰 LRU', () => {
  it('get 命中更新 lastUsedAt（影响后续淘汰顺序）', () => {
    let now = 100
    const cache = new TtsAudioCache({
      maxEntries: 2,
      maxBytes: 1_000,
      now: () => now,
    })
    cache.put('a', clip('a', 1, { lastUsedAt: 0 }))
    cache.put('b', clip('b', 1, { lastUsedAt: 1 }))
    now = 50
    expect(cache.get('a')).toBeDefined()
    cache.put('c', clip('c', 1, { lastUsedAt: 2 }))
    expect(cache.get('b')).toBeUndefined()
    expect(cache.get('a')).toBeDefined()
  })

  it('has 不触碰 LRU', () => {
    const cache = new TtsAudioCache({
      maxEntries: 2,
      maxBytes: 1_000,
      now: () => 999,
    })
    cache.put('a', clip('a', 1, { lastUsedAt: 0 }))
    cache.put('b', clip('b', 1, { lastUsedAt: 1 }))
    expect(cache.has('a')).toBe(true)
    cache.put('c', clip('c', 1, { lastUsedAt: 2 }))
    expect(cache.has('a')).toBe(false)
  })

  it('未命中返回 undefined', () => {
    const cache = new TtsAudioCache({ now: () => 0 })
    expect(cache.get('missing')).toBeUndefined()
  })
})
