import type { TtsSourceResult } from '../../types/tts.js'

/**
 * 客户端 singleflight（并发去重，设计 §6.6）。
 *
 * 红线（§8 平台文件职责边界）：**纯 TS**，零框架、零原生、零 DOM。
 *
 * 语义：
 * - 同 `key` 的并发调用**复用同一 Promise**（只发一次网络请求）；
 * - **失败结果不缓存**：Promise settle 后立即从 map 删除（失败也删），避免毒化；
 * - 与服务端 `singleflight`（H6）互补：服务端防上游击穿，客户端防用户连点 / 多组件同时请求。
 */
export class TtsInflight {
  private readonly pending = new Map<string, Promise<TtsSourceResult>>()

  /** 当前在途请求数（调试 / 单测用）。 */
  get size(): number {
    return this.pending.size
  }

  /**
   * 执行（或复用）一次任务。
   *
   * @param key 去重键（与缓存键一致）。
   * @param task 真正发起请求的工厂；仅在该 key 无在途请求时被调用。
   */
  run(
    key: string,
    task: () => Promise<TtsSourceResult>,
  ): Promise<TtsSourceResult> {
    const existing = this.pending.get(key)
    if (existing !== undefined) {
      return existing
    }
    let tracked: Promise<TtsSourceResult>
    try {
      tracked = task()
    } catch {
      // 任务工厂自身同步抛错（端口契约下不应发生）：归一为失败结果，避免污染 map。
      return Promise.resolve({ ok: false, reason: 'error' })
    }
    const settled = tracked.finally(() => {
      // 失败也删除：失败结果不缓存、不阻塞后续重试。
      this.pending.delete(key)
    })
    this.pending.set(key, settled)
    return settled
  }

  /** 清空在途记录（取消时调用；在途 Promise 仍会 settle，此处仅解除去重）。 */
  clear(): void {
    this.pending.clear()
  }
}
