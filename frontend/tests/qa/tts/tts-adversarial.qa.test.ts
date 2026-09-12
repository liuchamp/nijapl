/**
 * QA 独立验证 · TTS 对抗性检查（C1–C4、C8，离线 / fake）。
 *
 * 覆盖主理人指定的证伪点：
 *   C1 `lang` 恒传：参数构造 / 设置覆盖 / 预取 / 降级链任何分支都不得省略 `lang`；
 *   C2 端口永不 throw：`tts-client`（reject fetch / 非 JSON / 200 空体）、
 *      `player.web.ts`（无 DOM 探测）、facade 三端；
 *   C3 `cacheKey` 与服务端 `sha256(format\0voice\0rate\0volume\0pitch\0text)` 逐字段对齐；
 *   C4 M1–M3 互斥编排的**强断言**（精确序列 + 位置索引，非「被调用过」）；
 *   （C8「半注册 NativeModules 能力判定」为 Lynx 专有，随原生实现删除，见 docs/migration/PLAN.md。）
 *
 * 纪律：**不修改 `src/**`**；本文件为纯离线测试，不依赖真实服务。
 */

import { describe, expect, it } from 'vitest'

import {
  TTS_DEFAULT_VOICE,
  TTS_PATH_SPEECH,
  TTS_PATH_SYNTHESIZE,
} from '../../../src/constants/tts.js'
import {
  ResolvingTtsPort,
  UnsupportedTtsPort,
} from '../../../src/engine/tts/index.js'
import { createWebAudioPlayer } from '../../../src/engine/tts/player.web.js'
import {
  buildSpeechUrl,
  buildSynthesisParams,
  buildSynthesizeRequest,
  cacheKey,
} from '../../../src/engine/tts/request.js'
import { TtsHttpClient } from '../../../src/engine/tts/tts-client.js'
import type { TtsPort, TtsResult } from '../../../src/types/ports.js'
import type {
  AudioPlayerPort,
  AudioPlayResult,
  FetchLike,
  ResponseLike,
  TtsAudioClip,
  TtsSourcePort,
  TtsSourceResult,
  TtsSynthesisParams,
} from '../../../src/types/tts.js'

const BASE = 'http://tts.qa'
const CLIP: TtsAudioClip = {
  key: 'k',
  mime: 'audio/mpeg',
  byteLength: 3,
  lastUsedAt: 0,
}
const noDelay = (): Promise<void> => Promise.resolve()

/** 捕获参数 / 顺序的 fake 合成源。 */
function capturingSource(result: TtsSourceResult = { ok: true, clip: CLIP }): {
  source: TtsSourcePort
  params: TtsSynthesisParams[]
  log: string[]
} {
  const params: TtsSynthesisParams[] = []
  const log: string[] = []
  const source: TtsSourcePort = {
    synthesize: async (p) => {
      log.push('source.synthesize')
      params.push(p)
      return result
    },
    prefetch: (p) => {
      log.push('source.prefetch')
      params.push(p)
    },
    cancel: () => {
      log.push('source.cancel')
    },
  }
  return { source, params, log }
}

function makePlayer(
  result: AudioPlayResult = { ok: true, channel: 'web' },
  log: string[] = [],
): AudioPlayerPort {
  return {
    getCapability: () => 'supported',
    prime: () => log.push('player.prime'),
    play: async () => {
      log.push('player.play')
      return result
    },
    stop: () => log.push('player.stop'),
  }
}

function makeRealtime(
  result: TtsResult = { ok: true, engine: 'native' },
  log: string[] = [],
): TtsPort {
  return {
    getCapability: () => 'supported',
    speak: async () => {
      log.push('realtime.speak')
      return result
    },
    stop: () => log.push('realtime.stop'),
    getVoices: async () => [],
  }
}

// ── C1 `lang` 恒传 ───────────────────────────────────────────────────────

