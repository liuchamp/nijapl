/** TTS 能力检测结果。 */
export type TtsCapability = 'supported' | 'unsupported' | 'gesture-required'

/**
 * 出声来源（修订 R2：加宽，新增 `'http'`）。
 *
 * `'http'` 表示走自建 TTS 服务的 HTTP 合成 + 播放通道；`'native'` / `'web'`
 * 为既有实时合成实现。**不采用 `'remote'` 等其它命名**（设计 §1.5 附带口径）。
 */
export type TtsEngine = 'http' | 'native' | 'web'

/**
 * 失败原因（修订 R2：加宽）。
 *
 * 新增：`'service-unavailable'`（HTTP 网络 / 超时 / 5xx）、
 * `'service-rejected'`（HTTP 400）、`'no-player'`（合成成功但播放器不可用）。
 */
export type TtsFailureReason =
  | 'no-tts'
  | 'no-ja-voice'
  | 'blocked'
  | 'error'
  | 'service-unavailable'
  | 'service-rejected'
  | 'no-player'

/** TTS 调用结果（判别联合，端口永不 throw）。 */
export type TtsResult =
  | { ok: true; engine: TtsEngine }
  | { ok: false; reason: TtsFailureReason }

/** 可用语音。 */
export interface TtsVoice {
  id: string
  lang: string
  name: string
}

/** 朗读选项。 */
export interface TtsOptions {
  rate?: number
  pitch?: number
}

/** 语音端口契约。 */
export interface TtsPort {
  getCapability(): TtsCapability
  speak(text: string, opts?: TtsOptions): Promise<TtsResult>
  stop(): void
  getVoices(): Promise<TtsVoice[]>
  /**
   * 可选：手势内**同步**解锁自动播放（仅 facade 实现，向后兼容）。
   *
   * Web = 静音片段 `play()` 解锁；原生 = 空操作。既有实现无需提供。
   */
  prime?(): void
  /** 可选：预取（fire-and-forget；失败静默）。 */
  prefetch?(text: string, opts?: TtsOptions): void
}

/** 存储端口契约（异步；永不 throw）。 */
export interface StoragePort {
  get(key: string): Promise<string | null>
  set(key: string, value: string): Promise<void>
  remove(key: string): Promise<void>
}
