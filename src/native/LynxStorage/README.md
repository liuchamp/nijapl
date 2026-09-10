# LynxStorage · 原生键值存储模块注册说明

> 对应端口实现：`src/engine/storage/storage.native.ts`
> 本仓库**只提供 JS 侧声明与调用约定**；原生实现（iOS / Android / Harmony）超出本仓库范围。
> 红线：仅 `src/engine/storage/storage.native.ts` 允许引用全局 `NativeModules`（见架构 §1.5 / §8.5）。

## 1. JS 侧调用契约

模块注册名必须是 **`LynxStorage`**，即 `NativeModules.LynxStorage`。
端口以**同步**方式调用（业务 JS 运行在后台线程）；对上层暴露的是异步 `StoragePort`。

```ts
// src/typing.d.ts（全局声明，勿另建类型）
interface NativeStorage {
  /** 读取；不存在返回 null。 */
  get(key: string): string | null
  /** 写入。 */
  set(key: string, value: string): void
  /** 删除。 */
  remove(key: string): void
}
```

约定：
- 键值均为字符串；值超过平台上限（如 `NSUserDefaults` 建议 < 1MB）时请压缩或拒绝；
- 方法**不应抛出**；失败请返回 `null` / 静默；
- 未注册该模块时，JS 侧 `createNativeStorage()` 返回 `null` → facade 自动降级（Web → 内存兜底），应用不崩。

> store 通过 `src/store/persistence.ts` 的 `portableStorage` 适配器访问本端口，
> **不使用** zustand `persist` 默认的 `localStorage`。

## 2. 存储键（应用侧约定）

| 键 | 内容 |
|----|------|
| `nijapl.store` | 序列化后的持久化分片（`progress` / `session` / `settings`，含 `version`） |

## 3. iOS（`NSUserDefaults`）

```swift
@objc(LynxStorage)
final class LynxStorage: NSObject {
  private let defaults = UserDefaults.standard

  @objc func get(_ key: String) -> String? { defaults.string(forKey: key) }

  @objc func set(_ key: String, value: String) { defaults.set(value, forKey: key) }

  @objc func remove(_ key: String) { defaults.removeObject(forKey: key) }
}
```

- 模块名 `LynxStorage`，方法名 `get` / `set` / `remove` 需与方法查找配置**完全一致**；
- 大批量写入后可考虑 `defaults.synchronize()`（iOS 12+ 非必需）。

## 4. Android（`SharedPreferences`）

```kotlin
class LynxStorageModule : LynxModule() {
  private val prefs = context.getSharedPreferences("nijapl", Context.MODE_PRIVATE)

  fun get(key: String): String? = prefs.getString(key, null)
  fun set(key: String, value: String) { prefs.edit().putString(key, value).apply() }
  fun remove(key: String) { prefs.edit().remove(key).apply() }
}
```

- 大值建议改用 `DataStore` / 文件存储；键值需保持字符串语义。

## 5. Harmony（`Preferences`）

使用 `@ohos.data.preferences`：`getPreferences` → `getSync` / `putSync` / `deleteSync` + `flush`；
模块名与方法名同上。

## 6. 验收自检

- [ ] `NativeModules.LynxStorage` 已注册；
- [ ] `set('k','v')` → 重启应用后 `get('k')` 仍为 `'v'`（持久化生效）；
- [ ] `remove('k')` 后 `get('k')` 为 `null`；
- [ ] 未注册模块时应用**不崩**（落到内存兜底，仅本次运行有效）。
