# AGENTS.md — frontend/src/engine

平台能力端口 + 纯引擎。**六边形架构的边界层**：全仓库只有这里可直接接触平台 API / Wails 绑定。

## OVERVIEW

- `engine/{tts,storage}/`：端口 facade（`index.ts`）+ 平台实现（`*.wails.ts` / `*.web.ts`）。
- `engine/*.ts`（根）：纯引擎，零框架 / 零 DOM（`srs` / `progress` / `jumpRules` / `conjugation` / `kana`）。
- `engine/graph/`：图谱布局 / SVG / 视图（纯函数）。
- `engine/platform/`：平台探测**单一真相源**（`detectPlatform()` / `isMobile()` / `isDesktop()` / `isIOS()` / `isAndroid()` / `getFormFactor()` / `hasWailsRuntime()`）。
  先读 `globalThis._wails.environment.OS`，缺失 / 非预期时回退 UA（Android 尤须保留 UA 兜底：宿主注入可能晚于模块加载）。页面 / store / service 一律经此判断，**禁止**散落 UA / `_wails` 判断。

## 端口契约（红线）

- 页面 / store / service **只** import `engine/tts/index.js`、`engine/storage/index.js`。
- facade 内部实现文件（`tts.web.ts`、`tts.mobile.ts`、`tts-client.wails.ts`、`tts-client.ts`、
  `tts-handler.ts`、`player*.ts`、`request.ts`、`audio-cache.ts`、`inflight.ts`、
  `storage.*.ts`、`types.ts`）**禁止**被外部 import。
- 端口**永不 throw**：失败返回判别结果 + 明确降级文案，调用方零静默。
- 仅 4 个文件允许 import `frontend/bindings/`：`engine/tts/tts-client.wails.ts`、
  `engine/tts/tts.mobile.ts`、`engine/storage/storage.wails.ts`，以及例外 `services/clipboard.ts`（见根 AGENTS.md）。

## TTS 链路（细则见 `tts/AGENTS.md` 与 `docs/design/TTS-集成方案.md` v3.0）

- 合成主路径在 Go（`internal/services/tts.go`）；前端三适配按环境选路
 （Android→`tts-handler.ts`，Wails 宿主→`tts-client.wails.ts`，否则 `tts-client.ts` 调试回退）。
- `player.ts` 只探测 **Web**（`player.native.ts` 已随迁移删除）；`player.web.ts` 用 DOM `<audio>` + Blob URL，
  `prime()` 必须在用户手势调用栈内同步执行、不得 await / 发网络请求。
- **M1–M3 互斥编排必须保留**（`player.native.ts` 已随迁移删除，无 M4/M5）：无脑先停；所有 `stop()` 幂等；
  **禁止**先查 `isPlaying` 再决定；`player*.ts` / `tts*.ts` **禁止**交叉调用对方 `stop()`（互斥责任在 facade）。
- 内存 LRU `audio-cache.ts`；并发去重 `inflight.ts`；参数映射 / `cacheKey` 在 `request.ts`。
- 编码坑（H13）：query 拼装用 `URLSearchParams`（缺失时等价自实现）；Go 侧拼 query 必须
  `url.Values.Encode()`，禁止 `fmt.Sprintf`；Android 转发丢 `+` 由 Go `repairPlusSign` 回补。
- `lang` 恒 `'ja-JP'`；朗读文本：词=`kana`、例句=`sentence.ja`。

## 存储链路

- `storage.wails.ts` → Go `KVStore.Get/Set/Remove`；`storage.web.ts` → `localStorage` →
  `sessionStorage` → 内存兜底，全程永不 throw。

## 测试

- `engine/__tests__/`：`srs` / `progress` / `jumpRules` / `layout` / `kana`。
- `engine/tts/__tests__/`：`request` / `resolve` / `audio-cache` / `tts-client` / `tts-handler` / `tts-mobile`。
- 真实 HTTP 集成在 `frontend/tests/qa/tts/`，服务不可达时自动跳过。

## 反模式

- 在页面 / store / service 里直接 `fetch` TTS 或读 `localStorage`。
- 把 `*.web.ts` / `*.wails.ts` 的实现细节泄漏到 facade 之外。
- 在互斥编排里「先判断再停」，或跨模块调 `stop()`。
