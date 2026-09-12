import {
  TTS_BASE_URL,
  TTS_MAX_RETRIES,
  TTS_PREFETCH_TIMEOUT_MS,
  TTS_RETRY_BACKOFF_MS,
  TTS_TIMEOUT_MS,
  TTS_TRANSPORT,
} from '../../constants/tts.js'
import type {
  FetchLike,
  RequestInitLike,
  ResponseLike,
  TtsSourceFailure,
  TtsSourcePort,
  TtsSourceResult,
  TtsSynthesisParams,
  TtsTransport,
} from '../../types/tts.js'
import { TtsAudioCache } from './audio-cache.js'
import { TtsInflight } from './inflight.js'
import { buildSpeechUrl, buildSynthesizeRequest, cacheKey } from './request.js'

/**
 * HTTP 合成源（`TtsSourcePort` 实现，设计 §4.1 / §6）。
 *
 * 红线（§8 平台文件职责边界）：本文件仅依赖平台 `fetch`（**可注入**），
 * 不触碰原生模块 / DOM；零框架。vitest 可用 fake `fetch` 覆盖全部分支。
 *
 * 关注点：参数映射（由 `request.ts` 负责）→ `fetch` → 错误映射 → 缓存 → 并发去重 → 重试。
 */

/** 平台 `AbortController` 的最小结构。 */
interface AbortControllerLike {
  abort(): void
  signal: unknown
}

/** `AbortController` 构造器签名。 */
type AbortControllerCtor = new () => AbortControllerLike

/** 读取平台 `AbortController`；不存在时返回 `undefined`（V-2 兜底：跳过 abort）。 */
function readAbortControllerCtor(): AbortControllerCtor | undefined {
  const scope = globalThis as { AbortController?: unknown }
  return typeof scope.AbortController === 'function'
    ? (scope.AbortController as AbortControllerCtor)
    : undefined
}

/** 读取平台全局 `fetch`（默认注入源）。 */
export function readGlobalFetch(): FetchLike | undefined {
  const scope = globalThis as { fetch?: unknown }
  return typeof scope.fetch === 'function'
    ? (scope.fetch as FetchLike)
    : undefined
}

/** 模块级 `fetch` 覆盖（供测试 / 特殊宿主注入；构造参数优先）。 */
let globalFetchOverride: FetchLike | undefined

/** 设置模块级 `fetch`（传 `undefined` 清除）。 */
export function setTtsFetch(fetchImpl: FetchLike | undefined): void {
  globalFetchOverride = fetchImpl
}

/** 构造选项。 */
export interface TtsHttpClientOptions {
  /** 注入的 `fetch`（默认取模块级覆盖 → 平台全局 `fetch`）。 */
  fetch?: FetchLike
  /** 注入的缓存（默认新建）。 */
  cache?: TtsAudioCache
  /** 注入的并发去重器（默认新建）。 */
  inflight?: TtsInflight
  /** 服务 base URL（默认 `TTS_BASE_URL`）。 */
  baseUrl?: string
  /** 传输方式（默认 `TTS_TRANSPORT`）。 */
  transport?: TtsTransport
  /** 用户触发请求超时（默认 `TTS_TIMEOUT_MS`）。 */
  timeoutMs?: number
  /** 预取请求超时（默认 `TTS_PREFETCH_TIMEOUT_MS`）。 */
  prefetchTimeoutMs?: number
  /** 最多重试次数（默认 `TTS_MAX_RETRIES`）。 */
  maxRetries?: number
  /** 重试退避毫秒（默认 `TTS_RETRY_BACKOFF_MS`）。 */
  retryBackoffMs?: number
  /** 延时函数（默认 `setTimeout`；测试注入以避免真实等待）。 */
  delay?: (ms: number) => Promise<void>
}

const DEFAULT_MIME = 'audio/mpeg'
const B64_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

