import { STRINGS } from '../constants/strings.js'
import { ttsPort } from '../engine/tts/index.js'
import type { TtsCapability, TtsResult } from '../types/ports.js'
import type { StudySettings } from '../types/progress.js'

/**
 * C1 语音单例控制器（架构 §2.7 / §4.2）。
 *
 * 职责与红线：
 * 1. **视觉反馈先于能力检测与出声**：`speak()` 同步置 `speakingText`，
 *    不 await 任何东西，保证「点击 ≤100ms 有反馈」；
 * 2. 能力检测 → 出声，失败时给出**明确文案**，绝不静默失败；
 * 3. 朗读文本恒取调用方传入的 `word.kana`（架构 §4.2），不做训读/音读切换；
 * 4. 端口调用在后台线程（ReactLynx 业务 JS 默认后台线程），本文件**不得**出现 `'main thread'`；
 * 5. 本文件不直接引用原生模块，只依赖 T03 的 `ttsPort` facade。
 */

/** 控制器对外可见状态（不可变快照，供 `useSyncExternalStore` 消费）。 */
export interface TtsControllerState {
  /** 正在朗读的文本；`null` 表示空闲（按钮据此高亮）。 */
  speakingText: string | null
  /** 最近一次请求的文本（用于把提示只显示在对应按钮下方）。 */
  lastText: string
  /** 当前环境能力。 */
  capability: TtsCapability
  /** 明确提示（降级 / 失败 / 需手势）；零静默失败。 */
  notice: string | null
  /** 供「复制假名」使用的文本。 */
  fallbackText: string | null
  /** 最近一次复制反馈。 */
  copyNotice: string | null
}

type Listener = (state: TtsControllerState) => void

/** 视觉反馈最短保持时长，保证「点击有反馈」可被感知。 */
const HOLD_MIN_MS = 500
/** 视觉反馈最长保持时长（长句）。 */
const HOLD_MAX_MS = 1800
/** 每字符追加的保持时长。 */
const HOLD_PER_CHAR_MS = 150

/** 按失败原因给出明确文案。 */
function describeTtsFailure(reason: string): string {
  switch (reason) {
    case 'no-tts':
      return STRINGS.tts.unsupportedBody
    case 'no-ja-voice':
      return STRINGS.tts.noJaVoice
    case 'blocked':
      return STRINGS.tts.blocked
    default:
      return STRINGS.tts.error
  }
}

/**
 * 尝试写剪贴板：优先 Lynx 宿主能力，其次 Web `navigator.clipboard`。
 *
 * 说明：本项目未定义 Clipboard 端口（T03 端口范围仅 TTS/Storage），
 * 故此处用**受保护的运行时探测**实现「复制假名」；两者都不可用时返回 `false`，
 * 由 UI 明确提示「假名如下，请手动复制」并显示假名（不是静默失败）。
 */
function tryClipboard(text: string): boolean {
  const g = globalThis as unknown as {
    lynx?: { setClipboardData?: (options: { text: string }) => void }
    navigator?: { clipboard?: { writeText?: (text: string) => Promise<void> } }
  }

  const viaLynx = (): boolean => {
    const setter = g.lynx?.setClipboardData
    if (typeof setter !== 'function') {
      return false
    }
    setter.call(g.lynx, { text })
    return true
  }
  const viaNavigator = (): boolean => {
    const clipboard = g.navigator?.clipboard
    const write = clipboard?.writeText
    if (typeof write !== 'function') {
      return false
    }
    void write.call(clipboard, text)
    return true
  }

  try {
    if (viaLynx()) {
      return true
    }
  } catch {
    // Lynx 剪贴板不可用 → 继续尝试 Web 剪贴板。
  }
  try {
    if (viaNavigator()) {
      return true
    }
  } catch {
    // Web 剪贴板被拒绝（非安全上下文 / 权限）→ 明确降级。
  }
  return false
}

/** 语音控制器。 */
class TtsController {
  private state: TtsControllerState = {
    speakingText: null,
    lastText: '',
    capability: 'unsupported',
    notice: null,
    fallbackText: null,
    copyNotice: null,
  }

  private readonly listeners = new Set<Listener>()

  constructor() {
    this.state = { ...this.state, capability: this.safeCapability() }
  }

  /** 状态快照（稳定引用，仅在变更时替换）。 */
  readonly getState = (): TtsControllerState => {
    return this.state
  }

  /** 订阅（稳定引用，可直接传给 `useSyncExternalStore`）。 */
  readonly subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener)
    return (): void => {
      this.listeners.delete(listener)
    }
  }

  /** 读取能力（端口永不 throw；此处仅做兜底）。 */
  private safeCapability(): TtsCapability {
    try {
      return ttsPort.getCapability()
    } catch {
      return 'unsupported'
    }
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener(this.state)
    }
  }

  private patch(next: Partial<TtsControllerState>): void {
    this.state = { ...this.state, ...next }
    this.emit()
  }

  /**
   * 朗读文本。
   *
   * 顺序严格为：① 同步置视觉反馈 → ② 能力检测 → ③ 出声 → ④ 失败给明确文案。
   */
  async speak(
    text: string,
    settings?: Pick<StudySettings, 'rate' | 'pitch'>,
  ): Promise<TtsResult> {
    // ① 事件回调内同步执行，先于任何 await：保证 ≤100ms 有反馈。
    this.patch({
      speakingText: text,
      lastText: text,
      notice: null,
      fallbackText: null,
    })
    const holdMs = Math.min(
      HOLD_MAX_MS,
      Math.max(HOLD_MIN_MS, text.length * HOLD_PER_CHAR_MS),
    )
    const timer = setTimeout(() => {
      if (this.state.speakingText === text) {
        this.patch({ speakingText: null })
      }
    }, holdMs)

    // ② 能力检测
    const capability = this.safeCapability()
    this.patch({ capability })
    if (capability === 'unsupported') {
      clearTimeout(timer)
      this.patch({
        speakingText: null,
        notice: STRINGS.tts.unsupportedBody,
        fallbackText: text,
      })
      return { ok: false, reason: 'no-tts' }
    }

    // ③ 出声（端口永不 throw，这里仍兜底一次）
    let result: TtsResult
    try {
      result = await ttsPort.speak(text, {
        rate: settings?.rate,
        pitch: settings?.pitch,
      })
    } catch {
      result = { ok: false, reason: 'error' }
    }

    // ④ 失败 / 需手势 → 明确提示 + 提供假名兜底
    if (!result.ok) {
      clearTimeout(timer)
      this.patch({
        speakingText: null,
        notice: describeTtsFailure(result.reason),
        fallbackText: text,
      })
    } else if (capability === 'gesture-required') {
      this.patch({ notice: STRINGS.tts.blocked })
    }
    return result
  }

  /** 停止朗读并清除视觉反馈。 */
  stop(): void {
    try {
      ttsPort.stop()
    } catch {
      // 端口契约：永不 throw；这里仅兜底。
    }
    this.patch({ speakingText: null })
  }

  /** 复制假名（无剪贴板能力时明确降级并仍返回文本）。 */
  copyKana(text: string): string {
    const copied = tryClipboard(text)
    this.patch({
      copyNotice: copied ? STRINGS.tts.copied : STRINGS.tts.copyFallback,
      fallbackText: text,
    })
    return text
  }

  /** 清除提示（如切换卡片时）。 */
  clearNotice(): void {
    this.patch({ notice: null, copyNotice: null })
  }
}

/** 全局唯一语音控制器。 */
export const ttsController = new TtsController()
