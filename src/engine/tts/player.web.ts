import { SILENT_AUDIO_DATA_URI } from '../../constants/tts.js'
import type {
  AudioPlaybackCapability,
  AudioPlayerPort,
  AudioPlayResult,
  TtsAudioClip,
} from '../../types/tts.js'

/**
 * Web 音频播放实现（设计 §4.4，DOM `<audio>` + Blob URL）。
 *
 * 红线（§8 平台文件职责边界）：
 * - **仅使用 DOM `Audio` / `Blob` / `URL`**，不 import 原生；
 * - 能力探测 `typeof globalThis.Audio === 'function'`：Lynx for Web 后台线程可能无 DOM（V-6）
 *   → 探测不到即返回 `null`（facade 回落实时合成），**绝不崩**；
 * - 端口契约：**永不 throw**，失败以 `{ok:false, reason}` 返回（`NotAllowedError` → `blocked`）。
 *
 * 采用 Blob URL 而非直连远端 URL：能读状态码 / 精确错误分类 / 进内存缓存 / 可取消（§4.4）。
 */

/** `<audio>` 元素的最小结构。 */
interface AudioElementLike {
  src: string
  currentTime: number
  play(): Promise<void>
  pause(): void
}

/** `Audio` 构造器签名。 */
type AudioCtor = new (src?: string) => AudioElementLike

/** Web 音频相关全局。 */
interface WebAudioGlobal {
  Audio?: unknown
  Blob?: new (parts: Array<Uint8Array>, options?: { type?: string }) => unknown
  URL?: {
    createObjectURL?: (blob: unknown) => string
    revokeObjectURL?: (url: string) => void
  }
  atob?: (data: string) => string
}

function readWebAudioGlobal(): WebAudioGlobal {
  return globalThis as unknown as WebAudioGlobal
}

/** 判断是否自动播放被拦截。 */
function isBlockedError(error: unknown): boolean {
  if (error === null || typeof error !== 'object') {
    return false
  }
  const name = (error as { name?: unknown }).name
  return name === 'NotAllowedError' || name === 'SecurityError'
}

/** base64 → 字节（Web 环境 `atob` 可用；缺失则返回 `undefined`，由 `play-error` 兜底）。 */
function base64ToBytes(base64: string): Uint8Array | undefined {
  const scope = readWebAudioGlobal()
  if (typeof scope.atob !== 'function') {
    return undefined
  }
  try {
    const binary = scope.atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i) & 0xff
    }
    return bytes
  } catch {
    return undefined
  }
}

/** Web 实现（单例 `<audio>` 元素）。 */
class WebAudioPlayerPort implements AudioPlayerPort {
  private readonly Ctor: AudioCtor
  private el: AudioElementLike | undefined
  private unlocked = false

  constructor(Ctor: AudioCtor) {
    this.Ctor = Ctor
  }

  getCapability(): AudioPlaybackCapability {
    return 'supported'
  }

  /** 惰性创建并**全程复用**同一 `<audio>` 元素。 */
  private ensureEl(): AudioElementLike {
    if (this.el === undefined) {
      this.el = new this.Ctor()
    }
    return this.el
  }

  /**
   * 在用户手势调用栈内**同步**解锁自动播放（iOS 必需）。
   *
   * `el.src = SILENT_AUDIO_DATA_URI; el.play()`：首次 `play()` 发生在手势内即解锁；
   * 解锁失败不抛出、不阻塞（后续 `play()` 仍会尝试）。
   */
  prime(): void {
    if (this.unlocked) {
      return
    }
    try {
      const el = this.ensureEl()
      el.src = SILENT_AUDIO_DATA_URI
      const promise = el.play()
      if (promise !== undefined && typeof promise.then === 'function') {
        void promise.then(
          () => {
            this.unlocked = true
          },
          () => undefined,
        )
      }
    } catch {
      // 解锁失败静默：真正的播放会再尝试一次。
    }
  }

  async play(clip: TtsAudioClip): Promise<AudioPlayResult> {
    try {
      const url = this.resolvePlayableUrl(clip)
      if (url === undefined) {
        return { ok: false, reason: 'play-error' }
      }
      const el = this.ensureEl()
      el.src = url
      el.currentTime = 0
      await el.play()
      return { ok: true, channel: 'web' }
    } catch (error) {
      if (isBlockedError(error)) {
        return { ok: false, reason: 'blocked' }
      }
      return { ok: false, reason: 'play-error' }
    }
  }

  /** 停播（**不 revoke** Blob URL —— 缓存仍可能复用）。 */
  stop(): void {
    try {
      if (this.el !== undefined) {
        this.el.pause()
        this.el.currentTime = 0
      }
    } catch {
      // 端口契约：永不 throw。
      return
    }
  }

  /**
   * 取得可播放 URL。
   *
   * 优先复用 `clip.objectUrl`（缓存淘汰统一 revoke）；否则由 `bytes` / `base64` 构建 Blob URL
   * 并**回写** `clip.objectUrl`，使缓存淘汰时能 revoke（§5.3）。
   */
  private resolvePlayableUrl(clip: TtsAudioClip): string | undefined {
    if (typeof clip.objectUrl === 'string' && clip.objectUrl !== '') {
      return clip.objectUrl
    }
    const bytes = this.resolveBytes(clip)
    if (bytes === undefined) {
      return undefined
    }
    const scope = readWebAudioGlobal()
    const BlobCtor = scope.Blob
    const createObjectURL = scope.URL?.createObjectURL
    if (
      typeof BlobCtor !== 'function' ||
      typeof createObjectURL !== 'function'
    ) {
      return undefined
    }
    try {
      const blob = new BlobCtor([bytes], { type: clip.mime })
      const url = createObjectURL.call(scope.URL, blob)
      if (typeof url === 'string' && url !== '') {
        clip.objectUrl = url
        return url
      }
    } catch {
      return undefined
    }
    return undefined
  }

  /** 取字节（优先 `clip.bytes`，否则由 `base64` 解码并回写）。 */
  private resolveBytes(clip: TtsAudioClip): Uint8Array | undefined {
    if (clip.bytes !== undefined && clip.bytes.byteLength > 0) {
      return clip.bytes
    }
    if (typeof clip.base64 === 'string' && clip.base64 !== '') {
      const bytes = base64ToBytes(clip.base64)
      if (bytes !== undefined) {
        clip.bytes = bytes
        return bytes
      }
    }
    return undefined
  }
}

/**
 * 创建 Web 播放端口。
 *
 * @returns 存在 DOM `Audio` 时返回实现；否则 `null`（探测不到即降级，不崩）。
 */
export function createWebAudioPlayer(): AudioPlayerPort | null {
  const scope = readWebAudioGlobal()
  if (typeof scope.Audio !== 'function') {
    return null
  }
  return new WebAudioPlayerPort(scope.Audio as AudioCtor)
}
