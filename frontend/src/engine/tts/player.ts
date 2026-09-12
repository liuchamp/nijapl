import type { AudioPlayerPort } from '../../types/tts.js'
import { createWebAudioPlayer } from './player.web.js'

/**
 * 播放器 facade（原设计 §4.1 / §8 平台文件职责边界）。
 *
 * 职责边界：**仅探测 + 委托 + 单例**；本文件不含平台 API，不引用 DOM。
 *
 * 迁移说明：原 Lynx 的 `NativeModules.AudioPlayer`（iOS `AVAudioPlayer` /
 * Android `MediaPlayer`）在 Wails 下不存在，`player.native.ts` 已删除。
 * 桌面 WebView 的 DOM `<audio>` + Blob URL 完全覆盖播放需求，且能读状态码、
 * 精确分类错误、进内存缓存、可取消 —— 因此探测链只剩 Web 一级。
 */

/** 探测辅助：把平台实现的异常吸收为 `null`。 */
function probe(factory: () => AudioPlayerPort | null): AudioPlayerPort | null {
  try {
    return factory()
  } catch {
    return null
  }
}

/**
 * 运行时探测可用播放器。
 *
 * @returns 可用实现；不可用时返回 `null`（由 facade 降级到实时合成）。
 */
export function createAudioPlayer(): AudioPlayerPort | null {
  return probe(createWebAudioPlayer)
}

export { createWebAudioPlayer }
