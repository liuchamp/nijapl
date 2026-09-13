# AGENTS.md — frontend/src/engine/tts

TTS 端口实现。选路：`index.ts`（Android→`tts-handler`，Wails 宿主→`tts-client.wails`，否则 `tts-client` 浏览器回退）。

## WHERE TO LOOK

- `index.ts`：三路编排 + M1–M3/M5 互斥（**M4 作废**：`player.native.ts` 已删）。
- `request.ts`：参数映射 / `cacheKey`（6 段 `\0` 连接）；`audio-cache.ts`：内存 LRU；
  `inflight.ts`：在途去重（迟到响应按代际丢弃）。
- `tts-client.wails.ts`：Go 绑定适配；`tts-handler.ts`：APK `/wails/tts` 转发；
  `tts-client.ts`：浏览器调试回退；`tts.web.ts`：speechSynthesis（ja 前缀过滤，`voiceschanged` 800ms 兜底）。
- `player.ts` / `player.web.ts`：DOM `<audio>` + Blob URL；`prime()` 必须在用户手势调用栈内**同步**执行（禁 await / 禁网络）。

## CONVENTIONS

- `lang` 恒 `'ja-JP'`；`volume` 恒 `'+0%'`；预取仅在 player 可用时进行。
- 端口**永不 throw**；失败返回判别结果，文案由 `services/ttsController.ts` 统一给出。
- H13 编码：query 拼装用 `URLSearchParams`（缺失时等价自实现）；Android 转发丢 `+` 由 Go `repairPlusSign` 回补。
- `stop()` 一律幂等、无脑先停；**禁止**先查 `isPlaying` 再决定；各通道**禁止**交叉调用对方 `stop()`（互斥责任只在 facade）。

## ANTI-PATTERNS

- 发明 M4 / `player.native`；在 `prime()` 里 await 或发请求。
- 跳过 ja 前缀过滤；业务代码直连 TTS 地址（只用 `constants/tts.ts` 的 `TTS_BASE_URL`）。
- Go 侧拼 query 用 `fmt.Sprintf`（必须 `url.Values.Encode()`）。

## 测试

- `__tests__/`：`request` / `resolve` / `audio-cache` / `tts-client` / `tts-handler` / `tts-mobile`。
- 真实 HTTP 集成在 `frontend/tests/qa/tts/`，服务不可达时自动跳过。细则见 `docs/design/TTS-集成方案.md` v3.0。
