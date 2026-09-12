import {
  TTS_FORMAT,
  TTS_LANG,
  TTS_PATH_SPEECH,
  TTS_PATH_SYNTHESIZE,
  TTS_PITCH_UNIT,
  TTS_VOICE,
  TTS_VOLUME,
} from '../../constants/tts.js'
import type { RequestInitLike, TtsSynthesisParams } from '../../types/tts.js'

/**
 * 请求构造（**纯函数**，设计 §3.2–§3.8 / §5.2）。
 *
 * 红线（§8 平台文件职责边界）：本文件零框架、零原生、零 DOM，可被 vitest/node 直接 import。
 * 所有函数均为确定性纯函数，**永不 throw**（非法输入经 clamp / 兜底处理）。
 */

/** 区间收敛；`undefined` / `NaN` / 非有限值回落到 `fallback`（中性值）。 */
function clamp(
  value: number | undefined,
  min: number,
  max: number,
  fallback: number,
): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return fallback
  }
  return Math.min(Math.max(value, min), max)
}

/** 朗读文本归一：trim 后判空；**不做任何截断 / 替换**（§3.2）。 */
export function normalizeText(text: string): string {
  return text.trim()
}

/**
 * `StudySettings.rate`（0.5~1.5，1.0 为正常）→ 服务 `rate` 字符串。
 *
 * 例：0.5→`-50%`、1.0→`+0%`、1.5→`+50%`；越界 clamp；`undefined`/NaN→`+0%`。
 */
export function toRateParam(rate: number | undefined): string {
  const r = clamp(rate, 0.5, 1.5, 1)
  const pct = Math.round((r - 1) * 100)
  return `${pct >= 0 ? '+' : '-'}${Math.abs(pct)}%`
}

/**
 * `StudySettings.pitch`（0.5~1.5，1.0 为正常）→ 服务 `pitch` 字符串。
 *
 * 例（`Hz`）：0.5→`-50Hz`、1.0→`+0Hz`、1.5→`+50Hz`；越界 clamp；`undefined`/NaN→`+0Hz`。
 */
export function toPitchParam(pitch: number | undefined): string {
  const p = clamp(pitch, 0.5, 1.5, 1)
  const delta = Math.round((p - 1) * 100)
  return `${delta >= 0 ? '+' : '-'}${Math.abs(delta)}${TTS_PITCH_UNIT}`
}

/**
 * 构造已格式化的合成参数。
 *
 * **`lang` 恒为 `'ja-JP'`**（任何分支都不得省略，H4）—— 单测强制断言。
 *
 * @param text 朗读文本（`word.kana` / `sentence.ja`）。
 * @param opts 语速 / 音调（来自 `StudySettings`）。
 */
export function buildSynthesisParams(
  text: string,
  opts: { rate?: number; pitch?: number } = {},
): TtsSynthesisParams {
  const voice = TTS_VOICE === '' ? undefined : TTS_VOICE
  return {
    text: normalizeText(text),
    lang: TTS_LANG,
    voice,
    rate: toRateParam(opts.rate),
    volume: TTS_VOLUME,
    pitch: toPitchParam(opts.pitch),
    format: TTS_FORMAT,
  }
}

/**
 * 缓存键（与服务端语义对齐，§5.2）。
 *
 * 服务端 key = `sha256(format \0 voice \0 rate \0 volume \0 pitch \0 text)`；
 * 客户端**不做哈希**（语料短），拼接同序同字段。
 * `volume` **显式发送 `'+0%'`**（见 `buildSynthesisParams`），客户端 key 的 volume 段
 * 由 `p.volume` 取用 → 与服务端算出的第 4 段**真正一致**（不再用占位常量）。
 * 超长文本缩短（防御，避免键过长）。
 */
export function cacheKey(p: TtsSynthesisParams): string {
  const text =
    p.text.length > 64
      ? `${p.text.length}#${p.text.slice(0, 24)}#${p.text.slice(-24)}`
      : p.text
  return [p.format, p.voice ?? '', p.rate, p.volume, p.pitch, text].join(
    '\u0000',
  )
}

/** `URLSearchParams` 的最小结构。 */
interface SearchParamsLike {
  append(key: string, value: string): void
  toString(): string
}

/** `URLSearchParams` 构造器签名。 */
type SearchParamsCtor = new () => SearchParamsLike

/** 读取平台 `URLSearchParams`（Lynx 若无则返回 `undefined`）。 */
function readSearchParamsCtor(): SearchParamsCtor | undefined {
  const scope = globalThis as { URLSearchParams?: unknown }
  return typeof scope.URLSearchParams === 'function'
    ? (scope.URLSearchParams as SearchParamsCtor)
    : undefined
}

/**
 * 与 `URLSearchParams` **等价**的百分号编码（回退路径）。
 *
 * 保证 `'+'`→`'%2B'`、`'%'`→`'%25'`（`encodeURIComponent` 已天然满足），
 * 并额外编码 `!'()*`（与 `URLSearchParams` 行为对齐）。
 */
function encodeComponent(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`,
  )
}

/**
 * 构造 query 字符串。
 *
 * **严禁裸拼接值**：优先使用平台 `URLSearchParams`（保证 `'+'`→`'%2B'`、
 * `'%'`→`'%25'`）；不存在时回退到等价的自实现编码。
 */
function buildQuery(pairs: ReadonlyArray<readonly [string, string]>): string {
  const Ctor = readSearchParamsCtor()
  if (Ctor !== undefined) {
    const params = new Ctor()
    for (const [key, value] of pairs) {
      params.append(key, value)
    }
    return params.toString()
  }
  return pairs
    .map(([key, value]) => `${encodeComponent(key)}=${encodeComponent(value)}`)
    .join('&')
}

/**
 * 构造裸流 URL（`transport='stream'`，`GET /v1/tts/speech`）。
 *
 * `voice` 为空 / 省略时不带该参数。参数值经 URL 编码（**关键**：`rate` / `volume` 的
 * 前导 `+` 与 `%` 必须编码为 `%2B0%25`，否则服务端 400 —— 见设计 §3.8 与主理人实测）。
 */
export function buildSpeechUrl(base: string, p: TtsSynthesisParams): string {
  const pairs: Array<readonly [string, string]> = [['text', p.text]]
  pairs.push(['lang', p.lang])
  if (typeof p.voice === 'string' && p.voice !== '') {
    pairs.push(['voice', p.voice])
  }
  pairs.push(['rate', p.rate])
  pairs.push(['volume', p.volume])
  pairs.push(['pitch', p.pitch])
  pairs.push(['format', p.format])
  return `${base}${TTS_PATH_SPEECH}?${buildQuery(pairs)}`
}

/**
 * 构造 JSON 请求（`transport='json'`，默认路径）。
 *
 * body 字段名与服务文档**逐字一致**（`text` / `lang` / `voice` / `rate` / `volume` / `pitch` / `format`）。
 * 省略 `voice` 时不出现在 body 中。
 */
export function buildSynthesizeRequest(
  p: TtsSynthesisParams,
  base: string,
): { url: string; init: RequestInitLike } {
  const body: Record<string, string> = {
    text: p.text,
    lang: p.lang,
    rate: p.rate,
    volume: p.volume,
    pitch: p.pitch,
    format: p.format,
  }
  if (typeof p.voice === 'string' && p.voice !== '') {
    body.voice = p.voice
  }
  return {
    url: `${base}${TTS_PATH_SYNTHESIZE}`,
    init: {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  }
}