/** 标准 base64 → 字节；非法字符返回 `undefined`（不 throw）。 */
function decodeBase64(input: string): Uint8Array | undefined {
  const clean = input.endsWith('==')
    ? input.slice(0, -2)
    : input.endsWith('=')
      ? input.slice(0, -1)
      : input
  if (clean.length === 0) {
    return new Uint8Array(0)
  }
  if (!/^[A-Za-z0-9+/]*$/.test(clean)) {
    return undefined
  }
  const length = clean.length
  const bytes = new Uint8Array(Math.floor((length * 3) / 4))
  let buffer = 0
  let bits = 0
  let index = 0
  for (let i = 0; i < length; i += 1) {
    const value = B64_ALPHABET.indexOf(clean[i])
    if (value < 0) {
      return undefined
    }
    buffer = (buffer << 6) | value
    bits += 6
    if (bits >= 8) {
      bits -= 8
      bytes[index] = (buffer >> bits) & 0xff
      index += 1
    }
  }
  return bytes.subarray(0, index)
}

/** 字节 → 标准 base64（无换行、带 `=` 填充）。 */
function encodeBase64(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i]
    const b1: number | undefined = bytes[i + 1]
    const b2: number | undefined = bytes[i + 2]
    out += B64_ALPHABET[b0 >> 2]
    out += B64_ALPHABET[((b0 & 0x03) << 4) | ((b1 ?? 0) >> 4)]
    out +=
      b1 === undefined
        ? '='
        : B64_ALPHABET[((b1 & 0x0f) << 2) | ((b2 ?? 0) >> 6)]
    out += b2 === undefined ? '=' : B64_ALPHABET[b2 & 0x3f]
  }
  return out
}

/** 估算 base64 原文字节数（无法解码时的兜底）。 */
function estimateBase64Bytes(base64: string): number {
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding)
}

/** 读取响应头（大小写不敏感）。 */
function readHeader(response: ResponseLike, name: string): string | undefined {
  const get = response.headers?.get
  if (typeof get !== 'function') {
    return undefined
  }
  try {
    const value = get.call(response.headers, name)
    return typeof value === 'string' && value !== '' ? value : undefined
  } catch {
    return undefined
  }
}

/** 解析 `X-TTS-Cache` 头为布尔（读不到为 `undefined`，不影响播放）。 */
function readCachedHeader(response: ResponseLike): boolean | undefined {
  const value = readHeader(response, 'x-tts-cache')
  if (value === undefined) {
    return undefined
  }
  const lower = value.toLowerCase()
  if (lower === 'hit') {
    return true
  }
  if (lower === 'miss') {
    return false
  }
  return undefined
}

/** 从错误响应体读取服务端 `reason` 字段（尽力而为）。 */
async function readServiceReason(
  response: ResponseLike,
): Promise<string | undefined> {
  if (typeof response.json !== 'function') {
    return undefined
  }
  try {
    const data = await response.json()
    if (data !== null && typeof data === 'object') {
      const reason = (data as Record<string, unknown>).reason
      return typeof reason === 'string' ? reason : undefined
    }
  } catch {
    // 响应体非 JSON（裸流路由出错时的兜底）：忽略。
  }
  return undefined
}

/** 是否可重试。 */
function isRetriable(reason: TtsSourceFailure): boolean {
  return (
    reason === 'network' || reason === 'timeout' || reason === 'unavailable'
  )
}

/** HTTP 合成源实现。 */
export class TtsHttpClient implements TtsSourcePort {
  private readonly fetchImpl: FetchLike | undefined
  private readonly cache: TtsAudioCache
  private readonly inflight: TtsInflight
  private readonly baseUrl: string
  private readonly transport: TtsTransport
  private readonly timeoutMs: number
  private readonly prefetchTimeoutMs: number
  private readonly maxRetries: number
  private readonly retryBackoffMs: number
  private readonly delay: (ms: number) => Promise<void>

  /** 当前在途请求的取消句柄（`AbortController`，可能不存在）。 */
  private controller: AbortControllerLike | undefined
  /** 调用序号（`cancel()` 递增；用于丢弃迟到响应，§6.5）。 */
  private currentGen = 0

