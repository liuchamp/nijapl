import type {
  TtsCapability,
  TtsOptions,
  TtsPort,
  TtsResult,
  TtsVoice,
} from '../../types/ports.js'
import { createNativeTts } from './tts.native.js'
import { createWebTts } from './tts.web.js'

/**
 * TTS 端口 facade（架构 §2.5）：运行时能力检测 + 平台实现委托 + 单例。
 *
 * 页面 / store / service **只允许** import 本文件，不得直接 import 平台实现
 * （`tts.native.ts` / `tts.web.ts`），以保证「全局原生模块引用只出现在 2 个 `.native.ts`」红线。
 *
 * 检测顺序：原生（全局原生模块 `TTSEngine`）→ Web（`speechSynthesis`）→ 不可用降级。
 */

/** 无任何可用引擎时的降级实现：能力 `unsupported`，`speak` 恒返回 `no-tts`。 */
class UnsupportedTtsPort implements TtsPort {
  getCapability(): TtsCapability {
    return 'unsupported'
  }

  async speak(): Promise<TtsResult> {
    return { ok: false, reason: 'no-tts' }
  }

  stop(): void {
    return
  }

  async getVoices(): Promise<TtsVoice[]> {
    return []
  }
}

/** 探测辅助：把平台实现的异常吸收为 `null`，保证探测过程本身不 throw。 */
function probe(factory: () => TtsPort | null): TtsPort | null {
  try {
    return factory()
  } catch {
    return null
  }
}

/** 运行时探测可用实现（单例在模块加载时定型）。 */
function detectTtsPort(): TtsPort {
  const native = probe(createNativeTts)
  if (native !== null) {
    return native
  }
  const web = probe(createWebTts)
  if (web !== null) {
    return web
  }
  return new UnsupportedTtsPort()
}

/** 全局唯一 TTS 端口。 */
export const ttsPort: TtsPort = detectTtsPort()

/** 取 TTS 端口（与 `ttsPort` 等价，供依赖注入风格调用）。 */
export function getTtsPort(): TtsPort {
  return ttsPort
}

export type { TtsCapability, TtsOptions, TtsPort, TtsResult, TtsVoice }
export { createNativeTts, createWebTts, UnsupportedTtsPort }
