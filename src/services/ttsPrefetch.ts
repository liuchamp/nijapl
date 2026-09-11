import { TTS_PREFETCH_MAX_CONCURRENCY } from '../constants/tts.js'
import { ttsPort } from '../engine/tts/index.js'
import type { TtsOptions } from '../types/ports.js'

/**
 * 预取编排（设计 §5.4）。
 *
 * 红线：
 * - **失败静默**：预取是纯优化，失败不写 notice、不走降级链、不给文案（唯一静默例外，§12.5）；
 * - **不阻塞点击**：并发上限 `TTS_PREFETCH_MAX_CONCURRENCY`，避免抢占用户点击的请求；
 * - **仅当播放器可用**时预取（`ttsPort.prefetch` 内部已按此前置条件过滤，§5.4）。
 *
 * 说明：`TtsPort.prefetch` 为 fire-and-forget（返回 `void`，无法报告完成），
 * 故此处以「每 tick 释放槽位」的**调度节流**近似并发上限，避免同一 tick 内瞬间打满请求。
 * 页面 / store / service **只 import** `src/engine/tts/index.js`，本文件是唯一的预取编排入口。
 */
class TtsPrefetch {
  private queue: Array<{ text: string; opts?: TtsOptions }> = []
  private active = 0

  /**
   * 安排一次预取（fire-and-forget）。
   *
   * @param text 预取文本（`word.kana` / `sentence.ja`）。
   * @param opts 语速 / 音调（与用户点击一致，保证缓存键命中）。
   */
  schedule(text: string, opts?: TtsOptions): void {
    if (text.trim() === '') {
      return
    }
    this.queue.push({ text, opts })
    this.pump()
  }

  /** 清空待处理队列（切模块 / 页面卸载时调用；已在途请求由端口自行收敛）。 */
  clear(): void {
    this.queue = []
  }

  /** 待处理 + 在途数量（调试 / 单测用）。 */
  get pending(): number {
    return this.queue.length + this.active
  }

  /** 以并发上限分发队列。 */
  private pump(): void {
    while (
      this.active < TTS_PREFETCH_MAX_CONCURRENCY &&
      this.queue.length > 0
    ) {
      const job = this.queue.shift()
      if (job === undefined) {
        return
      }
      this.active += 1
      try {
        // 端口永不 throw；失败静默（不写 notice、不降级、无文案）。
        ttsPort.prefetch?.(job.text, job.opts)
      } catch {
        // 静默忽略。
      }
      // 端口 prefetch 无法回报完成 → 以一次宏任务近似「占用槽位」。
      setTimeout(() => {
        this.active -= 1
        this.pump()
      }, 0)
    }
  }
}

/** 全局唯一预取编排器。 */
export const ttsPrefetch = new TtsPrefetch()