  constructor(options: TtsHttpClientOptions = {}) {
    this.fetchImpl = options.fetch ?? globalFetchOverride
    this.cache = options.cache ?? new TtsAudioCache()
    this.inflight = options.inflight ?? new TtsInflight()
    this.baseUrl = options.baseUrl ?? TTS_BASE_URL
    this.transport = options.transport ?? TTS_TRANSPORT
    this.timeoutMs = options.timeoutMs ?? TTS_TIMEOUT_MS
    this.prefetchTimeoutMs =
      options.prefetchTimeoutMs ?? TTS_PREFETCH_TIMEOUT_MS
    this.maxRetries = options.maxRetries ?? TTS_MAX_RETRIES
    this.retryBackoffMs = options.retryBackoffMs ?? TTS_RETRY_BACKOFF_MS
    this.delay =
      options.delay ??
      ((ms: number): Promise<void> =>
        new Promise((resolve) => {
          setTimeout(resolve, ms)
        }))
  }

  /** 暴露底层缓存（facade / 单测可复用同一实例）。 */
  getCache(): TtsAudioCache {
    return this.cache
  }

  async synthesize(
    params: TtsSynthesisParams,
    gen: number,
  ): Promise<TtsSourceResult> {
    if (params.text === '') {
      return { ok: false, reason: 'empty-text' }
    }
    this.currentGen = Math.max(this.currentGen, gen)
    const key = cacheKey(params)
    const hit = this.cache.get(key)
    if (hit !== undefined) {
      return { ok: true, clip: hit }
    }
    const result = await this.inflight.run(key, () =>
      this.fetchAndStore(key, params, this.timeoutMs),
    )
    if (gen !== this.currentGen) {
      // 迟到响应：已被 cancel / 更新的调用取代 → 丢弃，不出声（§6.5）。
      return { ok: false, reason: 'error', serviceReason: 'stale-gen' }
    }
    return result
  }

  prefetch(params: TtsSynthesisParams): void {
    if (params.text === '') {
      return
    }
    const key = cacheKey(params)
    if (this.cache.has(key)) {
      return
    }
    // fire-and-forget：失败静默（预取是纯优化，§5.4）。
    void this.inflight
      .run(key, () => this.fetchAndStore(key, params, this.prefetchTimeoutMs))
      .then(
        () => undefined,
        () => undefined,
      )
  }

  cancel(): void {
    this.currentGen += 1
    this.controller?.abort()
    this.controller = undefined
    this.inflight.clear()
  }

  /** 发起请求并把成功结果写入缓存。 */
  private async fetchAndStore(
    key: string,
    params: TtsSynthesisParams,
    timeoutMs: number,
  ): Promise<TtsSourceResult> {
    const result = await this.requestWithRetry(key, params, timeoutMs)
    if (result.ok) {
      this.cache.put(key, result.clip)
    }
    return result
  }

  /** 带重试的请求（`network` / `timeout` / `unavailable` 各重试 1 次）。 */
  private async requestWithRetry(
    key: string,
    params: TtsSynthesisParams,
    timeoutMs: number,
  ): Promise<TtsSourceResult> {
    let current = params
    for (let attempt = 0; ; attempt += 1) {
      const result = await this.attempt(key, current, timeoutMs)
      if (result.ok) {
        return result
      }
      if (result.reason === 'bad-request') {
        // 客户端参数 / 语种错误（程序 bug），重试无意义；记 warn 便于定位（§6.4）。
        console.warn(
          `[tts-client] bad-request: ${result.serviceReason ?? 'unknown'}`,
        )
      }
      if (!isRetriable(result.reason) || attempt >= this.maxRetries) {
        return result
      }
      if (
        result.reason === 'unavailable' &&
        typeof current.voice === 'string' &&
        current.voice !== ''
      ) {
        // 503：音色可能不被上游识别 → 重试时去掉 voice，回落到 lang 默认音色。
        current = { ...current, voice: undefined }
      }
      await this.delay(this.retryBackoffMs)
    }
  }

