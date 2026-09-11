/**
 * 全局环境声明：Lynx 原生模块（Native Modules）与构建期注入常量。
 *
 * 原生模块仅在 Background Thread Scripting 中可用，通过全局 `NativeModules`
 * 同步调用（见架构 §1.0 F3）。本文件**不含 import/export**，作为全局脚本声明。
 *
 * 红线（架构 §1.5 / §8.5，修订 R1 后白名单 3 个）：
 * 只有 `src/engine/tts/tts.native.ts`、`src/engine/storage/storage.native.ts`、
 * `src/engine/tts/player.native.ts` 允许引用 `NativeModules`。本文件只做**声明**，
 * 不计入引用点。
 */

/** 原生 TTS 引擎（iOS AVSpeechSynthesizer / Android TextToSpeech）。 */
interface NativeTtsEngine {
  speak(text: string, rate: number, pitch: number): void
  stop(): void
  isSpeaking(): boolean
}

/**
 * 原生音频播放器（iOS AVAudioPlayer / Android MediaPlayer·ExoPlayer / Harmony AVPlayer）。
 *
 * 与 `NativeTtsEngine` **并列、互不隶属**（独立 `AudioPlayer` 模块，设计 §1.5）：
 * `player.native.ts` 只看本模块，`tts.native.ts` 只看 `TTSEngine`，能力检测粒度与
 * 真实能力一一对应。**跨模块互斥由 JS 侧 M1–M3 编排保证**（§4.5.2 / §12.7）。
 */
interface NativeAudioPlayer {
  /** 播放音频字节（标准 base64，不含 `data:` 前缀）；内部先停后播（M4）。 */
  playBytes(base64: string, mime: string): void
  /** 播放远端音频（备用：原生侧自行下载 / 边下边播）。 */
  playUrl(url: string): void
  /** 停止当前播放（**幂等**）。 */
  stopPlayback(): void
  /** 是否正在播放。 */
  isPlaying(): boolean
}

/** 原生键值存储（NSUserDefaults / SharedPreferences）。 */
interface NativeStorage {
  get(key: string): string | null
  set(key: string, value: string): void
  remove(key: string): void
}

/** 已注册的原生模块集合（可能为空或缺项，需能力检测）。 */
interface NativeModulesShape {
  TTSEngine?: NativeTtsEngine
  AudioPlayer?: NativeAudioPlayer
  LynxStorage?: NativeStorage
}

declare let NativeModules: NativeModulesShape

/**
 * 构建期注入的 TTS 服务 base URL（`lynx.config.ts` 的 `source.define` 写入）。
 *
 * 未注入时运行期为 `undefined`；`src/constants/tts.ts` 以 `typeof` 守卫读取，
 * 因此 `typeof __TTS_BASE_URL__ === 'string'` 在未注入 / 非 Lynx 环境下亦**不 throw**。
 */
declare const __TTS_BASE_URL__: string | undefined
