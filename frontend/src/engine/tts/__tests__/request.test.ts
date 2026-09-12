import { describe, expect, it } from 'vitest'

import {
  TTS_DEFAULT_VOICE,
  TTS_LANG,
  TTS_PATH_SPEECH,
  TTS_PATH_SYNTHESIZE,
} from '../../../constants/tts.js'
import {
  buildSpeechUrl,
  buildSynthesisParams,
  buildSynthesizeRequest,
  cacheKey,
  normalizeText,
  toPitchParam,
  toRateParam,
} from '../request.js'

const BASE = 'http://tts.test'

describe('request · rate 映射', () => {
  it('0.5/1.0/1.5 → -50%/+0%/+50%', () => {
    expect(toRateParam(0.5)).toBe('-50%')
    expect(toRateParam(1)).toBe('+0%')
    expect(toRateParam(1.5)).toBe('+50%')
  })

  it('中间值按四舍五入', () => {
    expect(toRateParam(0.8)).toBe('-20%')
    expect(toRateParam(1.2)).toBe('+20%')
  })

  it('越界 clamp 到 ±50%', () => {
    expect(toRateParam(0.2)).toBe('-50%')
    expect(toRateParam(3)).toBe('+50%')
  })

  it('undefined / NaN → +0%', () => {
    expect(toRateParam(undefined)).toBe('+0%')
    expect(toRateParam(Number.NaN)).toBe('+0%')
  })

  it('恒匹配服务端格式 ^[+-]\\d+%$', () => {
    for (const value of [
      0.2,
      0.5,
      0.8,
      1,
      1.2,
      1.5,
      3,
      undefined,
      Number.NaN,
    ]) {
      expect(toRateParam(value)).toMatch(/^[+-]\d+%$/)
    }
  })
})

describe('request · pitch 映射', () => {
  it('0.5/1.0/1.5 → -50Hz/+0Hz/+50Hz', () => {
    expect(toPitchParam(0.5)).toBe('-50Hz')
    expect(toPitchParam(1)).toBe('+0Hz')
    expect(toPitchParam(1.5)).toBe('+50Hz')
  })

  it('越界 clamp；undefined / NaN → +0Hz', () => {
    expect(toPitchParam(0)).toBe('-50Hz')
    expect(toPitchParam(5)).toBe('+50Hz')
    expect(toPitchParam(undefined)).toBe('+0Hz')
    expect(toPitchParam(Number.NaN)).toBe('+0Hz')
  })

  it('恒匹配服务端格式 ^[+-]\\d+(Hz|%)$', () => {
    for (const value of [0, 0.5, 1, 1.5, 5, undefined, Number.NaN]) {
      expect(toPitchParam(value)).toMatch(/^[+-]\d+(Hz|%)$/)
    }
  })
})

describe('request · 参数构造', () => {
  it('lang 在任何分支都恒为 ja-JP', () => {
    const cases = [
      buildSynthesisParams('ねこ'),
      buildSynthesisParams('ねこ', { rate: 0.5 }),
      buildSynthesisParams('ねこ', { rate: 1.5, pitch: 1.5 }),
      buildSynthesisParams('   '),
      buildSynthesisParams(''),
    ]
    for (const params of cases) {
      expect(params.lang).toBe(TTS_LANG)
      expect(params.lang).toBe('ja-JP')
    }
  })

  it('format 默认 mp3；voice 默认 Nanami', () => {
    const params = buildSynthesisParams('ねこ')
    expect(params.format).toBe('mp3')
    expect(params.voice).toBe(TTS_DEFAULT_VOICE)
  })

  it('文本 trim；空文本归一为空串（由调用方判定 empty-text）', () => {
    expect(normalizeText('  ねこ  ')).toBe('ねこ')
    expect(normalizeText('   ')).toBe('')
    expect(buildSynthesisParams('   ').text).toBe('')
    expect(buildSynthesisParams('').text).toBe('')
  })
})

