import type {
  TtsCapability,
  TtsOptions,
  TtsPort,
  TtsResult,
  TtsVoice,
} from '../../types/ports.js'

/**
 * 原生 TTS 实现（iOS `AVSpeechSynthesizer(ja-JP)` / Android `TextToSpeech(Locale.JAPANESE)`）。
 *
 * 红线（架构 §1.5 / §8.5）：
 * - **本文件是唯一允许引用全局 `NativeModules` 的 TTS 文件**；
 * - 原生模块仅在 Background Thread Scripting 可用，ReactLynx 业务 JS 默认后台线程，
 *   因此本文件**不得**出现 `'main thread'` 指令；
 * - 端口契约：**永不 throw**，失败一律以 `TtsResult.ok=false` 返回。
 *
 * 未注册 `NativeModules.TTSEngine` 时 `createNativeTts()` 返回 `null`（交由 facade 降级）。
 */

/** 读取已注册的原生 TTS 引擎；未注册 / 非 Lynx 环境返回 `undefined`（不抛错）。 */
function getNativeEngine(): NativeTtsEngine | undefined {
  if (typeof NativeModules === 'undefined') {
    return undefined
  }
  return NativeModules.TTSEngine
}

/** 原生实现。 */
class NativeTtsPort implements TtsPort {
  private readonly engine: NativeTtsEngine

  constructor(engine: NativeTtsEngine) {
    this.engine = engine
  }

  /** 原生模块已注册即视为可直接朗读。 */
  getCapability(): TtsCapability {
    return 'supported'
  }

  async speak(text: string, opts?: TtsOptions): Promise<TtsResult> {
    try {
      const rate = typeof opts?.rate === 'number' ? opts.rate : 1
      const pitch = typeof opts?.pitch === 'number' ? opts.pitch : 1
      this.engine.speak(text, rate, pitch)
      return { ok: true, engine: 'native' }
    } catch {
      return { ok: false, reason: 'error' }
    }
  }

  stop(): void {
    try {
      this.engine.stop()
    } catch {
      // 端口契约：永不 throw；停止失败静默降级（无需用户提示）。
      return
    }
  }

  async getVoices(): Promise<TtsVoice[]> {
    // 原生引擎按系统语言朗读，不提供语音枚举。
    return []
  }
}

/**
 * 创建原生 TTS 端口。
 *
 * @returns 已注册原生模块时返回实现；否则返回 `null`（表示不可用，由 facade 继续降级）。
 */
export function createNativeTts(): TtsPort | null {
  const engine = getNativeEngine()
  if (engine === undefined) {
    return null
  }
  return new NativeTtsPort(engine)
}
