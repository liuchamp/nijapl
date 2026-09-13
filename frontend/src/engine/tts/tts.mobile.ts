import { Mobile } from '../../../bindings/nijapl/internal/services/index.js'
import type {
  TtsCapability,
  TtsPort,
  TtsResult,
  TtsVoice,
} from '../../types/ports.js'
import { isMobile } from '../platform/index.js'

/**
 * 移动端原生 TTS 实现（`TtsPort` 的 Go 侧适配器，出声来源 `engine:'native'`）。
 *
 * 对接 Go 服务 `internal/services.Mobile`（内部转发 `application.Mobile` →
 * iOS `AVSpeechSynthesizer` / Android `TextToSpeech`）。移动端由 `engine/tts/index.ts`
 * 装配为实时合成首选（第②级），桌面不构造本端口。
 *
 * ★ 设计说明 —— 为何 `speak` 乐观返回成功：
 * Wails 绑定 `Mobile.Speak` **无返回值**（Go 侧 `application.Mobile.Speak` 是
 * fire-and-forget 的 void），前端**无法同步判定**合成 / 播放是否成功。移动端 OS
 * 必带系统 TTS 引擎，故按「已派发即成功」乐观返回 `{ ok: true, engine: 'native' }`；
 * 仅当绑定调用本身抛异常（宿主不可达）时才返回 `{ ok: false, reason: 'error' }`。
 *
 * 契约：端口**永不 throw**，失败以判别结果返回（零静默失败）。
 */

/** 原生实现：`engine:'native'`（移动端实时合成）。 */
class MobileTtsPort implements TtsPort {
  /** 移动端即 `supported`，否则 `unsupported`（桌面不会构造本实例）。 */
  getCapability(): TtsCapability {
    return isMobile() ? 'supported' : 'unsupported'
  }

  /**
   * 派发一次原生合成（`text` 由 OS TTS 引擎朗读）。
   *
   * 绑定为 fire-and-forget：`await` 仅等到「已派发」，无法感知播放结果 →
   * 乐观返回成功（见文件头设计说明）。
   */
  async speak(text: string): Promise<TtsResult> {
    try {
      await Mobile.Speak(text)
      return { ok: true, engine: 'native' }
    } catch {
      return { ok: false, reason: 'error' }
    }
  }

  /** 停原生合成（幂等；绑定异常静默，端口永不 throw）。 */
  stop(): void {
    try {
      void Promise.resolve(Mobile.StopSpeak()).catch(() => undefined)
    } catch {
      // 宿主不可达 → 停止失败静默（端口契约：永不 throw）。
    }
  }

  /** 原生 TTS 不枚举语音（由 OS 决定），恒返回空列表。 */
  async getVoices(): Promise<TtsVoice[]> {
    return []
  }
}

/**
 * 创建移动端原生 TTS 端口（probe 风格）。
 *
 * @returns 移动端（iOS / Android）返回实现；否则返回 `null`（交由 facade 继续降级到 Web）。
 */
export function createMobileTts(): TtsPort | null {
  if (!isMobile()) {
    return null
  }
  return new MobileTtsPort()
}