describe('request · buildSpeechUrl', () => {
  it('rate 的前导 + 与 % 必须编码（%2B0%25），query 中不出现裸 +', () => {
    const params = buildSynthesisParams('ねこ')
    expect(params.rate).toBe('+0%')
    const url = buildSpeechUrl(BASE, params)
    expect(url).toContain(`${TTS_PATH_SPEECH}?`)
    expect(url).toContain('rate=%2B0%25')
    // 关键断言：不含裸 `+`（`+` 在 query 中被解码为空格 → 服务端 400）
    expect(url).not.toContain('+')
  })

  it('-50% 编码为 -50%25', () => {
    const url = buildSpeechUrl(
      BASE,
      buildSynthesisParams('ねこ', { rate: 0.5 }),
    )
    expect(url).toContain('rate=-50%25')
  })

  it('text/lang/voice/rate/volume/pitch/format 参数名逐字一致', () => {
    const params = buildSynthesisParams('ねこ', { rate: 1, pitch: 1 })
    const url = buildSpeechUrl(BASE, params)
    expect(url.startsWith(`${BASE}${TTS_PATH_SPEECH}?`)).toBe(true)
    for (const key of [
      'text=',
      'lang=',
      'voice=',
      'rate=',
      'volume=',
      'pitch=',
      'format=',
    ]) {
      expect(url).toContain(key)
    }
    expect(url).toContain('lang=ja-JP')
    expect(url).toContain('pitch=%2B0Hz')
    // volume 显式发送 '+0%' 且必须编码为 %2B0%25（P2-1：与服务端 cache key 对齐）
    expect(url).toContain('volume=%2B0%25')
    expect(url).toContain('format=mp3')
    expect(url).toContain('text=%E3%81%AD%E3%81%93')
  })

  it('voice 为空串时省略该参数', () => {
    const params = { ...buildSynthesisParams('ねこ'), voice: undefined }
    const url = buildSpeechUrl(BASE, params)
    expect(url).not.toContain('voice=')
  })
})

describe('request · buildSynthesizeRequest', () => {
  it('URL 指向 synthesize 端点，method=POST，Content-Type=application/json', () => {
    const { url, init } = buildSynthesizeRequest(
      buildSynthesisParams('ねこ'),
      BASE,
    )
    expect(url).toBe(`${BASE}${TTS_PATH_SYNTHESIZE}`)
    expect(init.method).toBe('POST')
    expect(init.headers['Content-Type']).toBe('application/json')
  })

  it('body 字段名逐字一致且 lang 恒 ja-JP', () => {
    const { init } = buildSynthesizeRequest(
      buildSynthesisParams('ねこ', { rate: 0.5, pitch: 1.5 }),
      BASE,
    )
    const body = JSON.parse(init.body ?? '{}') as Record<string, string>
    expect(body.text).toBe('ねこ')
    expect(body.lang).toBe('ja-JP')
    expect(body.voice).toBe(TTS_DEFAULT_VOICE)
    expect(body.rate).toBe('-50%')
    // volume 显式发送 '+0%'（P2-1：与服务端 cache key 第 4 段对齐）
    expect(body.volume).toBe('+0%')
    expect(body.pitch).toBe('+50Hz')
    expect(body.format).toBe('mp3')
  })

  it('voice 为空时 body 不含 voice 字段（JSON 路径无编码陷阱）', () => {
    const params = { ...buildSynthesisParams('ねこ'), voice: undefined }
    const { init } = buildSynthesizeRequest(params, BASE)
    const body = JSON.parse(init.body ?? '{}') as Record<string, string>
    expect('voice' in body).toBe(false)
    // JSON body 中 rate / volume 保持原始 '+0%'（不编码）
    expect(body.rate).toBe('+0%')
    expect(body.volume).toBe('+0%')
  })
})

describe('request · cacheKey', () => {
  it('字段顺序对齐服务端 format/voice/rate/volume/pitch/text', () => {
    const params = buildSynthesisParams('ねこ')
    expect(cacheKey(params)).toBe(
      ['mp3', TTS_DEFAULT_VOICE, '+0%', '+0%', '+0Hz', 'ねこ'].join('\u0000'),
    )
  })

  it('volume 段取自 p.volume（客户端 key 与服务端对齐，P2-1）', () => {
    const params = buildSynthesisParams('ねこ')
    expect(params.volume).toBe('+0%')
    expect(cacheKey(params).split('\u0000')[3]).toBe(params.volume)
    // volume 参与 key：改动即成不同键
    expect(cacheKey({ ...params, volume: '+10%' })).not.toBe(cacheKey(params))
  })

  it('rate / pitch 参与 key（改参数不复用）', () => {
    const a = cacheKey(buildSynthesisParams('ねこ', { rate: 0.5 }))
    const b = cacheKey(buildSynthesisParams('ねこ', { rate: 1.5 }))
    expect(a).not.toBe(b)
  })

  it('超长文本缩短为 len#head#tail', () => {
    const long = 'あ'.repeat(100)
    const key = cacheKey(buildSynthesisParams(long))
    const text = key.split('\u0000').at(-1) ?? ''
    expect(text.startsWith('100#')).toBe(true)
    expect(text).toContain('#')
    expect(text.length).toBeLessThan(100)
  })
})
