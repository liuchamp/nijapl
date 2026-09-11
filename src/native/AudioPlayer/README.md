# AudioPlayer · 原生音频播放模块注册说明

> 对应端口实现：`src/engine/tts/player.native.ts`
> 本仓库**只提供 JS 侧声明与调用约定**；原生实现（iOS / Android / Harmony）超出本仓库范围。
> 本文件**不并入** `src/native/TTSEngine/README.md`（该文件只描述合成，职责单一）。
> 红线（架构 §1.5 / §8.5，修订 R1 后白名单 3 个）：仅 `src/engine/tts/tts.native.ts`、
> `src/engine/storage/storage.native.ts`、**`src/engine/tts/player.native.ts`** 允许引用全局 `NativeModules`。

## 1. JS 侧调用契约

模块注册名必须是 **`AudioPlayer`**，即 `NativeModules.AudioPlayer`。
端口以**同步**方式调用下列方法（Lynx 原生模块为同步调用，业务 JS 运行在后台线程）：

```ts
// src/typing.d.ts（全局声明，勿另建类型）
interface NativeAudioPlayer {
  /** 播放音频字节。base64 为音频内容（默认 mp3），mime 如 'audio/mpeg'。 */
  playBytes(base64: string, mime: string): void
  /** 播放远端音频（备用：由原生侧自行下载 / 边下边播）。 */
  playUrl(url: string): void
  /** 停止当前播放（幂等）。 */
  stopPlayback(): void
  /** 是否正在播放。 */
  isPlaying(): boolean
}
```

**方法字段级约定**：

| 方法 | 参数字段 | 语义 | 失败行为 |
|---|---|---|---|
| `playBytes(base64, mime)` | `base64`：**标准 base64，不含 `data:` 前缀**（直接取 JSON 接口 `audio` 字段）；`mime`：`'audio/mpeg'`（mp3 / mp3-hq）或 `'audio/webm'` | 播放内存音频字节；**内部先停上一次播放**再播新的（M4） | **不得抛异常**（跨线程异常会炸后台线程）；失败静默，JS 侧按 `play-error` 降级 |
| `playUrl(url)` | `url`：远端音频地址（http/https） | 原生侧自行下载并播放（**可选实现**，不影响主链路） | 同上 |
| `stopPlayback()` | — | 停止并释放当前播放；**幂等**，未播放时调用无副作用 | 同上 |
| `isPlaying()` | — | 返回当前是否正在播放 | 未播放返回 `false` |

**为什么用 base64 而不是 `ArrayBuffer`**：

1. Lynx Native Module 是**跨线程（JS 后台线程 ↔ 原生）同步调用**，参数需可序列化；
   `string` 是 iOS / Android / Harmony 三端桥**唯一稳定支持**的字节载体；
   `ArrayBuffer` 在部分桥实现中会被丢弃或转成 `null`（待实测 V-12）。
2. 与 JSON 接口（`POST /v1/tts/synthesize`）的 `audio` 字段**零转换**（默认传输路径就是 base64）。
3. 代价：+33% 体积 + base64 编解码开销 —— 在 10–60KB 量级完全可忽略。

约定：
- 方法与端口一样**不应抛出**；若底层异常，请内部兜底（避免跨线程异常）；
- 未注册该模块时，JS 侧 `createNativeAudioPlayer()` 返回 `null` → facade 自动降级到 Web 播放 / 实时合成；
- **`AudioPlayer` 未注册 ≠ `TTSEngine` 未注册**：二者独立判定，仅实现其一即可获得对应通道。

## 2. iOS（`AVAudioPlayer`）

推荐实现要点：

1. 新建 `AudioPlayer.swift`（或 Objective-C++），持有 `AVAudioPlayer`/`AVAudioEngine` 单例。
2. `playBytes`：`Data(base64Encoded:)` → `AVAudioPlayer(data:fileTypeHint: .mp3)`。
3. **先停后播**：`playBytes` 内先 `stopPlayback()` 再创建 / 播放新音频（M4）。
4. iOS 需配置 ATS 例外以允许明文 HTTP（生产建议 HTTPS，属原生工程事项）。

