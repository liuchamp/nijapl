# TTSEngine · 原生 TTS 模块注册说明

> 对应端口实现：`src/engine/tts/tts.native.ts`
> 本仓库**只提供 JS 侧声明与调用约定**；原生实现（iOS / Android / Harmony）超出本仓库范围。
> 红线：仅 `src/engine/tts/tts.native.ts` 允许引用全局 `NativeModules`（见架构 §1.5 / §8.5）。

## 1. JS 侧调用契约

模块注册名必须是 **`TTSEngine`**，即 `NativeModules.TTSEngine`。
端口以**同步**方式调用下列方法（Lynx 原生模块为同步调用，业务 JS 运行在后台线程）：

```ts
// src/typing.d.ts（全局声明，勿另建类型）
interface NativeTtsEngine {
  /** 朗读文本；rate / pitch 归一化到 0.5~2.0 / 0~2.0。 */
  speak(text: string, rate: number, pitch: number): void
  /** 立即停止当前朗读。 */
  stop(): void
  /** 是否正在朗读。 */
  isSpeaking(): boolean
}
```

约定：
- 朗读文本恒取 `Word.kana`（架构 §4.2），不做训读 / 音读切换；
- 方法与端口一样**不应抛出**；若底层异常，请内部兜底并回调失败（避免跨线程异常）；
- 未注册该模块时，JS 侧 `createNativeTts()` 返回 `null` → facade 自动降级（Web → unsupported）。

## 2. iOS（`AVSpeechSynthesizer`）

推荐实现要点：

1. 新建 `TTSEngine.swift`（或 Objective-C++），持有 `AVSpeechSynthesizer` 单例。
2. 使用日语语音：`AVSpeechSynthesisVoice(language: "ja-JP")`。
3. 首次非手势上下文播放可能被系统拦截 → 返回失败，JS 侧提示「点击试听」。
4. 通过 Lynx Native Module 机制注册，模块名 `TTSEngine`，方法名与上表一一对应。

伪代码：

```swift
@objc(TTSEngine)
final class TTSEngine: NSObject {
  private let synth = AVSpeechSynthesizer()

  @objc func speak(_ text: String, rate: Double, pitch: Double) {
    let utterance = AVSpeechUtterance(string: text)
    utterance.voice = AVSpeechSynthesisVoice(language: "ja-JP")
    utterance.rate = Float(max(0.5, min(rate, 2.0)))
    utterance.pitchMultiplier = Float(max(0.0, min(pitch, 2.0)))
    synth.speak(utterance)
  }

  @objc func stop() { synth.stopSpeaking(at: .immediate) }

  @objc func isSpeaking() -> Bool { synth.isSpeaking }
}
```

方法查找（`methodLookup` / `@objc` 导出名）需与 `speak` / `stop` / `isSpeaking` **完全一致**。

## 3. Android（`TextToSpeech`）

1. 初始化 `TextToSpeech(context) { status -> ... }`，语言设为 `Locale.JAPANESE`。
2. 模块名 `TTSEngine`，方法 `speak(text, rate, pitch)` / `stop()` / `isSpeaking()`。
3. `setSpeechRate` / `setPitch` 的取值范围建议收敛到 0.5~2.0 / 0~2.0。

伪代码：

```kotlin
class TTSEngineModule : LynxModule() {
  private val tts = TextToSpeech(context) { status ->
    if (status == TextToSpeech.SUCCESS) tts.language = Locale.JAPANESE
  }

  fun speak(text: String, rate: Double, pitch: Double) {
    tts.setSpeechRate(rate.coerceIn(0.5, 2.0).toFloat())
    tts.setPitch(pitch.coerceIn(0.0, 2.0).toFloat())
    tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, null)
  }

  fun stop() { tts.stop() }
  fun isSpeaking(): Boolean = tts.isSpeaking
}
```

## 4. Harmony（ArkTS）

使用 `@ohos.multimedia.textToSpeech`，语言 `zh-CN` 不支持时回落到默认引擎；
模块名与方法名同上，异步结果需**同步返回**给 JS（必要时内部缓存状态）。

## 5. 验收自检

- [ ] `NativeModules.TTSEngine` 已注册（LynxExplorer 中 `getCapability()` 应为 `supported`）；
- [ ] `speak('ねこ', 1, 1)` 能出声；
- [ ] `stop()` 立刻静音；
- [ ] 未注册模块时应用**不崩**，UI 提示「当前环境不支持语音」。
