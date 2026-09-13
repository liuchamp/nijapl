import type {
  TtsCapability,
  TtsFailureReason,
  TtsOptions,
  TtsPort,
  TtsResult,
  TtsVoice,
} from '../../types/ports.js'
import type {
  AudioPlayerPort,
  TtsAudioFormat,
  TtsSourceFailure,
  TtsSourcePort,
  TtsSynthesisParams,
} from '../../types/tts.js'
import { hasWailsRuntime, isAndroid, isMobile } from '../platform/index.js'
import { createAudioPlayer } from './player.js'
import { buildSynthesisParams } from './request.js'
import { createMobileTts } from './tts.mobile.js'
import { createWebTts } from './tts.web.js'
import { createTtsHttpClient } from './tts-client.js'
import { createTtsWailsClient } from './tts-client.wails.js'
import { createTtsHandlerClient } from './tts-handler.js'

/**
 * TTS 端口 facade（架构 §2.5 / 设计 §4.3）：运行时能力检测 + **编排** + 单例。
 *
 * 页面 / store / service **只允许** import 本文件，不得直接 import 平台实现
 * （`tts.native.ts` / `tts.web.ts` / `player*.ts`），以保证「全局原生模块引用只出现在 3 个
 * `.native.ts`」红线（修订 R1）。
 *
 * 编排（降级链，§4.7）：
 * ① HTTP 合成 + 播放（`engine:'http'`）→ ② 原生 TTS 实时合成（`engine:'native'`）
 * → ③ Web `speechSynthesis`（`engine:'web'`）→ ④ 明确失败（零静默）。
 *
 * ★ 双通道互斥编排 M1–M3（§4.5.2 / §12.7，独立 `AudioPlayer` 模块的强制补偿）：
 * - **M1**：进入 HTTP 播放前，先 `realtime.stop()`（停实时合成通道）；
 * - **M2**：进入实时合成前，先 `player.stop()`（停播放通道）；
 * - **M3**：`stop()` → `source.cancel()` + `player.stop()` + `realtime.stop()` **三条全停**。
 * 所有 `stop()` **幂等**、**无脑先停**；`player.native.ts` / `tts.native.ts` **禁止交叉调用**对方 `stop`。
 */

/** HTTP / 播放侧的设置覆盖（默认取常量）。 */
export interface ResolvingTtsSettings {
  /** 音色覆盖：`''` 表示只传 `lang`；`undefined` 表示用常量默认音色。 */
  voice?: string
  /** 格式覆盖（默认 `TTS_FORMAT`）。 */
  format?: TtsAudioFormat
}

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

/**
 * 运行时探测可用的**实时合成**实现（移动端原生 TTS → Web `speechSynthesis` → 不可用）。
 *
 * 迁移说明：原 Lynx 的 `NativeModules.TTSEngine`（iOS `AVSpeechSynthesizer` /
 * Android `TextToSpeech`）在 Wails 下由 Go 侧 `application.Mobile` 承接，经
 * `tts.mobile.ts` 暴露为 `engine:'native'`；桌面 WebView 自带 `speechSynthesis`
 * （macOS 系统语音 / Windows SAPI），继续作为降级链第③级免费保留。
 */
function detectRealtimePort(): TtsPort {
  if (isMobile()) {
    const native = probe(createMobileTts)
    if (native !== null) {
      return native
    }
  }
  const web = probe(createWebTts)
  if (web !== null) {
    return web
  }
  return new UnsupportedTtsPort()
}

/** 合成源失败 → 对外失败原因（§4.8）。 */
function mapSourceFailure(reason: TtsSourceFailure): TtsFailureReason {
  switch (reason) {
    case 'bad-request':
      return 'service-rejected'
    case 'network':
    case 'timeout':
    case 'unavailable':
      return 'service-unavailable'
    default:
      return 'error'
  }
}

