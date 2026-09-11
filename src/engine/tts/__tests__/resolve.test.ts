import { describe, expect, it } from 'vitest'

import type { TtsCapability, TtsPort, TtsResult } from '../../../types/ports.js'
import type {
  AudioPlaybackCapability,
  AudioPlayerPort,
  AudioPlayResult,
  TtsAudioClip,
  TtsSourcePort,
  TtsSourceResult,
} from '../../../types/tts.js'
import { ResolvingTtsPort } from '../index.js'

const CLIP: TtsAudioClip = {
  key: 'k',
  mime: 'audio/mpeg',
  byteLength: 3,
  lastUsedAt: 0,
}

function makeSource(
  result: TtsSourceResult = { ok: true, clip: CLIP },
  log?: string[],
): TtsSourcePort {
  return {
    synthesize: async () => {
      log?.push('source.synthesize')
      return result
    },
    prefetch: () => {
      log?.push('source.prefetch')
    },
    cancel: () => {
      log?.push('source.cancel')
    },
  }
}

function makePlayer(
  playResult: AudioPlayResult = { ok: true, channel: 'web' },
  capability: AudioPlaybackCapability = 'supported',
  log?: string[],
): AudioPlayerPort {
  return {
    getCapability: () => capability,
    prime: () => {
      log?.push('player.prime')
    },
    play: async () => {
      log?.push('player.play')
      return playResult
    },
    stop: () => {
      log?.push('player.stop')
    },
  }
}

function makeRealtime(
  result: TtsResult = { ok: true, engine: 'native' },
  capability: TtsCapability = 'supported',
  log?: string[],
): TtsPort {
  return {
    getCapability: () => capability,
    speak: async () => {
      log?.push('realtime.speak')
      return result
    },
    stop: () => {
      log?.push('realtime.stop')
    },
    getVoices: async () => [],
  }
}

describe('resolve · 降级链', () => {
  it('链路 A：HTTP 合成 + 播放成功 → engine http', async () => {
    const port = new ResolvingTtsPort(
      makeSource({ ok: true, clip: CLIP }),
      makePlayer({ ok: true, channel: 'web' }),
      makeRealtime({ ok: true, engine: 'native' }),
    )
    expect(await port.speak('ねこ')).toEqual({ ok: true, engine: 'http' })
  })

  it('HTTP 失败 → 原生 TTS（engine native）', async () => {
    const port = new ResolvingTtsPort(
      makeSource({ ok: false, reason: 'unavailable' }),
      makePlayer({ ok: true, channel: 'web' }),
      makeRealtime({ ok: true, engine: 'native' }),
    )
    expect(await port.speak('ねこ')).toEqual({ ok: true, engine: 'native' })
  })

  it('HTTP 失败 → Web speechSynthesis（engine web）', async () => {
    const port = new ResolvingTtsPort(
      makeSource({ ok: false, reason: 'timeout' }),
      makePlayer({ ok: true, channel: 'web' }),
      makeRealtime({ ok: true, engine: 'web' }),
    )
    expect(await port.speak('ねこ')).toEqual({ ok: true, engine: 'web' })
  })

  it('链路 C：无播放器且实时合成不可用 → no-player，且不发 HTTP 请求', async () => {
    const log: string[] = []
    const port = new ResolvingTtsPort(
      makeSource({ ok: true, clip: CLIP }, log),
      null,
      makeRealtime({ ok: false, reason: 'no-tts' }, 'unsupported', log),
    )
    expect(await port.speak('ねこ')).toEqual({ ok: false, reason: 'no-player' })
    expect(log).not.toContain('source.synthesize')
  })

  it('播放器能力 unsupported 时跳过 HTTP 路径', async () => {
    const log: string[] = []
    const port = new ResolvingTtsPort(
      makeSource({ ok: true, clip: CLIP }, log),
      makePlayer({ ok: true, channel: 'web' }, 'unsupported', log),
      makeRealtime({ ok: true, engine: 'native' }, 'supported', log),
    )
    expect(await port.speak('ねこ')).toEqual({ ok: true, engine: 'native' })
    expect(log).not.toContain('source.synthesize')
  })
})

describe('resolve · 失败原因映射', () => {
  it('400 → service-rejected', async () => {
    const port = new ResolvingTtsPort(
      makeSource({ ok: false, reason: 'bad-request' }),
      makePlayer(),
      makeRealtime({ ok: false, reason: 'error' }, 'supported'),
    )
    expect(await port.speak('ねこ')).toEqual({
      ok: false,
      reason: 'service-rejected',
    })
  })

  it('network / timeout → service-unavailable', async () => {
    for (const reason of ['network', 'timeout'] as const) {
      const port = new ResolvingTtsPort(
        makeSource({ ok: false, reason }),
        makePlayer(),
        makeRealtime({ ok: false, reason: 'error' }, 'supported'),
      )
      expect(await port.speak('ねこ')).toEqual({
        ok: false,
        reason: 'service-unavailable',
      })
    }
  })

  it('播放被拦截 → blocked；播放失败 → no-player', async () => {
    const blocked = new ResolvingTtsPort(
      makeSource(),
      makePlayer({ ok: false, reason: 'blocked' }),
      makeRealtime({ ok: false, reason: 'error' }, 'supported'),
    )
    expect(await blocked.speak('ねこ')).toEqual({
      ok: false,
      reason: 'blocked',
    })

    const failed = new ResolvingTtsPort(
      makeSource(),
      makePlayer({ ok: false, reason: 'play-error' }),
      makeRealtime({ ok: false, reason: 'error' }, 'supported'),
    )
    expect(await failed.speak('ねこ')).toEqual({
      ok: false,
      reason: 'no-player',
    })
  })

  it('实时合成无日语语音 → no-ja-voice', async () => {
    const port = new ResolvingTtsPort(
      makeSource({ ok: false, reason: 'unavailable' }),
      makePlayer(),
      makeRealtime({ ok: false, reason: 'no-ja-voice' }, 'supported'),
    )
    expect(await port.speak('ねこ')).toEqual({
      ok: false,
      reason: 'no-ja-voice',
    })
  })
})

