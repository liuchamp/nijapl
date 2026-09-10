/**
 * 全局环境声明：Lynx 原生模块（Native Modules）。
 *
 * 原生模块仅在 Background Thread Scripting 中可用，通过全局 `NativeModules`
 * 同步调用（见架构 §1.0 F3）。本文件**不含 import/export**，作为全局脚本声明。
 *
 * 注意：只有 `src/engine/tts/tts.native.ts` 与 `src/engine/storage/storage.native.ts`
 * 允许引用 `NativeModules`（端口实现，T03）。
 */

/** 原生 TTS 引擎（iOS AVSpeechSynthesizer / Android TextToSpeech）。 */
interface NativeTtsEngine {
  speak(text: string, rate: number, pitch: number): void
  stop(): void
  isSpeaking(): boolean
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
  LynxStorage?: NativeStorage
}

declare let NativeModules: NativeModulesShape
