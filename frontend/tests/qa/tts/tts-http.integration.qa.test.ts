/**
 * QA 独立验证 · TTS HTTP 接入 **真实服务集成测试**（B1–B7）。
 *
 * 目的：用 `src/engine/tts/tts-client.ts` 的**真实 `fetch`** 打**真实运行的**自建 TTS 服务
 * （默认 `http://127.0.0.1:8000`，可用 `TTS_BASE_URL` 覆盖），证明而非假设以下行为：
 *   B1 合成返回真实音频字节（JSON / 裸流两条传输）；
 *   B2 客户端缓存零网络 + 服务端 `X-TTS-Cache: hit`；
 *   B3 `rate` 变化确实重新请求且字节数变化（cacheKey 含 rate 生效）；
 *   B4 迟到响应（gen 失配）不出声；
 *   B5 超时窗口内返回 `timeout` 且**恰好重试 1 次**（总请求数 = 2）；
 *   B6 坏 `voice`（真实 503）→ 去 `voice` 重试 → 成功且回落到日语默认音色；
 *   B7 坏 `lang`（真实 400）→ **不重试**，只发一次请求。
 *
 * 纪律：
 * - **不修改 `src/**` 与任何配置**；只消费既有公共 API（`TtsHttpClient` / `ResolvingTtsPort`）。
 * - 服务不可达 → 整组**优雅跳过**（`describe.skipIf`），绝不降级成 fake 测试冒充通过；
 *   跳过状态会打印 `[QA-INTEGRATION-SKIP]` 便于报告中如实标注。
 */

import { describe, expect, it } from 'vitest'

import { TTS_DEFAULT_VOICE } from '../../../src/constants/tts.js'
import { ResolvingTtsPort } from '../../../src/engine/tts/index.js'
import {
  buildSynthesisParams,
  cacheKey,
} from '../../../src/engine/tts/request.js'
import { TtsHttpClient } from '../../../src/engine/tts/tts-client.js'
import type { TtsPort } from '../../../src/types/ports.js'
import type {
  AudioPlayerPort,
  FetchLike,
  RequestInitLike,
  ResponseLike,
  TtsAudioClip,
  TtsSynthesisParams,
} from '../../../src/types/tts.js'

/** 真实服务 base URL（默认与常量一致；可经环境变量覆盖）。 */
const BASE = process.env.TTS_BASE_URL ?? 'http://127.0.0.1:8000'

/** 平台真实 `fetch`（Node ≥18 / 浏览器均提供）。 */
const nativeFetch = (globalThis as { fetch?: unknown }).fetch as
  | FetchLike
  | undefined

/** 无真实等待的退避（避免测试变慢）。 */
const noDelay = (): Promise<void> => Promise.resolve()

/** 可达性探测：`GET /v1/tts/languages`，2.5s 超时。 */
async function probeService(): Promise<boolean> {
  if (typeof nativeFetch !== 'function') {
    return false
  }
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 2500)
    const response = await nativeFetch(`${BASE}/v1/tts/languages`, {
      method: 'GET',
      headers: {},
      signal: controller.signal,
    })
    clearTimeout(timer)
    return response.ok && response.status === 200
  } catch {
    return false
  }
}

const reachable = await probeService()
if (!reachable) {
  console.warn(
    `[QA-INTEGRATION-SKIP] TTS 服务不可达（${BASE}）→ 真实集成测试整组跳过；` +
      '本次验证不覆盖 B1–B7，报告中须如实标注「未执行」。',
  )
}

/** 记录调用的 fetch 包装（用于证明「零网络」「只发一次」等）。 */
function counting(inner: FetchLike): {
  fetchImpl: FetchLike
  calls: Array<{ url: string; init?: RequestInitLike }>
} {
  const calls: Array<{ url: string; init?: RequestInitLike }> = []
  const fetchImpl: FetchLike = (url, init) => {
    calls.push({ url, init })
    return inner(url, init)
  }
  return { fetchImpl, calls }
}

/** 不可用的实时合成端口（隔离 HTTP 主链路的观测）。 */
const unsupportedRealtime: TtsPort = {
  getCapability: () => 'unsupported',
  speak: async () => ({ ok: false, reason: 'no-tts' }),
  stop: () => undefined,
  getVoices: async () => [],
}

/** 记录播放的 fake 播放器（HTTP 主链路用；不触碰真实音频输出）。 */
function recordingPlayer(): {
  player: AudioPlayerPort
  played: TtsAudioClip[]
} {
  const played: TtsAudioClip[] = []
  const player: AudioPlayerPort = {
    getCapability: () => 'supported',
    prime: () => undefined,
    play: async (clip) => {
      played.push(clip)
      return { ok: true, channel: 'web' }
    },
    stop: () => undefined,
  }
  return { player, played }
}

