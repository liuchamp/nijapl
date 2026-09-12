import type {
  TtsCapability,
  TtsOptions,
  TtsPort,
  TtsResult,
  TtsVoice,
} from '../../types/ports.js'

/**
 * Web TTS 实现：基于 `speechSynthesis`。
 *
 * 要点（架构 §2.5 / §3.4）：
 * - **存在性检测**：`speechSynthesis` / `SpeechSynthesisUtterance` 缺一即返回 `null`；
 * - **ja 前缀过滤**：仅认同 `lang` 以 `ja` 开头的语音；
 * - **`voiceschanged` 兜底**：语音列表异步加载，首次为空时等待事件（带超时兜底）；
 * - 端口契约：**永不 throw**，失败以 `{ok:false, reason}` 返回（零静默失败）。
 *
 * 说明：本文件不引用全局原生模块，也不依赖 DOM 全局类型（通过 `globalThis` 探测），
 * 保证在 Lynx 原生端打包时同样可安全加载（探测为 `null` 后由 facade 降级）。
 */

interface WebVoiceLike {
  voiceURI?: string
  name?: string
  lang?: string
}

interface WebUtteranceLike {
  text: string
  lang: string
  rate: number
  pitch: number
  onend?: (() => void) | null
  onerror?: (() => void) | null
}

interface SpeechSynthesisLike {
  speak(utterance: WebUtteranceLike): void
  cancel(): void
  getVoices(): WebVoiceLike[]
  addEventListener?(type: string, listener: () => void): void
  removeEventListener?(type: string, listener: () => void): void
}

interface WebSpeechGlobal {
  speechSynthesis?: SpeechSynthesisLike
  SpeechSynthesisUtterance?: new (text: string) => WebUtteranceLike
}

/** `voiceschanged` 等待上限（毫秒）：超时即按当前列表定论，避免悬挂。 */
const VOICES_CHANGED_TIMEOUT_MS = 800

function readWebSpeech(): WebSpeechGlobal {
  return globalThis as unknown as WebSpeechGlobal
}

/** 过滤出日语语音（`lang` 以 `ja` 开头，大小写不敏感）。 */
function toJapaneseVoices(synth: SpeechSynthesisLike): TtsVoice[] {
  const voices: TtsVoice[] = []
  for (const voice of synth.getVoices()) {
    const lang = typeof voice.lang === 'string' ? voice.lang.toLowerCase() : ''
    if (!lang.startsWith('ja')) {
      continue
    }
    voices.push({
      id: voice.voiceURI ?? voice.name ?? lang,
      lang: voice.lang ?? lang,
      name: voice.name ?? voice.voiceURI ?? lang,
    })
  }
  return voices
}

/** 原生实现：基于 `speechSynthesis`。 */
class WebTtsPort implements TtsPort {
  private readonly synth: SpeechSynthesisLike
  private readonly Utterance: new (
    text: string,
  ) => WebUtteranceLike

  constructor(
    synth: SpeechSynthesisLike,
    Utterance: new (text: string) => WebUtteranceLike,
  ) {
    this.synth = synth
    this.Utterance = Utterance
  }

  getCapability(): TtsCapability {
    // Web 端 `speechSynthesis` 存在即可尝试朗读；首次非手势播放可能被拦截，
    // 由 `speak()` 的 `blocked` / UI 提示兜底（架构 §4.2）。
    return 'supported'
  }

  async speak(text: string, opts?: TtsOptions): Promise<TtsResult> {
    try {
      const all = this.synth.getVoices()
      const japanese = await this.getVoices()
      // 平台已上报语音，但其中没有日语 → 明确告知「无日语语音」，不做静默失败。
      if (all.length > 0 && japanese.length === 0) {
        return { ok: false, reason: 'no-ja-voice' }
      }

      const utterance = new this.Utterance(text)
      utterance.text = text
      utterance.lang = 'ja-JP'
      utterance.rate = clamp(
        typeof opts?.rate === 'number' ? opts.rate : 1,
        0.5,
        2,
      )
      utterance.pitch = clamp(
        typeof opts?.pitch === 'number' ? opts.pitch : 1,
        0,
        2,
      )

      this.synth.cancel()
      this.synth.speak(utterance)
      return { ok: true, engine: 'web' }
    } catch {
      return { ok: false, reason: 'error' }
    }
  }

  stop(): void {
    try {
      this.synth.cancel()
    } catch {
      // 端口契约：永不 throw；停止失败静默降级。
      return
    }
  }

  async getVoices(): Promise<TtsVoice[]> {
    const immediate = toJapaneseVoices(this.synth)
    if (immediate.length > 0) {
      return immediate
    }
    // 已有语音列表但无日语 → 无需等待事件，直接定论为「无日语语音」。
    if (this.synth.getVoices().length > 0) {
      return []
    }
    // 取本地引用：闭包内不再对 `this.synth` 的可选属性做类型收窄。
    const synth = this.synth
    const subscribe = synth.addEventListener
    if (typeof subscribe !== 'function') {
      return []
    }
    return new Promise<TtsVoice[]>((resolve) => {
      let settled = false
      const finish = (): void => {
        if (settled) {
          return
        }
        settled = true
        try {
          synth.removeEventListener?.('voiceschanged', finish)
        } catch {
          // 解绑失败不影响结果。
        }
        resolve(toJapaneseVoices(synth))
      }
      try {
        subscribe.call(synth, 'voiceschanged', finish)
      } catch {
        finish()
        return
      }
      setTimeout(finish, VOICES_CHANGED_TIMEOUT_MS)
    })
  }
}

/** 区间收敛，避免非法语速 / 音调传入平台 API。 */
function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) {
    return min
  }
  return Math.min(Math.max(value, min), max)
}

/**
 * 创建 Web TTS 端口。
 *
 * @returns `speechSynthesis` 与 `SpeechSynthesisUtterance` 均存在时返回实现；否则 `null`。
 */
export function createWebTts(): TtsPort | null {
  const speech = readWebSpeech()
  if (
    typeof speech.speechSynthesis === 'undefined' ||
    typeof speech.SpeechSynthesisUtterance === 'undefined'
  ) {
    return null
  }
  return new WebTtsPort(speech.speechSynthesis, speech.SpeechSynthesisUtterance)
}