  /** 单次尝试（构造请求 + 超时 + abort + 错误映射）。 */
  private async attempt(
    key: string,
    params: TtsSynthesisParams,
    timeoutMs: number,
  ): Promise<TtsSourceResult> {
    const fetchImpl = this.fetchImpl ?? readGlobalFetch()
    if (fetchImpl === undefined) {
      return { ok: false, reason: 'network' }
    }
    const request: { url: string; init: RequestInitLike } =
      this.transport === 'json'
        ? buildSynthesizeRequest(params, this.baseUrl)
        : {
            url: buildSpeechUrl(this.baseUrl, params),
            init: { method: 'GET', headers: {} },
          }
    const activeController = createAbortController()
    if (activeController !== undefined) {
      this.controller = activeController
    }
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      activeController?.abort()
    }, timeoutMs)
    const init: RequestInitLike =
      activeController !== undefined
        ? { ...request.init, signal: activeController.signal }
        : request.init
    try {
      const response = await fetchImpl(request.url, init)
      clearTimeout(timer)
      if (!response.ok) {
        return await this.mapHttpError(response)
      }
      return await this.parseSuccess(key, response)
    } catch {
      clearTimeout(timer)
      if (timedOut) {
        return { ok: false, reason: 'timeout' }
      }
      return { ok: false, reason: 'network' }
    } finally {
      if (this.controller === activeController) {
        this.controller = undefined
      }
    }
  }

  /** HTTP 非 2xx → 分类失败（先判状态码，裸流路由出错也返回 JSON，H5）。 */
  private async mapHttpError(response: ResponseLike): Promise<TtsSourceResult> {
    const serviceReason = await readServiceReason(response)
    const status = response.status
    let reason: TtsSourceFailure = 'error'
    if (status === 400) {
      reason = 'bad-request'
    } else if (status === 503) {
      reason = 'unavailable'
    } else if (status === 504 || status === 408) {
      reason = 'timeout'
    }
    return { ok: false, reason, status, serviceReason }
  }

  /** 2xx → 解析为 `TtsAudioClip`（解析失败归一为 `'error'`，不冒泡为 `network`）。 */
  private async parseSuccess(
    key: string,
    response: ResponseLike,
  ): Promise<TtsSourceResult> {
    const mime = readHeader(response, 'content-type') ?? DEFAULT_MIME
    try {
      if (this.transport === 'json') {
        const data =
          typeof response.json === 'function'
            ? await response.json()
            : undefined
        if (data === null || typeof data !== 'object') {
          return { ok: false, reason: 'error', status: response.status }
        }
        const record = data as Record<string, unknown>
        const base64 =
          typeof record.audio === 'string' ? record.audio : undefined
        if (base64 === undefined || base64 === '') {
          return { ok: false, reason: 'error', status: response.status }
        }
        const bytes = decodeBase64(base64)
        const contentType =
          typeof record.content_type === 'string' && record.content_type !== ''
            ? record.content_type
            : mime
        const voice =
          typeof record.voice === 'string' ? record.voice : undefined
        const cached =
          typeof record.cached === 'boolean' ? record.cached : undefined
        return {
          ok: true,
          clip: {
            key,
            mime: contentType,
            bytes,
            base64,
            voice,
            cached,
            byteLength: bytes?.length ?? estimateBase64Bytes(base64),
            lastUsedAt: Date.now(),
          },
        }
      }
      // transport === 'stream'：裸流字节（依赖 V-1 `arrayBuffer()`）。
      if (typeof response.arrayBuffer === 'function') {
        const buffer = await response.arrayBuffer()
        const bytes = new Uint8Array(buffer)
        return {
          ok: true,
          clip: {
            key,
            mime,
            bytes,
            base64: encodeBase64(bytes),
            voice: readHeader(response, 'x-tts-voice'),
            cached: readCachedHeader(response),
            byteLength: bytes.length,
            lastUsedAt: Date.now(),
          },
        }
      }
      return { ok: false, reason: 'error', status: response.status }
    } catch {
      // 响应体解析失败（非法 JSON / 字节读取异常）→ 'error'。
      return { ok: false, reason: 'error', status: response.status }
    }
  }
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

/** 创建 HTTP 合成源端口。 */
export function createTtsHttpClient(
  options: TtsHttpClientOptions = {},
): TtsHttpClient {
  return new TtsHttpClient(options)
}