describe.skipIf(!reachable)('QA · TTS 真实服务集成（B1–B7）', () => {
  // ── B1 ───────────────────────────────────────────────────────────────
  it('B1a JSON 传输返回真实 mp3 字节（>1000，与 curl 实测同量级）', async () => {
    const client = new TtsHttpClient({ baseUrl: BASE })
    const res = await client.synthesize(buildSynthesisParams('ねこ'), 1)
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.clip.byteLength).toBeGreaterThan(1000)
      expect(res.clip.mime).toBe('audio/mpeg')
      expect(res.clip.voice).toBe(TTS_DEFAULT_VOICE)
      // curl 实测 mp3 ≈ 8784 字节 → 允许 2 倍宽带（同量级即可）
      expect(res.clip.byteLength).toBeGreaterThan(4000)
      expect(res.clip.byteLength).toBeLessThan(20000)
      console.log(`[QA-B1a] JSON mp3 bytes = ${res.clip.byteLength}`)
    }
  })

  it('B1b 裸流传输（GET /v1/tts/speech）返回真实字节并读到 X-Tts-Voice', async () => {
    const client = new TtsHttpClient({ baseUrl: BASE, transport: 'stream' })
    const res = await client.synthesize(buildSynthesisParams('ねこ'), 1)
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.clip.byteLength).toBeGreaterThan(1000)
      expect(res.clip.mime).toBe('audio/mpeg')
      expect(res.clip.voice).toBe(TTS_DEFAULT_VOICE)
      console.log(
        `[QA-B1b] stream mp3 bytes = ${res.clip.byteLength}, voice = ${res.clip.voice}, cached = ${String(res.clip.cached)}`,
      )
    }
  })

  // ── B2 ───────────────────────────────────────────────────────────────
  it('B2a 同一文本第二次请求走客户端缓存（零网络）', async () => {
    const { fetchImpl, calls } = counting(nativeFetch as FetchLike)
    const client = new TtsHttpClient({ baseUrl: BASE, fetch: fetchImpl })
    const first = await client.synthesize(buildSynthesisParams('いぬ'), 1)
    const second = await client.synthesize(buildSynthesisParams('いぬ'), 1)
    expect(first.ok && second.ok).toBe(true)
    expect(calls).toHaveLength(1)
  })

  it('B2b 全新客户端命中服务端缓存（X-TTS-Cache: hit）', async () => {
    // 先用 A 客户端确保服务端已缓存该文本
    const warmer = new TtsHttpClient({ baseUrl: BASE })
    await warmer.synthesize(buildSynthesisParams('とり'), 1)
    // 再用全新客户端（本地缓存为空）请求同一文本 → 命中服务端缓存
    const fresh = new TtsHttpClient({ baseUrl: BASE })
    const res = await fresh.synthesize(buildSynthesisParams('とり'), 1)
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.clip.cached).toBe(true)
      console.log(`[QA-B2b] server cached flag = ${String(res.clip.cached)}`)
    }
  })

  // ── B3 ───────────────────────────────────────────────────────────────
  it('B3 rate 1.0 → 0.5 确实重新请求且字节数变化（cacheKey 含 rate 生效）', async () => {
    const { fetchImpl, calls } = counting(nativeFetch as FetchLike)
    const client = new TtsHttpClient({ baseUrl: BASE, fetch: fetchImpl })
    const normal = await client.synthesize(buildSynthesisParams('うま'), 1)
    const slow = await client.synthesize(
      buildSynthesisParams('うま', { rate: 0.5 }),
      1,
    )
    expect(normal.ok && slow.ok).toBe(true)
    expect(calls).toHaveLength(2)
    if (normal.ok && slow.ok) {
      expect(slow.clip.byteLength).not.toBe(normal.clip.byteLength)
      // 语速变慢 → 音频变长（curl: 8784 → 17136）
      expect(slow.clip.byteLength).toBeGreaterThan(normal.clip.byteLength)
      console.log(
        `[QA-B3] rate=1.0 → ${normal.clip.byteLength}B, rate=0.5 → ${slow.clip.byteLength}B`,
      )
    }
  })

  // ── B4 ───────────────────────────────────────────────────────────────
  it('B4 迟到响应（gen 失配）不出声：A 被 cancel 后到达不播放', async () => {
    const { player, played } = recordingPlayer()
    const source = new TtsHttpClient({ baseUrl: BASE })
    const port = new ResolvingTtsPort(source, player, unsupportedRealtime)

    const first = port.speak('あいうえお')
    // M3：cancel 在途（source.cancel → gen++），A 的响应将过期
    port.stop()
    const second = port.speak('かきくけこ')

    const [firstResult, secondResult] = await Promise.all([first, second])
    expect(secondResult).toEqual({ ok: true, engine: 'http' })
    // A 的结果必须被丢弃：只播放 1 次，且播放的是 B
    expect(played).toHaveLength(1)
    expect(played[0].key).toBe(cacheKey(buildSynthesisParams('かきくけこ')))
    console.log(
      `[QA-B4] played=${played.length}, firstResult=${JSON.stringify(firstResult)}`,
    )
  })

  // ── B5 ───────────────────────────────────────────────────────────────
  it('B5 超时：可控慢响应下返回 timeout，且总请求数 = 2（重试 1 次）', async () => {
    const attempts: Array<{ url: string; init?: RequestInitLike }> = []
    // 包装真实 fetch：延迟 1500ms（> timeoutMs 300ms），并在 abort 时 reject
    const slowFetch: FetchLike = (url, init) =>
      new Promise<ResponseLike>((resolve, reject) => {
        attempts.push({ url, init })
        const signal = init?.signal as AbortSignal | undefined
        const timer = setTimeout(() => {
          ;(nativeFetch as FetchLike)(url, init).then(resolve, reject)
        }, 1500)
        signal?.addEventListener('abort', () => {
          clearTimeout(timer)
          reject(new Error('aborted'))
        })
      })
    const client = new TtsHttpClient({
      baseUrl: BASE,
      fetch: slowFetch,
      timeoutMs: 300,
      maxRetries: 1,
      delay: noDelay,
    })
    const start = Date.now()
    const res = await client.synthesize(buildSynthesisParams('さる'), 1)
    const elapsed = Date.now() - start
    expect(res).toEqual({ ok: false, reason: 'timeout' })
    expect(attempts).toHaveLength(2) // 恰好 1 次重试，不是无穷
    expect(elapsed).toBeLessThan(5000)
    console.log(
      `[QA-B5] timeout ok, attempts=${attempts.length}, elapsed=${elapsed}ms`,
    )
  })

  // ── B6 ───────────────────────────────────────────────────────────────
  it('B6 坏 voice（真实 503）→ 去 voice 重试 → 成功并回落到日语默认音色', async () => {
    const { fetchImpl, calls } = counting(nativeFetch as FetchLike)
    const client = new TtsHttpClient({
      baseUrl: BASE,
      fetch: fetchImpl,
      delay: noDelay,
    })
    const bogus: TtsSynthesisParams = {
      ...buildSynthesisParams('きりん'),
      voice: 'ja-JP-DoesNotExistNeural',
    }
    const res = await client.synthesize(bogus, 1)
    expect(calls).toHaveLength(2) // 带 voice 失败 → 去 voice 重试
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.clip.voice).toBe(TTS_DEFAULT_VOICE)
      console.log(
        `[QA-B6] attempts=${calls.length}, final voice = ${String(res.clip.voice)}`,
      )
    }
    // 第二次请求确实去掉了 voice（JSON body 不含 voice 字段）
    const secondBody = JSON.parse(calls[1].init?.body ?? '{}') as Record<
      string,
      unknown
    >
    expect('voice' in secondBody).toBe(false)
  })

  // ── B7 ───────────────────────────────────────────────────────────────
  it('B7 坏 lang（真实 400）→ 不重试，只发一次请求', async () => {
    const { fetchImpl, calls } = counting(nativeFetch as FetchLike)
    const client = new TtsHttpClient({
      baseUrl: BASE,
      fetch: fetchImpl,
      delay: noDelay,
    })
    // 必须**不带 voice**（显式 voice 会让服务端跳过 lang 校验 → 200）；
    // 与主理人 curl 实测一致：lang=xx-YY 且无 voice → 400。
    const badLang: TtsSynthesisParams = {
      ...buildSynthesisParams('ねこ'),
      lang: 'xx-YY',
      voice: undefined,
    }
    const res = await client.synthesize(badLang, 1)
    expect(res).toMatchObject({ ok: false, reason: 'bad-request', status: 400 })
    expect(calls).toHaveLength(1)
    console.log(`[QA-B7] attempts=${calls.length}, reason=bad-request`)
  })

  it('B7b 空文本不发请求（empty-text，零网络）', async () => {
    const { fetchImpl, calls } = counting(nativeFetch as FetchLike)
    const client = new TtsHttpClient({ baseUrl: BASE, fetch: fetchImpl })
    const res = await client.synthesize(buildSynthesisParams('   '), 1)
    expect(res).toEqual({ ok: false, reason: 'empty-text' })
    expect(calls).toHaveLength(0)
  })
})
