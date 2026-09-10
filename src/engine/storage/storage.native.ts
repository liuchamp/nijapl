import type { StoragePort } from '../../types/ports.js'

/**
 * 原生存储实现（iOS `NSUserDefaults` / Android `SharedPreferences` / Harmony `Preferences`）。
 *
 * 红线（架构 §1.5 / §8.5）：
 * - **本文件是唯一允许引用全局 `NativeModules` 的存储文件**；
 * - 原生模块调用在后台线程（ReactLynx 业务 JS 默认后台线程），本文件不得出现 `'main thread'`；
 * - 端口契约：**永不 throw**，失败返回空值 / 静默降级。
 *
 * 未注册 `NativeModules.LynxStorage` 时 `createNativeStorage()` 返回 `null`（交由 facade 降级）。
 */

/** 读取已注册的原生存储；未注册 / 非 Lynx 环境返回 `undefined`（不抛错）。 */
function getNativeStorage(): NativeStorage | undefined {
  if (typeof NativeModules === 'undefined') {
    return undefined
  }
  return NativeModules.LynxStorage
}

/** 原生实现（对上层暴露异步契约，内部为同步原生调用）。 */
class NativeStoragePort implements StoragePort {
  private readonly native: NativeStorage

  constructor(native: NativeStorage) {
    this.native = native
  }

  async get(key: string): Promise<string | null> {
    try {
      const value = this.native.get(key)
      return typeof value === 'string' ? value : null
    } catch {
      return null
    }
  }

  async set(key: string, value: string): Promise<void> {
    try {
      this.native.set(key, value)
    } catch {
      // 端口契约：永不 throw；写入失败静默降级（内存态仍可继续）。
      return
    }
  }

  async remove(key: string): Promise<void> {
    try {
      this.native.remove(key)
    } catch {
      // 端口契约：永不 throw；删除失败静默降级。
      return
    }
  }
}

/**
 * 创建原生存储端口。
 *
 * @returns 已注册原生模块时返回实现；否则返回 `null`（表示不可用，由 facade 继续降级）。
 */
export function createNativeStorage(): StoragePort | null {
  const native = getNativeStorage()
  if (native === undefined) {
    return null
  }
  return new NativeStoragePort(native)
}
