/**
 * HTTP TTS 契约（设计 §4.2，取代 v1.1 的 `src/types/audio.ts`）。
 *
 * 本文件仅描述**合成源（HTTP）与播放**两层的类型，属于引擎层内部契约：
 * - 页面 / store / service **不得**直接 import 本文件，只经 `src/engine/tts/index.js`；
 * - 所有端口结果均为**判别联合**且**永不 throw**（红线 §12.5）。
 */

/** 服务侧音频格式（三档，见设计 H3）。 */
export type TtsAudioFormat = 'mp3' | 'webm' | 'mp3-hq'

/**
 * 传输方式：
 * - `'json'`：`POST /v1/tts/synthesize`（默认，参数在 body）；
 * - `'stream'`：`GET /v1/tts/speech`（备选，参数在 query）。
 */
export type TtsTransport = 'json' | 'stream'

/** 合成请求参数（**已格式化**为服务侧字符串）。 */
export interface TtsSynthesisParams {
  /** 朗读文本（已 trim；空文本不发起请求）。 */
  text: string
  /** 语种，本项目**恒为 `'ja-JP'`**，任何分支都不得省略（H4）。 */
  lang: string
  /** 音色；可省略，省略时服务端按 `lang` 取默认音色。 */
  voice?: string
  /** 语速，形如 `'+0%'` / `'-50%'`。 */
  rate: string
  /** 音量，形如 `'+0%'`（本期恒 `'+0%'`，**显式发送**以对齐服务端缓存 key，§5.2）。 */
  volume: string
  /** 音调，形如 `'+0Hz'` / `'-50Hz'`。 */
  pitch: string
  /** 音频格式，默认 `'mp3'`。 */
  format: TtsAudioFormat
}

/**
 * 音频片段（**缓存条目**）。
 *
 * Web 端持 `bytes` + `objectUrl`（Blob 播放）；原生端持 `base64`（`playBytes`）。
 * 两个字段都可选，由各自播放通道按需填充。
 */
export interface TtsAudioClip {
  /** 缓存键（与 `cacheKey()` 对齐）。 */
  key: string
  /** MIME：`'audio/mpeg'`（mp3 / mp3-hq）或 `'audio/webm'`。 */
  mime: string
  /** Web：Blob 播放用的原始字节。 */
  bytes?: Uint8Array
  /** 原生：`playBytes` 用的标准 base64（不含 `data:` 前缀）。 */
  base64?: string
  /** Web：`URL.createObjectURL` 结果（淘汰时 revoke）。 */
  objectUrl?: string
  /** 可选元数据：服务端实际使用的音色（JSON 接口可靠）。 */
  voice?: string
  /** 可选元数据：服务端是否命中缓存；读不到为 `undefined`。 */
  cached?: boolean
  /** 字节长度（用于 LRU 双限统计）。 */
  byteLength: number
  /** LRU 时间戳（毫秒）。 */
  lastUsedAt: number
}

/** 合成源失败原因（内部判别）。 */
export type TtsSourceFailure =
  /** 空文本，未发起请求。 */
  | 'empty-text'
  /** 400：参数 / 语种非法（程序 bug，不重试）。 */
  | 'bad-request'
  /** 503：上游不可用（可重试）。 */
  | 'unavailable'
  /** 504 或客户端超时（可重试）。 */
  | 'timeout'
  /** `fetch` reject / DNS / 断网（可重试）。 */
  | 'network'
  /** 其他（解析失败、未知状态码）。 */
  | 'error'

/** 合成源结果（判别联合；**永不 throw**）。 */
export type TtsSourceResult =
  | { ok: true; clip: TtsAudioClip }
  | {
      ok: false
      reason: TtsSourceFailure
      /** HTTP 状态码（若已拿到响应）。 */
      status?: number
      /** 服务端 `reason` 字段（如 `TTS_INVALID_ARGUMENT`）。 */
      serviceReason?: string
    }

/** 合成源端口（纯逻辑 + 平台 `fetch`；**不触碰原生模块 / DOM**）。 */
export interface TtsSourcePort {
  /**
   * 合成（带缓存 + 并发去重 + 重试）。
   *
   * @param params 已格式化的请求参数。
   * @param gen 调用序号；响应返回时若已过期则丢弃（防串音，§6.5）。
   */
  synthesize(params: TtsSynthesisParams, gen: number): Promise<TtsSourceResult>
  /** 预取（fire-and-forget；**不 throw、不返回**）。 */
  prefetch(params: TtsSynthesisParams): void
  /** 取消在途请求（用户连点 / 切卡）。 */
  cancel(): void
}

/** 播放能力。 */
export type AudioPlaybackCapability = 'supported' | 'unsupported'

/** 播放失败原因。 */
export type AudioPlayFailure =
  /** 无可用播放器。 */
  | 'no-player'
  /** 播放器报错（解码 / 加载失败等）。 */
  | 'play-error'
  /** 自动播放被浏览器拦截。 */
  | 'blocked'

/** 播放结果（判别联合；**永不 throw**）。 */
export type AudioPlayResult =
  | { ok: true; channel: 'native' | 'web' }
  | { ok: false; reason: AudioPlayFailure }

/** 播放器端口（**只播放，不合成**；永不 throw）。 */
export interface AudioPlayerPort {
  /** 当前播放能力。 */
  getCapability(): AudioPlaybackCapability
  /** 在用户手势调用栈内**同步**解锁自动播放（Web 必需；原生为空操作）。 */
  prime(): void
  /** 播放片段。 */
  play(clip: TtsAudioClip): Promise<AudioPlayResult>
  /** 停止播放（**幂等**）。 */
  stop(): void
}

/**
 * `fetch` 初始化参数的最小结构（Lynx `fetch` 能力子集未知，见 V-3）。
 *
 * 仅描述本项目实际使用的字段（`method` / `headers` / `body` / `signal`），
 * 避免直接依赖 DOM 的 `RequestInit` 全局类型（原生端无 DOM）。
 */
export interface RequestInitLike {
  method: string
  headers: Record<string, string>
  body?: string
  signal?: unknown
}

/**
 * `fetch` 响应体的最小结构（能力探测用，§3.7 / V-1）。
 *
 * `json()` 为 JSON 传输路径所需；`arrayBuffer()` / `blob()` / `headers` 为
 * 裸流路径与元数据读取所需，均**可选**（缺失即降级，不崩）。
 */
export interface ResponseLike {
  ok: boolean
  status: number
  headers?: {
    get(name: string): string | null
  }
  json?(): Promise<unknown>
  arrayBuffer?(): Promise<ArrayBuffer>
  blob?(): Promise<unknown>
  text?(): Promise<string>
}

/** 可注入的 `fetch` 签名（vitest 用 fake 覆盖全部分支）。 */
export type FetchLike = (
  url: string,
  init?: RequestInitLike,
) => Promise<ResponseLike>
