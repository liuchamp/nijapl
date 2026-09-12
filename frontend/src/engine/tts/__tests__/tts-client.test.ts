import { afterEach, describe, expect, it, vi } from 'vitest'

import type {
  FetchLike,
  RequestInitLike,
  ResponseLike,
  TtsSynthesisParams,
} from '../../../types/tts.js'
import { buildSynthesisParams } from '../request.js'
import { TtsHttpClient } from '../tts-client.js'

const BASE = 'http://tts.test'

function params(
  overrides: { rate?: number; pitch?: number } = {},
): TtsSynthesisParams {
  return buildSynthesisParams('ねこ', overrides)
}

/** 2xx JSON 响应。 */
function okJson(
  body: Record<string, unknown>,
  headers: Record<string, string> = {},
): ResponseLike {
  return {
    ok: true,
    status: 200,
    headers: { get: (name) => headers[name.toLowerCase()] ?? null },
    json: async () => body,
  }
}

/** 非 2xx 响应（错误体为 JSON）。 */
function errStatus(
  status: number,
  body: Record<string, unknown> = {},
): ResponseLike {
  return {
    ok: false,
    status,
    headers: { get: () => null },
    json: async () => body,
  }
}

type Handler = (url: string, init?: RequestInitLike) => Promise<ResponseLike>

/** 记录调用并按顺序返回响应的 fake `fetch`。 */
function recorder(handlers: Handler[]): {
  fetch: FetchLike
  calls: Array<{ url: string; init?: RequestInitLike }>
} {
  const calls: Array<{ url: string; init?: RequestInitLike }> = []
  let index = 0
  const fetchImpl: FetchLike = (url, init) => {
    calls.push({ url, init })
    const handler = handlers[Math.min(index, handlers.length - 1)]
    index += 1
    return handler(url, init)
  }
  return { fetch: fetchImpl, calls }
}

/** 无真实等待的延时函数。 */
const noDelay = (): Promise<void> => Promise.resolve()

/** 冲刷微任务 + 一个宏任务。 */
const flush = (): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, 0)
  })

afterEach(() => {
  vi.restoreAllMocks()
})

describe('tts-client · 成功与缓存', () => {
  it('JSON 传输解析 base64 与元数据', async () => {
    const { fetch, calls } = recorder([
      () =>
        Promise.resolve(
          okJson({
            audio: 'AAAA',
            content_type: 'audio/mpeg',
            voice: 'ja-JP-NanamiNeural',
            cached: false,
          }),
        ),
    ])
    const client = new TtsHttpClient({ fetch, baseUrl: BASE })
    const res = await client.synthesize(params(), 1)
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.clip.base64).toBe('AAAA')
      expect(res.clip.bytes?.length).toBe(3)
      expect(res.clip.mime).toBe('audio/mpeg')
      expect(res.clip.voice).toBe('ja-JP-NanamiNeural')
      expect(res.clip.cached).toBe(false)
      expect(res.clip.byteLength).toBe(3)
    }
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe(`${BASE}/v1/tts/synthesize`)
    const body = JSON.parse(calls[0].init?.body ?? '{}') as Record<
      string,
      string
    >
    expect(body.lang).toBe('ja-JP')
    expect(calls[0].init?.method).toBe('POST')
  })

  it('缓存命中不再发起网络请求', async () => {
    const { fetch, calls } = recorder([
      () => Promise.resolve(okJson({ audio: 'AAAA' })),
    ])
    const client = new TtsHttpClient({ fetch, baseUrl: BASE })
    const first = await client.synthesize(params(), 1)
    const second = await client.synthesize(params(), 1)
    expect(first.ok && second.ok).toBe(true)
    expect(calls).toHaveLength(1)
  })
})

