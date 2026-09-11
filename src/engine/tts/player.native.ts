import type {
  AudioPlaybackCapability,
  AudioPlayerPort,
  AudioPlayResult,
  TtsAudioClip,
} from '../../types/tts.js'

/**
 * 原生音频播放实现（设计 §4.5，`NativeModules.AudioPlayer`）。
 *
 * 红线（架构 §1.5 / §8.5，修订 R1 白名单第 3 个引用点）：
 * - **本文件只引用 `NativeModules.AudioPlayer`**，**绝不**引用 `NativeModules.TTSEngine`
 *   （与 `tts.native.ts` 各管一个模块，能力检测与真实能力一一对应）；
 * - 原生模块仅在后台线程可用（ReactLynx 业务 JS 默认后台线程），本文件**不得**出现 `'main thread'`；
 * - 端口契约：**永不 throw**，失败以 `{ok:false, reason}` 返回；
 * - 跨模块互斥（与 `TTSEngine`）**不由本文件实现**，由 JS 侧 facade 的 M1–M3 编排保证（§12.7）。
 *
 * 未注册 `NativeModules.AudioPlayer` 时 `createNativeAudioPlayer()` 返回 `null`（交由 facade 降级）。
 */

/** 读取已注册的原生播放器；未注册 / 非 Lynx 环境返回 `undefined`（不抛错）。 */
function getNativeAudioPlayer(): NativeAudioPlayer | undefined {
  if (typeof NativeModules === 'undefined') {
    return undefined
  }
  return NativeModules.AudioPlayer
}

/** 原生实现。 */
class NativeAudioPlayerPort implements AudioPlayerPort {
  private readonly mod: NativeAudioPlayer

  constructor(mod: NativeAudioPlayer) {
    this.mod = mod
  }

  /** 原生模块已注册即视为可播放。 */
  getCapability(): AudioPlaybackCapability {
    return 'supported'
  }

  /** 原生端解锁为空操作（无自动播放限制）。 */
  prime(): void {
    return
  }

  async play(clip: TtsAudioClip): Promise<AudioPlayResult> {
    try {
      const base64 = clip.base64
      if (typeof base64 !== 'string' || base64 === '') {
        // 原生播放需要 base64；缺失即明确失败（不静默）。
        return { ok: false, reason: 'play-error' }
      }
      const mime = typeof clip.mime === 'string' ? clip.mime : 'audio/mpeg'
      this.mod.playBytes(base64, mime)
      return { ok: true, channel: 'native' }
    } catch {
      // 跨线程异常会炸后台线程 → 内部兜底，永不 throw。
      return { ok: false, reason: 'play-error' }
    }
  }

  stop(): void {
    try {
      this.mod.stopPlayback()
    } catch {
      // 端口契约：永不 throw；停止失败静默降级。
      return
    }
  }
}

/**
 * 创建原生播放端口。
 *
 * @returns 已注册 `NativeModules.AudioPlayer` 时返回实现；否则 `null`（由 facade 继续降级到 Web）。
 */
export function createNativeAudioPlayer(): AudioPlayerPort | null {
  const mod = getNativeAudioPlayer()
  if (mod === undefined) {
    return null
  }
  return new NativeAudioPlayerPort(mod)
}