describe('resolve · ★ M1–M3 互斥编排（调用顺序）', () => {
  it('M1：HTTP 播放前先 realtime.stop()', async () => {
    const log: string[] = []
    const port = new ResolvingTtsPort(
      makeSource({ ok: true, clip: CLIP }, log),
      makePlayer({ ok: true, channel: 'web' }, 'supported', log),
      makeRealtime({ ok: true, engine: 'native' }, 'supported', log),
    )
    await port.speak('ねこ')
    expect(log).toEqual(['realtime.stop', 'source.synthesize', 'player.play'])
  })

  it('M2：实时合成前先 player.stop()', async () => {
    const log: string[] = []
    const port = new ResolvingTtsPort(
      makeSource({ ok: false, reason: 'unavailable' }, log),
      makePlayer({ ok: true, channel: 'web' }, 'supported', log),
      makeRealtime({ ok: true, engine: 'native' }, 'supported', log),
    )
    await port.speak('ねこ')
    expect(log).toEqual([
      'realtime.stop',
      'source.synthesize',
      'player.stop',
      'realtime.speak',
    ])
  })

  it('M3：stop() 三通道全停', () => {
    const log: string[] = []
    const port = new ResolvingTtsPort(
      makeSource({ ok: true, clip: CLIP }, log),
      makePlayer({ ok: true, channel: 'web' }, 'supported', log),
      makeRealtime({ ok: true, engine: 'native' }, 'supported', log),
    )
    port.stop()
    expect(log).toEqual(['source.cancel', 'player.stop', 'realtime.stop'])
  })
})

describe('resolve · 能力 / 预取 / 解锁', () => {
  it('getCapability：播放器可用即 supported，否则回落实时合成', () => {
    const withPlayer = new ResolvingTtsPort(
      makeSource(),
      makePlayer(),
      makeRealtime({ ok: true, engine: 'native' }, 'unsupported'),
    )
    expect(withPlayer.getCapability()).toBe('supported')

    const noPlayerRealtimeOk = new ResolvingTtsPort(
      makeSource(),
      null,
      makeRealtime({ ok: true, engine: 'native' }, 'supported'),
    )
    expect(noPlayerRealtimeOk.getCapability()).toBe('supported')

    const nothing = new ResolvingTtsPort(
      makeSource(),
      null,
      makeRealtime({ ok: false, reason: 'no-tts' }, 'unsupported'),
    )
    expect(nothing.getCapability()).toBe('unsupported')
  })

  it('prefetch：仅当播放器可用时预取', () => {
    const log: string[] = []
    const available = new ResolvingTtsPort(
      makeSource({ ok: true, clip: CLIP }, log),
      makePlayer({ ok: true, channel: 'web' }, 'supported', log),
      makeRealtime(),
    )
    available.prefetch('ねこ')
    expect(log).toContain('source.prefetch')

    const log2: string[] = []
    const noPlayer = new ResolvingTtsPort(
      makeSource({ ok: true, clip: CLIP }, log2),
      null,
      makeRealtime({ ok: true, engine: 'native' }, 'supported', log2),
    )
    noPlayer.prefetch('ねこ')
    expect(log2).not.toContain('source.prefetch')
  })

  it('prime：委托给播放通道（无播放器时不 throw）', () => {
    const log: string[] = []
    const port = new ResolvingTtsPort(
      makeSource({ ok: true, clip: CLIP }, log),
      makePlayer({ ok: true, channel: 'web' }, 'supported', log),
      makeRealtime(),
    )
    port.prime()
    expect(log).toContain('player.prime')

    const noPlayer = new ResolvingTtsPort(makeSource(), null, makeRealtime())
    expect(() => noPlayer.prime()).not.toThrow()
  })
})

describe('resolve · 迟到响应丢弃', () => {
  it('被更新的调用取代后，迟到结果不出声（engine http 良性）', async () => {
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const log: string[] = []
    const source: TtsSourcePort = {
      synthesize: async (_params, gen) => {
        log.push('source.synthesize')
        if (gen === 1) {
          await gate
        }
        return { ok: true, clip: CLIP }
      },
      prefetch: () => undefined,
      cancel: () => {
        log.push('source.cancel')
      },
    }
    const port = new ResolvingTtsPort(
      source,
      makePlayer({ ok: true, channel: 'web' }, 'supported', log),
      makeRealtime({ ok: true, engine: 'native' }, 'supported', log),
    )
    const first = port.speak('あ')
    const second = port.speak('い')
    const secondResult = await second
    release()
    const firstResult = await first
    expect(secondResult).toEqual({ ok: true, engine: 'http' })
    expect(firstResult).toEqual({ ok: true, engine: 'http' })
    expect(log.filter((entry) => entry === 'player.play')).toHaveLength(1)
  })
})
