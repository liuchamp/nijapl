import type { TtsAudioFormat, TtsTransport } from '../types/tts.js'

/**
 * TTS 常量集中（设计 §6 / §7.1）。
 *
 * 唯一真相：业务代码（页面 / 服务 / 引擎逻辑）**禁止出现 IP 或域名字面量**，
 * 一律 `import { TTS_BASE_URL } from '../constants/tts.js'`。本文件的调试默认值
 * 与 `.env.example` 是唯一例外。
 */

/**
 * TTS 服务 base URL。
 *
 * **迁移说明**：原实现由构建期 `__TTS_BASE_URL__`（Lynx `source.define`）注入；
 * Wails 宿主内合成走 Go 绑定，地址由 Go 侧持有（环境变量 `NIJAPL_TTS_BASE_URL`，
 * 默认 `http://127.0.0.1:8000`），前端**不再需要感知域名**。
 *
 * 本常量仅服务于「浏览器直接打开」的前端 fetch 回退路径，可用
 * `VITE_TTS_BASE_URL` 在构建期覆盖。
 */
const injectedBaseUrl: unknown = import.meta.env?.VITE_TTS_BASE_URL

export const TTS_BASE_URL: string =
  typeof injectedBaseUrl === 'string' && injectedBaseUrl !== ''
    ? injectedBaseUrl
    : 'http://127.0.0.1:8000'

/** 语种：**恒 `'ja-JP'`**，禁止省略（H4：省略会落到服务端中文兜底音色）。 */
export const TTS_LANG = 'ja-JP'

/** 默认音色：日语女声，可配置（服务端不校验音色）。 */
export const TTS_DEFAULT_VOICE = 'ja-JP-NanamiNeural'

/**
 * 实际使用的音色。
 *
 * 置空串 `''` → 只传 `lang`（服务端按 `lang` 映射默认音色），供特殊场景切换。
 */
export const TTS_VOICE: string = TTS_DEFAULT_VOICE

/** 音调单位：`'Hz'`（默认）| `'%'`（备选，T05 主观听感确认，见 V-13）。 */
export const TTS_PITCH_UNIT: 'Hz' | '%' = 'Hz'

/**
 * 音量：本期不暴露设置，**恒 `'+0%'`**。
 *
 * **显式发送**（不再省略）：服务端 `convertSpeech` 对缺失字段原样透传，其缓存 key 第 4 段
 * （`volume`）因此为 `''`；客户端显式传 `'+0%'` 后，两端 key 的 volume 段**真正一致**
 * （设计 §3.7 / §5.2「客户端 key 与服务端 key 语义对齐」）。
 */
export const TTS_VOLUME = '+0%'

/** 音频格式：全平台统一 `'mp3'`（§3.6，iOS WebM/Opus 兼容性硬阻塞）。 */
export const TTS_FORMAT: TtsAudioFormat = 'mp3'

/** 传输方式：默认 `'json'`（`POST /v1/tts/synthesize`）；`'stream'` 为备选。 */
export const TTS_TRANSPORT: TtsTransport = 'json'

/** 裸流端点（`transport='stream'`）。 */
export const TTS_PATH_SPEECH = '/v1/tts/speech'
/** JSON 端点（`transport='json'`，默认）。 */
export const TTS_PATH_SYNTHESIZE = '/v1/tts/synthesize'

/** 用户触发请求超时（毫秒）：必须**早于**服务端 deadline（20s）掐断。 */
export const TTS_TIMEOUT_MS = 8000
/** 预取请求超时（毫秒）：不阻塞 UI，可更宽松。 */
export const TTS_PREFETCH_TIMEOUT_MS = 15000

/** 重试退避（毫秒）。 */
export const TTS_RETRY_BACKOFF_MS = 300
/** 最多重试次数（共 `TTS_MAX_RETRIES + 1` 次尝试）。 */
export const TTS_MAX_RETRIES = 1

/** 内存缓存条目上限。 */
export const TTS_CACHE_MAX_ENTRIES = 64
/** 内存缓存字节上限（4 MiB）。 */
export const TTS_CACHE_MAX_BYTES = 4 * 1024 * 1024

/** 预取并发上限（避免抢占用户点击的请求）。 */
export const TTS_PREFETCH_MAX_CONCURRENCY = 2

/**
 * 静音 WAV（8-bit PCM，80 字节静音电平）data URI，用于 Web 端手势内解锁自动播放。
 *
 * 由设计 §4.4 的 Node 片段生成（**勿手写 base64**）：
 * `RIFF` 头 44 字节 + 80 字节 `0x80`（8bit 无符号静音电平），8kHz 单声道。
 */
export const SILENT_AUDIO_DATA_URI =
  'data:audio/wav;base64,UklGRnQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YVAAAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgA=='
