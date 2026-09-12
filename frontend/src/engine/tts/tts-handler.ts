import { TTS_HANDLER_BASE, TTS_TIMEOUT_MS } from '../../constants/tts.js'
import type {
  FetchLike,
  RequestInitLike,
  TtsSourcePort,
  TtsSourceResult,
  TtsSynthesisParams,
} from '../../types/tts.js'
import { buildSpeechUrl, cacheKey } from './request.js'
import { toAudioClip, toSourceFailure } from './tts-client.wails.js'

/** 平台 `AbortController` 的最小结构。 */
interface AbortControllerLike {
  abort(): void
  signal: unknown
}

/** `AbortController` 构造器签名。 */
type AbortControllerCtor = new () => AbortControllerLike

/** 读取平台 `AbortController`；不存在时返回 `undefined`（跳过 abort）。 */
function readAbortControllerCtor(): AbortControllerCtor | undefined {
  const scope = globalThis as { AbortController?: unknown }
  return typeof scope.AbortController === 'function'
    ? (scope.AbortController as AbortControllerCtor)
    : undefined
}

/** 读取平台全局 `fetch`（默认注入源）。 */
function readGlobalFetch(): FetchLike | undefined {
  const scope = globalThis as { fetch?: unknown }
  return typeof scope.fetch === 'function'
    ? (scope.fetch as FetchLike)
    : undefined
}

/** 创建 `AbortController`（平台不存在时返回 `undefined`）。 */
function createAbortController(): AbortControllerLike | undefined {
  const Ctor = readAbortControllerCtor()
  if (Ctor === undefined) {
    return undefined
  }
  try {
    return new Ctor()
  } catch {
    return undefined
  }
}

/** 构造选项（`fetch` 可注入，默认取平台全局 `fetch`；供单测 fake 用）。 */
export interface TtsHandlerClientOptions {
  fetch?: FetchLike
}

/**
 * APK 同源 handler 合成源（`TtsSourcePort` 的 Go HTTP Handler 实现）。
 *
 * `GET /wails/tts/v1/tts/speech?...`（同源、仅 query、无 body）→ Go `TTS.ServeHTTP`
 * → `Synthesize` 管道（缓存/重试/去重全在 Go）→ JSON 信封 → Web Audio 播放。
 *
 * 与 `TtsWailsClient` 保持一致的语义：
 * - 空文本**不发起请求**，直接 `empty-text`；
 * - 迟到响应丢弃（`gen` 代数比对，防串音）；
 * - 失败走判别联合，**永不 throw**；
 * - 客户端**无缓存、无重试**（Go 拥有）。
 */
class TtsHandlerClient implements TtsSourcePort {
  private gen = 0
  private controller: AbortControllerLike | undefined
  private readonly fetchImpl: FetchLike | undefined

  constructor(options: TtsHandlerClientOptions = {}) {
    this.fetchImpl = options.fetch
  }

  async synthesize(
    params: TtsSynthesisParams,
    gen: number,
  ): Promise<TtsSourceResult> {
    if (params.text.trim() === '') {
      return { ok: false, reason: 'empty-text' }
    }
    this.gen = Math.max(this.gen, gen)
    const key = cacheKey(params)
    const url = buildSpeechUrl(TTS_HANDLER_BASE, params)

    const fetchImpl = this.fetchImpl ?? readGlobalFetch()
    if (fetchImpl === undefined) {
      return { ok: false, reason: 'network' }
    }

    const activeController = createAbortController()
    if (activeController !== undefined) {
      this.controller = activeController
    }
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      activeController?.abort()
    }, TTS_TIMEOUT_MS)
    const init: RequestInitLike =
      activeController !== undefined
        ? { method: 'GET', headers: {}, signal: activeController.signal }
        : { method: 'GET', headers: {} }
    let response: { json?: () => Promise<unknown> }
    try {
      response = await fetchImpl(url, init)
      clearTimeout(timer)
    } catch {
      clearTimeout(timer)
      if (this.controller === activeController) {
        this.controller = undefined
      }
      if (gen !== this.gen) {
        return { ok: false, reason: 'error', serviceReason: 'stale-gen' }
      }
      if (timedOut) {
        return { ok: false, reason: 'timeout' }
      }
      return { ok: false, reason: 'network' }
    }
    if (this.controller === activeController) {
      this.controller = undefined
    }
    if (gen !== this.gen) {
      return { ok: false, reason: 'error', serviceReason: 'stale-gen' }
    }
    let raw: unknown
    try {
      if (typeof response.json !== 'function') {
        return { ok: false, reason: 'error' }
      }
      raw = await response.json()
    } catch {
      if (gen !== this.gen) {
        return { ok: false, reason: 'error', serviceReason: 'stale-gen' }
      }
      return { ok: false, reason: 'error' }
    }

    if (gen !== this.gen) {
      return { ok: false, reason: 'error', serviceReason: 'stale-gen' }
    }
    if (raw === null || typeof raw !== 'object') {
      return { ok: false, reason: 'error' }
    }
    const record = raw as {
      ok?: unknown
      clip?: unknown
      reason?: unknown
      status?: unknown
      serviceReason?: unknown
    }
    if (
      record.ok !== true ||
      record.clip === null ||
      record.clip === undefined
    ) {
      const reason =
        typeof record.reason === 'string' ? record.reason : undefined
      const status = typeof record.status === 'number' ? record.status : 0
      const serviceReason =
        typeof record.serviceReason === 'string' ? record.serviceReason : ''
      return {
        ok: false,
        reason: toSourceFailure(reason),
        status: status === 0 ? undefined : status,
        serviceReason: serviceReason === '' ? undefined : serviceReason,
      }
    }
    const clip = record.clip as {
      key: unknown
      mime: unknown
      base64: unknown
      voice: unknown
      cached: unknown
      byteLength: unknown
    }
    if (typeof clip.base64 !== 'string' || clip.base64 === '') {
      return { ok: false, reason: 'error' }
    }
    return {
      ok: true,
      clip: toAudioClip(
        {
          key: typeof clip.key === 'string' ? clip.key : '',
          mime: typeof clip.mime === 'string' ? clip.mime : '',
          base64: clip.base64,
          voice: typeof clip.voice === 'string' ? clip.voice : '',
          cached: clip.cached === true,
          byteLength: typeof clip.byteLength === 'number' ? clip.byteLength : 0,
        },
        key,
      ),
    }
  }

  prefetch(params: TtsSynthesisParams): void {
    if (params.text.trim() === '') {
      return
    }
    const fetchImpl = this.fetchImpl ?? readGlobalFetch()
    if (fetchImpl === undefined) {
      return
    }
    const url = buildSpeechUrl(TTS_HANDLER_BASE, params)
    void fetchImpl(url, { method: 'GET', headers: {} }).then(
      () => undefined,
      () => undefined,
    )
  }

  cancel(): void {
    this.gen += 1
    this.controller?.abort()
    this.controller = undefined
  }
}

/** 创建 APK 同源 handler 合成源。 */
export function createTtsHandlerClient(
  options: TtsHandlerClientOptions = {},
): TtsSourcePort {
  return new TtsHandlerClient(options)
}
