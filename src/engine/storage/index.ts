import type { StoragePort } from '../../types/ports.js'
import { createNativeStorage } from './storage.native.js'
import { createWebStorage } from './storage.web.js'

/**
 * 存储端口 facade（架构 §2.5）：能力检测 + **内存兜底** + 单例。
 *
 * 检测顺序：原生（全局原生模块 `LynxStorage`）→ Web（宿主桥接 / `sessionStorage`）→ 内存兜底。
 *
 * 内存兜底的意义：LynxExplorer 调试期原生模块常未注册、Web 存储也可能不存在，
 * 此实现保证**不崩**（进程内有效，重启后丢失），并让上层逻辑照常运行。
 */

/** 内存兜底实现：进程内 Map，键值均为字符串（与端口契约一致）。 */
class MemoryStoragePort implements StoragePort {
  private readonly memory = new Map<string, string>()

  async get(key: string): Promise<string | null> {
    const value = this.memory.get(key)
    return value === undefined ? null : value
  }

  async set(key: string, value: string): Promise<void> {
    this.memory.set(key, value)
  }

  async remove(key: string): Promise<void> {
    this.memory.delete(key)
  }
}

/** 探测辅助：把平台实现的异常吸收为 `null`，保证探测过程本身不 throw。 */
function probe(factory: () => StoragePort | null): StoragePort | null {
  try {
    return factory()
  } catch {
    return null
  }
}

/** 运行时探测可用实现（单例在模块加载时定型）。 */
function detectStoragePort(): StoragePort {
  const native = probe(createNativeStorage)
  if (native !== null) {
    return native
  }
  const web = probe(createWebStorage)
  if (web !== null) {
    return web
  }
  return new MemoryStoragePort()
}

/** 全局唯一存储端口。 */
export const storagePort: StoragePort = detectStoragePort()

/** 取存储端口（与 `storagePort` 等价，供依赖注入风格调用）。 */
export function getStoragePort(): StoragePort {
  return storagePort
}

export type { StoragePort }
export { createNativeStorage, createWebStorage, MemoryStoragePort }