describe('QA · C1 lang 恒传（任何分支不得省略）', () => {
  it('request.ts：buildSynthesisParams / URL / JSON body 均含 lang=ja-JP', () => {
    const params = buildSynthesisParams('ねこ', { rate: 0.5, pitch: 1.5 })
    expect(params.lang).toBe('ja-JP')
    const speechUrl = buildSpeechUrl(BASE, params)
    expect(speechUrl.startsWith(`${BASE}${TTS_PATH_SPEECH}?`)).toBe(true)
    expect(speechUrl).toContain('lang=ja-JP')
    const { url, init } = buildSynthesizeRequest(params, BASE)
    expect(url).toBe(`${BASE}${TTS_PATH_SYNTHESIZE}`)
    const body = JSON.parse(init.body ?? '{}') as Record<string, unknown>
    expect(body.lang).toBe('ja-JP')
  })

  it('facade 设置覆盖矩阵：voice="" / voice 自定义 / format 覆盖 均保留 lang', async () => {
    const matrix: Array<Parameters<typeof ResolvingTtsPort>[3]> = [
      {},
      { voice: '' },
      { voice: 'ja-JP-CustomNeural' },
      { format: 'webm' },
      { voice: '', format: 'webm' },
    ]
    for (const settings of matrix) {
      const { source, params } = capturingSource()
      const port = new ResolvingTtsPort(
        source,
        makePlayer(),
        makeRealtime(),
        settings,
      )
      await port.speak('ねこ')
      expect(params).toHaveLength(1)
      expect(params[0].lang).toBe('ja-JP')
    }
  })

  it('prefetch 路径同样保留 lang', () => {
    const { source, params } = capturingSource()
    const port = new ResolvingTtsPort(source, makePlayer(), makeRealtime())
    port.prefetch('ねこ', { rate: 0.5 })
    expect(params).toHaveLength(1)
    expect(params[0].lang).toBe('ja-JP')
  })

  it('降级链（播放器不可用）不发 HTTP 请求 → 不存在省略 lang 的分支', async () => {
    const { source, params, log } = capturingSource()
    const port = new ResolvingTtsPort(source, null, makeRealtime())
    await port.speak('ねこ')
    expect(params).toHaveLength(0)
    expect(log).not.toContain('source.synthesize')
  })

  it('wire 级：真实 client 每个请求 body 均含 lang=ja-JP', async () => {
    const bodies: Record<string, unknown>[] = []
    const fetchImpl: FetchLike = async (_url, init) => {
      bodies.push(JSON.parse(init?.body ?? '{}') as Record<string, unknown>)
      return {
        ok: true,
        status: 200,
        headers: { get: () => 'audio/mpeg' },
        json: async () => ({ audio: 'AAAA', content_type: 'audio/mpeg' }),
      }
    }
    const client = new TtsHttpClient({ baseUrl: BASE, fetch: fetchImpl })
    await client.synthesize(buildSynthesisParams('あ'), 1)
    await client.synthesize(buildSynthesisParams('い', { rate: 0.5 }), 1)
    expect(bodies).toHaveLength(2)
    for (const body of bodies) {
      expect(body.lang).toBe('ja-JP')
    }
  })
})

// ── C2 端口永不 throw ────────────────────────────────────────────────────

describe('QA · C2 端口永不 throw（判别联合返回）', () => {
  const goodPlayer = makePlayer()

  it('tts-client：fetch reject → network，不抛', async () => {
    const rejectFetch: FetchLike = () => Promise.reject(new Error('boom'))
    const client = new TtsHttpClient({
      baseUrl: BASE,
      fetch: rejectFetch,
      maxRetries: 0,
      delay: noDelay,
    })
    await expect(
      client.synthesize(buildSynthesisParams('ねこ'), 1),
    ).resolves.toEqual({ ok: false, reason: 'network' })
  })

  it('tts-client：响应体非 JSON（json() reject）→ error，不抛', async () => {
    const badJson: ResponseLike = {
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: () => Promise.reject(new Error('not json')),
    }
    const client = new TtsHttpClient({
      baseUrl: BASE,
      fetch: () => Promise.resolve(badJson),
      delay: noDelay,
    })
    const res = await client.synthesize(buildSynthesisParams('ねこ'), 1)
    expect(res).toEqual({ ok: false, reason: 'error', status: 200 })
  })

  it('tts-client：200 空体（json() → {}）→ error，不抛', async () => {
    const empty: ResponseLike = {
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({}),
    }
    const client = new TtsHttpClient({
      baseUrl: BASE,
      fetch: () => Promise.resolve(empty),
      delay: noDelay,
    })
    const res = await client.synthesize(buildSynthesisParams('ねこ'), 1)
    expect(res).toEqual({ ok: false, reason: 'error', status: 200 })
  })

  it('player.web.ts：无 DOM 探测 → 返回 null，不抛', () => {
    expect(typeof createWebAudioPlayer()).toBe('object') // 若宿主有 Audio 则返回实现
    // 强制无 DOM：
    const scope = globalThis as { Audio?: unknown }
    const saved = scope.Audio
    delete scope.Audio
    try {
      expect(() => createWebAudioPlayer()).not.toThrow()
      expect(createWebAudioPlayer()).toBeNull()
    } finally {
      scope.Audio = saved
    }
  })

  it('facade：source 用 reject fetch 时 speak 返回判别联合，不抛', async () => {
    const rejectFetch: FetchLike = () => Promise.reject(new Error('boom'))
    const source = new TtsHttpClient({
      baseUrl: BASE,
      fetch: rejectFetch,
      maxRetries: 0,
      delay: noDelay,
    })
    const port = new ResolvingTtsPort(
      source,
      goodPlayer,
      new UnsupportedTtsPort(),
    )
    const res = await port.speak('ねこ')
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.reason).toBe('service-unavailable')
    }
  })
})

// ── C3 cacheKey 与服务端逐字段对齐 ───────────────────────────────────────

