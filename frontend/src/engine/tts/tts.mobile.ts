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
 * 本文件调用的是 **Go 服务层**的 `services.Mobile.Speak(text) bool`
 * （`internal/services/mobile.go`），它内部转发到 Wails SDK 的
 * `application.Mobile.Speak(text)`（后者**无返回值**，fire-and-forget），
 * 并把 `bool` **恒置为 `true`**，语义仅为「**已派发**」。
 * 该 `true` **不表示**合成 / 播放成功——Wails 侧无从得知结果——因此前端拿不到
 * 任何可用于判定的信息。移动端 OS 必带系统 TTS 引擎，故按「已派发即成功」乐观
 * 返回 `{ ok: true, engine: 'native' }`；仅当绑定调用本身抛异常（宿主不可达）时
 * 才返回 `{ ok: false, reason: 'error' }`。
 *
 * 注：Go 侧同样**不校验空文本**（空串也返回 `true`），与 HTTP 路径的 `empty-text`
 * 分支不对称；但本 `speak` 的调用方始终是绑定到具体词条 / 例句的发音按钮，
 * 空文本不会由 UI 触发，故不额外拦截（端口契约的「零静默失败」针对的是宿主不可达）。
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
   * `services.Mobile.Speak` 虽返回 `bool`，但**恒为 `true`**（只表示「已派发」，
   * 见文件头设计说明）——无法区分成功与失败，故此处**刻意不使用**其返回值，
   * 一律乐观返回成功：`await` 仅等待「派发请求已送达宿主」。
   */
  async speak(text: string): Promise<TtsResult> {
    try {
      await Mobile.Speak(text) // 返回值恒为 true、无判定语义（见上）
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
