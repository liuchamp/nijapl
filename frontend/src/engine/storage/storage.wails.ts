import { KVStore } from '../../../bindings/nijapl/internal/services/index.js'
import type { StoragePort } from '../../types/ports.js'
import { hasWailsRuntime } from '../wails.js'

/**
 * Wails 存储端口（`StoragePort` 的 Go 侧适配器）。
 *
 * 替代原 Lynx 的 `NativeModules.LynxStorage`：数据落盘到
 * `os.UserConfigDir()/nijapl/store.json`（Go 侧防抖 + 原子写）。
 *
 * 契约保持与 `storage.web.ts` 一致：**永不 throw**，失败静默（上层有内存兜底）。
 */

class WailsStoragePort implements StoragePort {
  async get(key: string): Promise<string | null> {
    try {
      return await KVStore.Get(key)
    } catch {
      return null
    }
  }

  async set(key: string, value: string): Promise<void> {
    try {
      await KVStore.Set(key, value)
    } catch {
      // 端口永不 throw：写失败静默（内存态仍正确）
    }
  }

  async remove(key: string): Promise<void> {
    try {
      await KVStore.Remove(key)
    } catch {
      // 同上
    }
  }
}

/** 创建 Wails 存储端口；不在 Wails 宿主内时返回 `null`（交由 facade 继续降级）。 */
export function createWailsStorage(): StoragePort | null {
  if (!hasWailsRuntime()) {
    return null
  }
  return new WailsStoragePort()
}
