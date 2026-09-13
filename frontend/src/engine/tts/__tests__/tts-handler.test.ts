import { describe, expect, it } from 'vitest'

import type {
  FetchLike,
  RequestInitLike,
  ResponseLike,
  TtsSynthesisParams,
} from '../../../types/tts.js'
import { buildSynthesisParams } from '../request.js'
import { createTtsHandlerClient } from '../tts-handler.js'

function params(text = 'ねこ'): TtsSynthesisParams {
  return buildSynthesisParams(text)
}

/** Go 信封成功体。 */
function okEnvelope(
  clip: Record<string, unknown> = {
    key: '',
    mime: 'audio/mpeg',
    base64: 'AAAA',
    voice: 'ja-JP-NanamiNeural',
    cached: false,
    byteLength: 3,
  },
): ResponseLike {
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    json: async () => ({ ok: true, clip }),
  }
}

type Handler = (url: string, init?: RequestInitLike) => Promise<ResponseLike>

/** 记录调用并按顺序返回响应的 fake `fetch`（与 tts-client.test.ts 同风格）。 */
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

describe('tts-handler · 同源 Go handler', () => {
  it('成功时映射 clip（同源 GET，query only）', async () => {
    const { fetch, calls } = recorder([() => Promise.resolve(okEnvelope())])
    const client = createTtsHandlerClient({ fetch })
    const res = await client.synthesize(params(), 1)
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.clip.base64).toBe('AAAA')
      expect(res.clip.bytes?.length).toBe(3)
      expect(res.clip.mime).toBe('audio/mpeg')
      expect(res.clip.voice).toBe('ja-JP-NanamiNeural')
    }
    expect(calls).toHaveLength(1)
    expect(calls[0].url.startsWith('/wails/tts/v1/tts/speech?')).toBe(true)
    expect(calls[0].init?.method).toBe('GET')
    expect(calls[0].init?.body).toBeUndefined()
  })

  it('cancel() 后到达的迟到响应被丢弃（stale-gen）', async () => {
    let release: (response: ResponseLike) => void = () => undefined
    const pending = new Promise<ResponseLike>((resolve) => {
      release = resolve
    })
    const { fetch } = recorder([() => pending])
    const client = createTtsHandlerClient({ fetch })
    const inFlight = client.synthesize(params(), 1)
    client.cancel()
    release(okEnvelope())
    const res = await inFlight
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.serviceReason).toBe('stale-gen')
    }
  })

  it('空文本不发请求（empty-text）', async () => {
    const { fetch, calls } = recorder([() => Promise.resolve(okEnvelope())])
    const client = createTtsHandlerClient({ fetch })
    const res = await client.synthesize(params('   '), 1)
    expect(res).toEqual({ ok: false, reason: 'empty-text' })
    expect(calls).toHaveLength(0)
  })

  it('非法 JSON 信封 → error', async () => {
    const bad: ResponseLike = {
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: () => Promise.reject(new Error('invalid json')),
    }
    const { fetch } = recorder([() => Promise.resolve(bad)])
    const client = createTtsHandlerClient({ fetch })
    const res = await client.synthesize(params(), 1)
    expect(res).toEqual({ ok: false, reason: 'error' })
  })
})