伪代码：

```swift
@objc(AudioPlayer)
final class AudioPlayer: NSObject {
  private var player: AVAudioPlayer?

  @objc func playBytes(_ base64: String, mime: String) {
    stopPlaying()
    guard let data = Data(base64Encoded: base64) else { return }
    let hint: AVFileType = mime.contains("webm") ? .wav : .mp3
    player = try? AVAudioPlayer(data: data, fileTypeHint: hint)
    player?.play()
  }

  @objc func playUrl(_ url: String) { /* 可选：下载后播放 */ }

  @objc func stopPlayback() { player?.stop(); player = nil }

  @objc func isPlaying() -> Bool { player?.isPlaying ?? false }
}
```

方法查找（`@objc` 导出名）需与 `playBytes` / `playUrl` / `stopPlayback` / `isPlaying` **完全一致**。

## 3. Android（`MediaPlayer` / `ExoPlayer`）

1. 使用 `MediaPlayer` + `ByteArrayDataSource`，或 `ExoPlayer`（自定义 `DataSource`）。
2. **先停后播**：`playBytes` 内先 `stopPlayback()`（M4）。
3. 与 `TTSEngine` 共用同一 `AudioManager` 音频焦点（避免策略差异）。
4. Android 9+ 默认禁明文 HTTP，需 `networkSecurityConfig`（生产建议 HTTPS）。

伪代码：

```kotlin
class AudioPlayerModule : LynxModule() {
  private var player: MediaPlayer? = null

  fun playBytes(base64: String, mime: String) {
    stopPlayback()
    val bytes = Base64.decode(base64, Base64.DEFAULT)
    val mp = MediaPlayer()
    mp.setDataSource(ByteArrayDataSource(bytes))
    mp.prepare()
    mp.start()
    player = mp
  }

  fun playUrl(url: String) { /* 可选 */ }

  fun stopPlayback() { player?.release(); player = null }

  fun isPlaying(): Boolean = player?.isPlaying ?: false
}
```

## 4. Harmony（ArkTS `AVPlayer`）

1. 使用 `@ohos.multimedia.media` 的 `AVPlayer`（`dataSrc` / `fdSrc`）。
2. 状态机回调（`stateChange`）中处理 `prepared` → `play`；`playBytes` 收到 base64 后先 `stopPlayback()`。
3. 方法与模块名同上，异步结果需**同步返回**给 JS（必要时内部缓存状态）。

## 5. 互斥约定

- **本模块内部先停后播**（M4）：连续 `playBytes` 不得叠音 —— 这是 `AudioPlayer` 模块的**自身**责任。
- **与 `TTSEngine` 的跨模块互斥由 JS 侧 M1–M3 编排保证**，原生侧**无需感知**对方存在：
  - M1：走 HTTP 播放前，facade 先 `TTSEngine.stop()`；
  - M2：走实时合成前，facade 先 `AudioPlayer.stopPlayback()`；
  - M3：`TtsPort.stop()` → `source.cancel()` + `AudioPlayer.stopPlayback()` + `TTSEngine.stop()` 三条全停。
- 因此 `AudioPlayer` 与 `TTSEngine` **各自独立注册、独立探测、互不交叉调用**。

## 6. 验收自检

- [ ] `NativeModules.AudioPlayer` 已注册（LynxExplorer 中 `player.getCapability()` 应为 `supported`）；
- [ ] `playBytes(<ねこ 的 mp3 base64>, 'audio/mpeg')` 能出声，音色为 `ja-JP-NanamiNeural`（由服务端保证）；
- [ ] 连续两次 `playBytes` 不叠音（M4：先停后播）；
- [ ] `stopPlayback()` 立刻静音；重复调用**不崩**（幂等）；
- [ ] `isPlaying()` 在播放中为 `true`、结束后为 `false`；
- [ ] **互斥验证**：`TTSEngine.speak()` 播放中调用 `AudioPlayer.playBytes()`（或反向），JS 侧编排后应只剩一个声音（M1 / M2）；
- [ ] 未注册模块时应用**不崩**，UI 走「提示 + 复制假名」。
