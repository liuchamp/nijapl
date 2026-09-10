/** TTS 能力检测结果。 */
export type TtsCapability = 'supported' | 'unsupported' | 'gesture-required'

/** TTS 调用结果（判别联合，端口永不 throw）。 */
export type TtsResult =
  | { ok: true; engine: 'native' | 'web' }
  | { ok: false; reason: 'no-tts' | 'no-ja-voice' | 'blocked' | 'error' }

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
}

/** 存储端口契约（异步；永不 throw）。 */
export interface StoragePort {
  get(key: string): Promise<string | null>
  set(key: string, value: string): Promise<void>
  remove(key: string): Promise<void>
}
