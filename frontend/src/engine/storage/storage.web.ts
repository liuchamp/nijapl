import type { StoragePort } from '../../types/ports.js'

/**
 * Web 存储实现。
 *
 * 架构 §2.5 约定为「宿主桥接 / `sessionStorage` 降级」：
 * - Lynx for Web 宿主应在此文件注入其宿主桥接（**唯一替换点**，页面 / store 不受影响）；
 * - 本期未实现宿主工程，故按 `localStorage` → `sessionStorage` 顺序做**存在性检测 + 可用性探测**；
 * - 端口契约：**永不 throw**，失败返回空值 / 静默降级。
 *
 * 注意：本文件与 zustand `persist` 的**默认** `localStorage` 无关——store 走的是
 * `portableStorage` → `StoragePort`，这里的探测只为让端口在纯 Web 环境下也可用。
 */

interface WebStoreLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

interface WebStorageGlobal {
  localStorage?: WebStoreLike
  sessionStorage?: WebStoreLike
}

/** 探测键：仅用于确认存储可写（隐私模式 / 配额受限时会被捕获）。 */
const PROBE_KEY = '__nijapl_storage_probe__'

function readWebStorage(): WebStorageGlobal {
  return globalThis as unknown as WebStorageGlobal
}

/** 按优先级挑选可用的 Web 存储实现。 */
function pickWebStore(): WebStoreLike | null {
  const storage = readWebStorage()
  if (
    typeof storage.localStorage !== 'undefined' &&
    storage.localStorage !== null
  ) {
    return storage.localStorage
  }
  if (
    typeof storage.sessionStorage !== 'undefined' &&
    storage.sessionStorage !== null
  ) {
    return storage.sessionStorage
  }
  return null
}

/** Web 实现。 */
class WebStoragePort implements StoragePort {
  private readonly store: WebStoreLike

  constructor(store: WebStoreLike) {
    this.store = store
  }

  async get(key: string): Promise<string | null> {
    try {
      const value = this.store.getItem(key)
      return typeof value === 'string' ? value : null
    } catch {
      return null
    }
  }

  async set(key: string, value: string): Promise<void> {
    try {
      this.store.setItem(key, value)
    } catch {
      // 端口契约：永不 throw；写入失败静默降级。
      return
    }
  }

  async remove(key: string): Promise<void> {
    try {
      this.store.removeItem(key)
    } catch {
      // 端口契约：永不 throw；删除失败静默降级。
      return
    }
  }
}

/**
 * 创建 Web 存储端口。
 *
 * @returns 存在可用 Web 存储时返回实现；否则 `null`（由 facade 使用内存兜底）。
 */
export function createWebStorage(): StoragePort | null {
  const store = pickWebStore()
  if (store === null) {
    return null
  }
  try {
    // 可用性探测：部分环境（隐私模式 / 配额为 0）读写会抛错。
    store.setItem(PROBE_KEY, '1')
    store.removeItem(PROBE_KEY)
  } catch {
    return null
  }
  return new WebStoragePort(store)
}