describe('QA · C3 cacheKey 字段与顺序对齐服务端', () => {
  it('逐字段对照：format \0 voice \0 rate \0 volume \0 pitch \0 text', () => {
    const params = buildSynthesisParams('ねこ', { rate: 1.5, pitch: 0.5 })
    const parts = cacheKey(params).split('\u0000')
    // 服务端：sha256(format, voice, rate, volume, pitch, text, "\x00")
    expect(parts).toEqual([
      'mp3', // format
      TTS_DEFAULT_VOICE, // voice
      '+50%', // rate
      '+0%', // volume（客户端占位）
      '-50Hz', // pitch
      'ねこ', // text
    ])
    expect(parts).toHaveLength(6)
  })

  it('客户端 key 未做哈希（原文拼接）→ 与服务端「同序同字段」语义一致', () => {
    const params = buildSynthesisParams('ねこ')
    expect(cacheKey(params)).toBe(
      ['mp3', TTS_DEFAULT_VOICE, '+0%', '+0%', '+0Hz', 'ねこ'].join('\u0000'),
    )
  })
})

// ── C4 M1–M3 强断言（精确序列 + 位置索引）─────────────────────────────────

describe('QA · C4 M1–M3 互斥编排（独立强断言）', () => {
  it('M1：realtime.stop() 严格发生在 source.synthesize 与 player.play 之前', async () => {
    const ordered: string[] = []
    const src: TtsSourcePort = {
      synthesize: async () => {
        ordered.push('source.synthesize')
        return { ok: true, clip: CLIP }
      },
      prefetch: () => undefined,
      cancel: () => ordered.push('source.cancel'),
    }
    const port = new ResolvingTtsPort(
      src,
      {
        getCapability: () => 'supported',
        prime: () => undefined,
        play: async () => {
          ordered.push('player.play')
          return { ok: true, channel: 'web' }
        },
        stop: () => ordered.push('player.stop'),
      },
      {
        getCapability: () => 'supported',
        speak: async () => {
          ordered.push('realtime.speak')
          return { ok: true, engine: 'native' }
        },
        stop: () => ordered.push('realtime.stop'),
        getVoices: async () => [],
      },
    )
    await port.speak('ねこ')
    // 精确序列（等长 → 杜绝「多调用了别的方法」蒙混）
    expect(ordered).toEqual([
      'realtime.stop',
      'source.synthesize',
      'player.play',
    ])
    // 位置索引（显式证明顺序，而非仅「被调用过」）
    expect(ordered.indexOf('realtime.stop')).toBeLessThan(
      ordered.indexOf('source.synthesize'),
    )
    expect(ordered.indexOf('realtime.stop')).toBeLessThan(
      ordered.indexOf('player.play'),
    )
    // 反向确认：成功链路中 player.stop / realtime.speak **不应**被调用
    expect(ordered).not.toContain('player.stop')
    expect(ordered).not.toContain('realtime.speak')
  })

  it('M2：player.stop() 严格发生在 realtime.speak() 之前', async () => {
    const ordered: string[] = []
    const port = new ResolvingTtsPort(
      {
        synthesize: async () => {
          ordered.push('source.synthesize')
          return { ok: false, reason: 'unavailable' }
        },
        prefetch: () => undefined,
        cancel: () => ordered.push('source.cancel'),
      },
      {
        getCapability: () => 'supported',
        prime: () => undefined,
        play: async () => ({ ok: true, channel: 'web' }),
        stop: () => ordered.push('player.stop'),
      },
      {
        getCapability: () => 'supported',
        speak: async () => {
          ordered.push('realtime.speak')
          return { ok: true, engine: 'native' }
        },
        stop: () => ordered.push('realtime.stop'),
        getVoices: async () => [],
      },
    )
    await port.speak('ねこ')
    expect(ordered).toEqual([
      'realtime.stop',
      'source.synthesize',
      'player.stop',
      'realtime.speak',
    ])
    expect(ordered.indexOf('player.stop')).toBeLessThan(
      ordered.indexOf('realtime.speak'),
    )
  })

  it('M3：stop() 三通道全停且缺一不可（精确 3 条）', () => {
    const ordered: string[] = []
    const port = new ResolvingTtsPort(
      {
        synthesize: async () => ({ ok: true, clip: CLIP }),
        prefetch: () => undefined,
        cancel: () => ordered.push('source.cancel'),
      },
      {
        getCapability: () => 'supported',
        prime: () => undefined,
        play: async () => ({ ok: true, channel: 'web' }),
        stop: () => ordered.push('player.stop'),
      },
      {
        getCapability: () => 'supported',
        speak: async () => ({ ok: true, engine: 'native' }),
        stop: () => ordered.push('realtime.stop'),
        getVoices: async () => [],
      },
    )
    port.stop()
    expect(ordered).toEqual(['source.cancel', 'player.stop', 'realtime.stop'])
    expect(new Set(ordered).size).toBe(3) // 三条通道各自被停
  })
})