/**
 * 编排端口：HTTP 合成 + 播放 → 实时合成 → 明确失败。
 *
 * 对外仍是同一个 `TtsPort` 单例（额外方法 `prime` / `prefetch` 为可选，既有调用方无需感知）。
 */
export class ResolvingTtsPort implements TtsPort {
  private readonly source: TtsSourcePort
  private readonly player: AudioPlayerPort | null
  private readonly realtime: TtsPort
  private readonly settings: ResolvingTtsSettings
  /** 调用序号：`stop()` / 每次 `speak()` 递增，用于丢弃迟到响应（§6.5）。 */
  private gen = 0
  /** HTTP 路径最近一次失败原因（决定最终对外 `reason`）。 */
  private lastHttpFailure: TtsFailureReason | undefined

  constructor(
    source: TtsSourcePort,
    player: AudioPlayerPort | null,
    realtime: TtsPort,
    settings: ResolvingTtsSettings = {},
  ) {
    this.source = source
    this.player = player
    this.realtime = realtime
    this.settings = settings
  }

  /** 播放通道可用（HTTP 路径可用）即 `supported`；否则回落实时合成能力。 */
  getCapability(): TtsCapability {
    if (this.player?.getCapability() === 'supported') {
      return 'supported'
    }
    return this.realtime.getCapability()
  }

  async speak(text: string, opts?: TtsOptions): Promise<TtsResult> {
    const gen = ++this.gen
    this.lastHttpFailure = undefined
    // ★ M1 互斥：进入 HTTP 播放前，先停实时合成通道。
    this.realtime.stop()

    const player = this.player
    if (player !== null && player.getCapability() === 'supported') {
      const params = this.buildParams(text, opts)
      const result = await this.source.synthesize(params, gen)
      if (gen !== this.gen) {
        // 迟到响应（已被更新的调用取代）→ 丢弃，不出声；返回良性成功避免误报文案。
        return { ok: true, engine: 'http' }
      }
      if (result.ok) {
        const played = await player.play(result.clip)
        if (played.ok) {
          return { ok: true, engine: 'http' }
        }
        this.lastHttpFailure =
          played.reason === 'blocked' ? 'blocked' : 'no-player'
      } else if (result.reason === 'empty-text') {
        // 空文本未真正尝试 HTTP：不记录 HTTP 失败。
        this.lastHttpFailure = undefined
      } else {
        this.lastHttpFailure = mapSourceFailure(result.reason)
      }
    } else {
      // 播放器不可用 → 跳过 HTTP 路径（不浪费网络）。
      this.lastHttpFailure = 'no-player'
    }

    // ★ M2 互斥：进入实时合成前，先停播放通道。
    this.player?.stop()
    let realtimeFailure: TtsFailureReason | undefined
    if (this.realtime.getCapability() !== 'unsupported') {
      const fallback = await this.realtime.speak(text, opts)
      if (fallback.ok) {
        return fallback
      }
      realtimeFailure = fallback.reason
    }
    return { ok: false, reason: this.finalReason(realtimeFailure) }
  }

  /** ★ M3：三通道全停（缺一即可能留残声）；同时递增 gen 丢弃在途迟到响应。 */
  stop(): void {
    this.gen += 1
    this.source.cancel()
    this.player?.stop()
    this.realtime.stop()
  }

  /** 手势内同步解锁播放通道（Web 必需；原生为空操作）。 */
  prime(): void {
    this.player?.prime()
  }

  /** 预取（fire-and-forget；**仅当播放器可用**时，否则纯浪费流量，§5.4）。 */
  prefetch(text: string, opts?: TtsOptions): void {
    if (this.player === null || this.player.getCapability() !== 'supported') {
      return
    }
    this.source.prefetch(this.buildParams(text, opts))
  }

  async getVoices(): Promise<TtsVoice[]> {
    return this.realtime.getVoices()
  }

