import type { AudioPlayerPort } from '../../types/tts.js'
import { createNativeAudioPlayer } from './player.native.js'
import { createWebAudioPlayer } from './player.web.js'

/**
 * 播放器 facade（设计 §4.1 / §8 平台文件职责边界）。
 *
 * 职责边界：**仅探测 + 委托 + 单例**；本文件不含平台 API，不引用原生模块 / DOM。
 *
 * 探测顺序：原生（`NativeModules.AudioPlayer`）→ Web（DOM `Audio`）→ `null`。
 * 探测过程吸收平台异常，保证**永不 throw**（探测不到即返回 `null`，由 facade 降级到实时合成）。
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
 * @returns 首个可用实现；两者均不可用时返回 `null`。
 */
export function createAudioPlayer(): AudioPlayerPort | null {
  const native = probe(createNativeAudioPlayer)
  if (native !== null) {
    return native
  }
  return probe(createWebAudioPlayer)
}

export { createNativeAudioPlayer, createWebAudioPlayer }
