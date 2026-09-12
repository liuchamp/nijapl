import {
  TTS_CACHE_MAX_BYTES,
  TTS_CACHE_MAX_ENTRIES,
} from '../../constants/tts.js'
import type { TtsAudioClip } from '../../types/tts.js'

/**
 * 内存 LRU 音频缓存（设计 §5.1–§5.3）。
 *
 * 红线（§8 平台文件职责边界）：**纯 TS**，零框架、零原生、零 DOM，可被 vitest/node 直接 import。
 * `URL.revokeObjectURL` 通过构造函数注入（默认读平台全局），便于单测用 fake 断言。
 *
 * 双限淘汰：条目数 `TTS_CACHE_MAX_ENTRIES` 与字节数 `TTS_CACHE_MAX_BYTES`，
 * 任一超限即按 LRU（`lastUsedAt` 最小）淘汰；淘汰时 revoke `objectUrl`（Web 防泄漏）。
 */

/** 构造选项（全部可注入，便于单测）。 */
export interface TtsAudioCacheOptions {
  /** 条目上限，默认 `TTS_CACHE_MAX_ENTRIES`。 */
  maxEntries?: number
  /** 字节上限，默认 `TTS_CACHE_MAX_BYTES`。 */
  maxBytes?: number
  /** 当前时间戳（毫秒）提供者，默认 `Date.now`。 */
  now?: () => number
  /** `objectUrl` 释放回调，默认读平台 `URL.revokeObjectURL`。 */
  revokeObjectUrl?: (url: string) => void
}

/** 读取平台 `URL.revokeObjectURL`；不存在时返回 no-op。 */
function defaultRevoke(): (url: string) => void {
  const scope = globalThis as {
    URL?: { revokeObjectURL?: (url: string) => void }
  }
  const fn = scope.URL?.revokeObjectURL
  if (typeof fn !== 'function') {
    return () => undefined
  }
  return (url: string): void => {
    try {
      fn.call(scope.URL, url)
    } catch {
      // 释放失败不影响淘汰流程。
    }
  }
}

/** 内存 LRU 音频缓存。 */
export class TtsAudioCache {
  private readonly entries = new Map<string, TtsAudioClip>()
  private totalBytes = 0
  private readonly maxEntries: number
  private readonly maxBytes: number
  private readonly now: () => number
  private readonly revoke: (url: string) => void

  constructor(options: TtsAudioCacheOptions = {}) {
    this.maxEntries = options.maxEntries ?? TTS_CACHE_MAX_ENTRIES
    this.maxBytes = options.maxBytes ?? TTS_CACHE_MAX_BYTES
    this.now = options.now ?? ((): number => Date.now())
    this.revoke = options.revokeObjectUrl ?? defaultRevoke()
  }

  /** 当前条目数。 */
  get size(): number {
    return this.entries.size
  }

  /** 当前占用字节数。 */
  get bytes(): number {
    return this.totalBytes
  }

  /**
   * 读取缓存；命中时更新 `lastUsedAt`（LRU 触碰）。
   *
   * @returns 命中的片段；未命中返回 `undefined`。
   */
  get(key: string): TtsAudioClip | undefined {
    const clip = this.entries.get(key)
    if (clip === undefined) {
      return undefined
    }
    clip.lastUsedAt = this.now()
    return clip
  }

  /** 是否命中（**不**触碰 LRU）。 */
  has(key: string): boolean {
    return this.entries.has(key)
  }

  /**
   * 写入缓存（先按双限淘汰，再落盘）。
   *
   * 同 key 覆盖时先移除旧条目（并 revoke 其 `objectUrl`）。
   */
  put(key: string, clip: TtsAudioClip): void {
    const existing = this.entries.get(key)
    if (existing !== undefined) {
      this.removeEntry(existing)
    }
    while (
      this.entries.size > 0 &&
      (this.entries.size >= this.maxEntries ||
        this.totalBytes + clip.byteLength > this.maxBytes)
    ) {
      this.evictOldest()
    }
    this.entries.set(key, clip)
    this.totalBytes += clip.byteLength
  }

  /** 清空缓存（释放全部 `objectUrl`）。 */
  clear(): void {
    for (const clip of this.entries.values()) {
      this.releaseClip(clip)
    }
    this.entries.clear()
    this.totalBytes = 0
  }

  /** 移除单条目（并释放 `objectUrl`）。 */
  private removeEntry(clip: TtsAudioClip): void {
    if (this.entries.delete(clip.key)) {
      this.totalBytes -= clip.byteLength
    }
    this.releaseClip(clip)
  }

  /** 淘汰 `lastUsedAt` 最小的条目。 */
  private evictOldest(): void {
    let oldestKey: string | undefined
    let oldestAt = Number.POSITIVE_INFINITY
    for (const [key, clip] of this.entries) {
      if (clip.lastUsedAt < oldestAt) {
        oldestAt = clip.lastUsedAt
        oldestKey = key
      }
    }
    if (oldestKey === undefined) {
      return
    }
    const clip = this.entries.get(oldestKey)
    if (clip !== undefined) {
      this.removeEntry(clip)
    }
  }

  /** 释放片段的 `objectUrl`（若存在）。 */
  private releaseClip(clip: TtsAudioClip): void {
    if (typeof clip.objectUrl === 'string' && clip.objectUrl !== '') {
      this.revoke(clip.objectUrl)
    }
  }
}