  /** 构造合成参数（常量默认 + 设置覆盖）。 */
  private buildParams(text: string, opts?: TtsOptions): TtsSynthesisParams {
    const base = buildSynthesisParams(text, opts)
    const voice =
      this.settings.voice === undefined
        ? base.voice
        : this.settings.voice === ''
          ? undefined
          : this.settings.voice
    return {
      ...base,
      voice,
      format: this.settings.format ?? base.format,
    }
  }

  /** 最终对外失败原因（§4.7）：优先保留实时合成中更具体的原因。 */
  private finalReason(realtimeFailure?: TtsFailureReason): TtsFailureReason {
    if (realtimeFailure === 'no-ja-voice' || realtimeFailure === 'blocked') {
      return realtimeFailure
    }
    return this.lastHttpFailure ?? 'no-tts'
  }
}

/**
 * 合成源装配：APK（Android UA）走同源 Go HTTP handler（query only，
 * 规避 WebView 绑定不可靠）；桌面 Wails 宿主走 Go 绑定；
 * 否则回退到前端 `fetch` 实现（浏览器直连自建服务）。
 */
function createTtsSource(): TtsSourcePort {
  if (isAndroid()) {
    return createTtsHandlerClient()
  }
  if (hasWailsRuntime()) {
    return createTtsWailsClient()
  }
  return createTtsHttpClient()
}

/**
 * 合成源的**惰性装配代理**（防御宿主注入时序，见 `engine/platform` 文件头的 ⚠️ 注）。
 *
 * `createTtsSource()` 靠 `hasWailsRuntime()` 选路，而宿主注入 `_wails.environment`
 * 可能晚于本模块求值。若在模块顶层立即装配，桌面会被误判为浏览器 → 选中 `fetch`
 * 直连实现；桌面 WebView 同样执行同源策略，直连 `http://127.0.0.1:8000` 会被
 * CORS 拦截（见 `tts-client.wails.ts` 文件头），HTTP 路径将**永久失效**。
 *
 * 故推迟到**首次真正合成**时才装配（用户点击远晚于模块加载，届时宿主已就绪）：
 * - `synthesize` → 触发装配；
 * - `prefetch` / `cancel` → 未装配时直接跳过：既未发起请求便无需取消，
 *   也不为一次预取就把选路固化成可能错误的实现。
 */
function createLazyTtsSource(): TtsSourcePort {
  let inner: TtsSourcePort | undefined
  const resolve = (): TtsSourcePort => (inner ??= createTtsSource())
  return {
    synthesize: (params, gen) => resolve().synthesize(params, gen),
    prefetch: (params) => {
      inner?.prefetch(params)
    },
    cancel: () => {
      inner?.cancel()
    },
  }
}

/**
 * 全局唯一 TTS 端口（合成 + 播放编排 + 实时合成降级）。
 *
 * 移动端 `player = null`：跳过 HTTP 合成 / 播放通道，彻底规避真机对局域网
 * 自建 TTS 服务 IP 的依赖，直接走原生 TTS（`engine:'native'`）；桌面保持
 * `createAudioPlayer()`（HTTP → 实时合成降级链不变）。
 *
 * 这里顶层求值 `isMobile()` 是**安全**的：移动端判据走 UA 兜底，模块加载期
 * 即可确定（见 `engine/platform`）。受宿主注入时序影响的只有 `createTtsSource()`，
 * 已由下方 `createLazyTtsSource()` 改为惰性装配。
 */
const mobile = isMobile()
export const ttsPort: TtsPort = new ResolvingTtsPort(
  createLazyTtsSource(),
  mobile ? null : createAudioPlayer(),
  detectRealtimePort(),
)

/** 取 TTS 端口（与 `ttsPort` 等价，供依赖注入风格调用）。 */
export function getTtsPort(): TtsPort {
  return ttsPort
}

export type { TtsCapability, TtsOptions, TtsPort, TtsResult, TtsVoice }
export { createWebTts, UnsupportedTtsPort }