describe('tts-client · 错误映射', () => {
  it('400 → bad-request，不重试，serviceReason 透传', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const { fetch, calls } = recorder([
      () => Promise.resolve(errStatus(400, { reason: 'TTS_INVALID_ARGUMENT' })),
    ])
    const client = new TtsHttpClient({ fetch, baseUrl: BASE, delay: noDelay })
    const res = await client.synthesize(params(), 1)
    expect(res).toEqual({
      ok: false,
      reason: 'bad-request',
      status: 400,
      serviceReason: 'TTS_INVALID_ARGUMENT',
    })
    expect(calls).toHaveLength(1)
  })

  it('503 → unavailable，重试时去掉 voice', async () => {
    const { fetch, calls } = recorder([
      () =>
        Promise.resolve(errStatus(503, { reason: 'TTS_UPSTREAM_UNAVAILABLE' })),
      () => Promise.resolve(okJson({ audio: 'AAAA' })),
    ])
    const client = new TtsHttpClient({ fetch, baseUrl: BASE, delay: noDelay })
    const res = await client.synthesize(params(), 1)
    expect(res.ok).toBe(true)
    expect(calls).toHaveLength(2)
    const first = JSON.parse(calls[0].init?.body ?? '{}') as Record<
      string,
      unknown
    >
    const second = JSON.parse(calls[1].init?.body ?? '{}') as Record<
      string,
      unknown
    >
    expect('voice' in first).toBe(true)
    expect('voice' in second).toBe(false)
  })

  it('504 → timeout，最多重试 1 次', async () => {
    const { fetch, calls } = recorder([
      () => Promise.resolve(errStatus(504, { reason: 'TTS_UPSTREAM_TIMEOUT' })),
      () => Promise.resolve(errStatus(504, { reason: 'TTS_UPSTREAM_TIMEOUT' })),
    ])
    const client = new TtsHttpClient({ fetch, baseUrl: BASE, delay: noDelay })
    const res = await client.synthesize(params(), 1)
    expect(res).toEqual({
      ok: false,
      reason: 'timeout',
      status: 504,
      serviceReason: 'TTS_UPSTREAM_TIMEOUT',
    })
    expect(calls).toHaveLength(2)
  })

  it('网络 reject → network 并重试 1 次', async () => {
    const { fetch, calls } = recorder([
      () => Promise.reject(new Error('boom')),
      () => Promise.reject(new Error('boom')),
    ])
    const client = new TtsHttpClient({ fetch, baseUrl: BASE, delay: noDelay })
    const res = await client.synthesize(params(), 1)
    expect(res).toEqual({ ok: false, reason: 'network' })
    expect(calls).toHaveLength(2)
  })

  it('JSON 解析失败 → error，不重试', async () => {
    const bad: ResponseLike = {
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: () => Promise.reject(new Error('invalid json')),
    }
    const { fetch, calls } = recorder([() => Promise.resolve(bad)])
    const client = new TtsHttpClient({ fetch, baseUrl: BASE, delay: noDelay })
    const res = await client.synthesize(params(), 1)
    expect(res).toEqual({ ok: false, reason: 'error', status: 200 })
    expect(calls).toHaveLength(1)
  })

  it('客户端超时（fake fetch 永不 resolve）在 timeoutMs 内返回 timeout', async () => {
    const hanging: FetchLike = (_url, init) =>
      new Promise<ResponseLike>((_resolve, reject) => {
        const signal = init?.signal as
          | { addEventListener?: (type: string, cb: () => void) => void }
          | undefined
        signal?.addEventListener?.('abort', () => {
          reject(new Error('aborted'))
        })
      })
    const client = new TtsHttpClient({
      fetch: hanging,
      baseUrl: BASE,
      timeoutMs: 10,
      maxRetries: 0,
      delay: noDelay,
    })
    const start = Date.now()
    const res = await client.synthesize(params(), 1)
    expect(res).toEqual({ ok: false, reason: 'timeout' })
    expect(Date.now() - start).toBeLessThan(1000)
  })
})

