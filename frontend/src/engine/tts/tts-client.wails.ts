import { TTS } from '../../../bindings/nijapl/internal/services/index.js'
import type {
  TtsAudioClip,
  TtsSourceFailure,
  TtsSourcePort,
  TtsSourceResult,
  TtsSynthesisParams,
} from '../../types/tts.js'
import { cacheKey } from './request.js'

/**
 * TTS 合成源的 Wails 适配器（`TtsSourcePort` 的 Go 侧实现）。
 *
 * 替代原 Lynx 工程中前端 `fetch` 直连 ttsedservice 的实现（`tts-client.ts`）：
 * 桌面 WebView 同样执行同源策略，页面直连 `http://127.0.0.1:8000` 会被 CORS 拦截，
 * 因此网络与重试下沉到 Go（`internal/services/tts.go`），前端只保留编排与降级链。
 *
 * 与原 HTTP 实现保持一致的语义：
 * - 空文本**不发起请求**，直接 `empty-text`；
 * - 迟到响应丢弃（`gen` 代数比对，防串音）；
 * - 失败走判别联合，**永不 throw**。
 */
class TtsWailsClient implements TtsSourcePort {
  /** 调用代数：每次 `cancel()` / 新 `synthesize()` 递增，用于丢弃迟到响应。 */
  private gen = 0

  async synthesize(
    params: TtsSynthesisParams,
    gen: number,
  ): Promise<TtsSourceResult> {
    if (params.text.trim() === '') {
      return { ok: false, reason: 'empty-text' }
    }
    const key = cacheKey(params)

    let raw: Awaited<ReturnType<typeof TTS.Synthesize>>
    try {
      raw = await TTS.Synthesize({
        text: params.text,
        lang: params.lang,
        voice: params.voice ?? '',
        rate: params.rate,
        volume: params.volume,
        pitch: params.pitch,
        format: params.format,
        key,
      })
    } catch {
      // 绑定调用失败（宿主不可达）：等价于网络错误，交给上层降级链。
      return { ok: false, reason: 'network' }
    }

    if (gen !== this.gen) {
      // 迟到响应：丢弃结果不出声（与 HTTP 实现同语义）。
      return { ok: false, reason: 'error', serviceReason: 'stale-gen' }
    }

    if (!raw.ok || raw.clip === null || raw.clip === undefined) {
      return {
        ok: false,
        reason: toSourceFailure(raw.reason),
        status: raw.status === 0 ? undefined : raw.status,
        serviceReason: raw.serviceReason === '' ? undefined : raw.serviceReason,
      }
    }

    return { ok: true, clip: toAudioClip(raw.clip, key) }
  }

  prefetch(params: TtsSynthesisParams): void {
    if (params.text.trim() === '') {
      return
    }
    // fire-and-forget：失败静默（Go 侧已做去重与缓存）。
    void Promise.resolve(
      TTS.Prefetch({
        text: params.text,
        lang: params.lang,
        voice: params.voice ?? '',
        rate: params.rate,
        volume: params.volume,
        pitch: params.pitch,
        format: params.format,
        key: cacheKey(params),
      }),
    ).catch(() => undefined)
  }

  cancel(): void {
    this.gen += 1
    void Promise.resolve(TTS.Cancel()).catch(() => undefined)
  }
}

/** 创建 Wails TTS 合成源。 */
export function createTtsWailsClient(): TtsSourcePort {
  return new TtsWailsClient()
}

/** Go 侧 reason 字符串 → 前端判别联合的字面量（未知一律归 `error`）。 */
function toSourceFailure(reason: string | undefined): TtsSourceFailure {
  switch (reason) {
    case 'empty-text':
    case 'bad-request':
    case 'unavailable':
    case 'timeout':
    case 'network':
    case 'error':
      return reason
    default:
      return 'error'
  }
}

/** Go 侧 AudioClip → 前端 `TtsAudioClip`（补 `bytes` 供 Blob 播放，保留 `base64`）。 */
function toAudioClip(
  clip: {
    key: string
    mime: string
    base64: string
    voice: string
    cached: boolean
    byteLength: number
  },
  key: string,
): TtsAudioClip {
  const bytes = decodeBase64(clip.base64)
  return {
    key: clip.key === '' ? key : clip.key,
    mime: clip.mime === '' ? 'audio/mpeg' : clip.mime,
    bytes,
    base64: clip.base64,
    voice: clip.voice === '' ? undefined : clip.voice,
    cached: clip.cached,
    byteLength: clip.byteLength > 0 ? clip.byteLength : (bytes?.length ?? 0),
    lastUsedAt: Date.now(),
  }
}

/** 浏览器 base64 → 字节（解码失败返回 undefined，不 throw）。 */
function decodeBase64(input: string): Uint8Array | undefined {
  if (input === '') {
    return undefined
  }
  try {
    const binary = globalThis.atob(input)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i)
    }
    return bytes
  } catch {
    return undefined
  }
}