describe('tts-client · 并发去重与 gen', () => {
  it('同 key 并发只发一次网络请求', async () => {
    let release: (response: ResponseLike) => void = () => undefined
    const pending = new Promise<ResponseLike>((resolve) => {
      release = resolve
    })
    const { fetch, calls } = recorder([() => pending])
    const client = new TtsHttpClient({ fetch, baseUrl: BASE })
    const first = client.synthesize(params(), 1)
    const second = client.synthesize(params(), 1)
    release(okJson({ audio: 'AAAA' }))
    const [r1, r2] = await Promise.all([first, second])
    expect(calls).toHaveLength(1)
    expect(r1.ok && r2.ok).toBe(true)
  })

  it('失败结果不入缓存、in-flight 立即删除', async () => {
    const { fetch, calls } = recorder([
      () => Promise.reject(new Error('boom')),
      () => Promise.reject(new Error('boom')),
    ])
    const client = new TtsHttpClient({
      fetch,
      baseUrl: BASE,
      maxRetries: 0,
      delay: noDelay,
    })
    await client.synthesize(params(), 1)
    await client.synthesize(params(), 1)
    expect(calls).toHaveLength(2)
  })

  it('cancel() 后到达的迟到响应被丢弃（不出声）', async () => {
    let release: (response: ResponseLike) => void = () => undefined
    const pending = new Promise<ResponseLike>((resolve) => {
      release = resolve
    })
    const { fetch } = recorder([() => pending])
    const client = new TtsHttpClient({ fetch, baseUrl: BASE })
    const inFlight = client.synthesize(params(), 1)
    client.cancel()
    release(okJson({ audio: 'AAAA' }))
    const res = await inFlight
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.serviceReason).toBe('stale-gen')
    }
  })
})

describe('tts-client · stream 传输与边界', () => {
  it('stream 传输走 /v1/tts/speech 并读取裸流字节与头', async () => {
    const streamResponse: ResponseLike = {
      ok: true,
      status: 200,
      headers: {
        get: (name) => {
          const key = name.toLowerCase()
          if (key === 'content-type') return 'audio/mpeg'
          if (key === 'x-tts-voice') return 'ja-JP-NanamiNeural'
          if (key === 'x-tts-cache') return 'hit'
          return null
        },
      },
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    }
    const { fetch, calls } = recorder([() => Promise.resolve(streamResponse)])
    const client = new TtsHttpClient({
      fetch,
      baseUrl: BASE,
      transport: 'stream',
    })
    const res = await client.synthesize(params(), 1)
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.clip.bytes?.length).toBe(3)
      expect(res.clip.base64).toBe('AQID')
      expect(res.clip.mime).toBe('audio/mpeg')
      expect(res.clip.voice).toBe('ja-JP-NanamiNeural')
      expect(res.clip.cached).toBe(true)
    }
    expect(calls[0].url.startsWith(`${BASE}/v1/tts/speech?`)).toBe(true)
    expect(calls[0].init?.method).toBe('GET')
  })

  it('空文本不发请求（empty-text）', async () => {
    const { fetch, calls } = recorder([
      () => Promise.resolve(okJson({ audio: 'AAAA' })),
    ])
    const client = new TtsHttpClient({ fetch, baseUrl: BASE })
    const res = await client.synthesize(buildSynthesisParams('   '), 1)
    expect(res).toEqual({ ok: false, reason: 'empty-text' })
    expect(calls).toHaveLength(0)
  })

  it('prefetch 成功后写入缓存', async () => {
    const { fetch, calls } = recorder([
      () => Promise.resolve(okJson({ audio: 'AAAA' })),
    ])
    const client = new TtsHttpClient({ fetch, baseUrl: BASE })
    client.prefetch(params())
    await flush()
    expect(calls).toHaveLength(1)
    expect(client.getCache().size).toBe(1)
  })

  it('prefetch 失败静默（不 throw、不入缓存）', async () => {
    const { fetch } = recorder([() => Promise.reject(new Error('boom'))])
    const client = new TtsHttpClient({ fetch, baseUrl: BASE, delay: noDelay })
    expect(() => client.prefetch(params())).not.toThrow()
    await flush()
    expect(client.getCache().size).toBe(0)
  })
})
