# nijapl · Lynx → Wails v3 迁移架构调研（端口接缝 / 领域层 / 状态层 / 测试工程）

> 参考源：`/Users/champliu/WorkBuddy/Worktrees/nijapl/tts-ref`（分支 `feat/tts`，commit `74e1595`）——**只读调研，未修改其中任何文件**
> 目标栈：Wails v3（`github.com/wailsapp/wails/v3 v3.0.0-beta.20`，Go 1.25）+ WebView + React 18 + Vite
> 目标工程：`/Users/champliu/WorkBuddy/Worktrees/nijapl/master-a111e983`（当前为 Wails 脚手架：`main.go` / `greetservice.go` / `frontend/`）
> 姊妹文档：`docs/migration/spec-ui-core.md`（UI/UX 规格清单，本文档只讲架构与工程，不重复 UI 细节）
> 本文件为**只读调研产物**。

---

## 0. 一句话结论

Lynx 侧的**领域层（engine）+ 状态层（store）+ 数据层（repository）几乎可以整层搬**，因为它们被刻意做成「纯 TS、零框架、零端口依赖」；
真正需要重写的只有**端口/适配层**（`engine/tts/*`、`engine/storage/*`、`services/{clipboard,platform,pagerSeek}`），
而 Wails 提供了比 Lynx 更干净的替换面：把 3 个 `NativeModules` 换成 **4 个 Go service（KVStore / TTS / Audio / System）**，前端只需替换 facade 的内部实现，页面零感知。

迁移工作量分布（粗估）：

| 层 | 文件量级 | 动作 |
|---|---|---|
| 领域层 `src/engine/**`（不含 tts） | ~10 | **原样搬** |
| 数据层 `src/data/**` + `data/build/*.json` | ~7 | **原样搬** |
| 状态层 `src/store/**` | 5 | **原样搬 + 2 处必修缺陷** |
| 服务层 `src/services/**` | 10 | 搬 6 / 改 2 / 删 2 |
| 端口层 `src/engine/{tts,storage}/**` | 15 | **重写适配实现，契约保留** |
| 页面/组件 | ~40 | 按 `spec-ui-core.md` 逐页改写（本文档不覆盖） |
| 工程配置 | ~8 | 重写（Rspeedy → Vite；双 vitest 配置保留） |

---

# A · 端口与适配层接缝

## A.1 端口契约全清单（迁移时的「合同」）

| 端口 | 定义位置 | 方法 | 契约红线 |
|---|---|---|---|
| `TtsPort` | `src/types/ports.ts:46` | `getCapability()` / `speak(text, opts)` / `stop()` / `getVoices()` / `prime?()` / `prefetch?()` | **永不 throw**；失败走判别联合 `TtsResult` |
| `StoragePort` | `src/types/ports.ts:62` | `get(key)` / `set(key, value)` / `remove(key)`（全部 `Promise`） | **永不 throw**；只存**字符串**；建议 <1MB |
| `TtsSourcePort` | `src/types/tts.ts:457` | `synthesize(params, gen)` / `prefetch(params)` / `cancel()` | 纯逻辑 + 平台 `fetch`；不碰 `NativeModules`/DOM |
| `AudioPlayerPort` | `src/types/tts.ts:478` | `getCapability()` / `prime()` / `play(clip)` / `stop()` | **只播放，不合成**；永不 throw |

派生类型（迁移时必须一并搬）：

```ts
type TtsCapability      = 'supported' | 'unsupported' | 'gesture-required'
type TtsEngine          = 'http' | 'native' | 'web'            // 修订 R2：新增 'http'
type TtsFailureReason   = 'no-tts' | 'no-ja-voice' | 'blocked' | 'error'
                        | 'service-unavailable' | 'service-rejected' | 'no-player'
type TtsResult          = { ok: true; engine: TtsEngine } | { ok: false; reason: TtsFailureReason }

type TtsSourceFailure   = 'empty-text' | 'bad-request' | 'unavailable' | 'timeout' | 'network' | 'error'
type TtsSourceResult    = { ok: true; clip: TtsAudioClip }
                        | { ok: false; reason: TtsSourceFailure; status?: number; serviceReason?: string }
type AudioPlayResult    = { ok: true; channel: 'native' | 'web' }
                        | { ok: false; reason: 'no-player' | 'play-error' | 'blocked' }
```

## A.2 facade 模式（这套写法要原样保留）

`src/engine/storage/index.ts` 的 facade 是全项目最值得保留的模式，**四段式**：

```ts
function probe(factory: () => StoragePort | null): StoragePort | null {   // ① 探测异常吸收
  try { return factory() } catch { return null }
}
function detectStoragePort(): StoragePort {                                // ② 能力检测链
  const native = probe(createNativeStorage); if (native !== null) return native
  const web    = probe(createWebStorage);    if (web !== null) return web
  return new MemoryStoragePort()                                           // ③ 内存兜底（不崩）
}
export const storagePort: StoragePort = detectStoragePort()                 // ④ 模块级单例
```

`src/engine/tts/index.ts:233` 是同一模式的「编排加强版」：

```ts
export const ttsPort: TtsPort = new ResolvingTtsPort(
  createTtsHttpClient(),   // source：HTTP 合成
  createAudioPlayer(),     // player：native → web → null
  detectRealtimePort(),    // realtime：native → web → UnsupportedTtsPort
)
```

**迁移纪律**：页面 / store / service **只 import facade**（`engine/tts/index.js`、`engine/storage/index.js`），
`*.native.ts` / `*.web.ts` / `tts-client.ts` / `player*.ts` / `request.ts` 一律是**内部文件**，外部禁止 import。
Wails 下把 `.native.ts` / `.web.ts` 换成 `.wails.ts`（或直接改 facade 内部探测顺序），这条纪律不变。

## A.3 `NativeModules` 引用白名单（修订 R1：3 个点）

```
✅ src/engine/tts/tts.native.ts          （实时合成；只看 NativeModules.TTSEngine）
✅ src/engine/storage/storage.native.ts  （键值存储；只看 NativeModules.LynxStorage）
✅ src/engine/tts/player.native.ts       （字节播放；只看 NativeModules.AudioPlayer）
❌ 其它任何文件（含页面 / 服务 / store / 引擎其余部分）
```

- `src/typing.d.ts` 只有 `declare let NativeModules: NativeModulesShape`，属**声明不计入引用点**。
- **每个引用点只碰自己那一个模块** —— 这是「独立 `AudioPlayer` 而非扩展 `TTSEngine`」方案的直接收益：
  能力检测粒度与真实能力一一对应，杜绝「模块已注册 → 误判能力可用」。
- 迁移后这条白名单变成：**只有 `internal/ports/*.wails.ts` 允许 import Wails bindings**。

## A.4 接缝映射表（Lynx → Wails，逐点替换）

| # | Lynx 侧实现 | 文件 | Wails 侧替换 | 页面是否感知 |
|---|---|---|---|---|
| 1 | `NativeModules.LynxStorage` | `engine/storage/storage.native.ts` | **Go `KVStore` service**（`Get/Set/Remove`） | 否 |
| 2 | `localStorage` → `sessionStorage` 探测 | `engine/storage/storage.web.ts` | **保留**（Wails WebView 有完整 Web Storage） | 否 |
| 3 | `NativeModules.TTSEngine.speak` | `engine/tts/tts.native.ts` | **删除**（桌面无原生 TTS 模块）；或降级到 Go `TTS.RealtimeSpeak`（OS 级 TTS） | 否 |
| 4 | `speechSynthesis` | `engine/tts/tts.web.ts` | **保留**（Chromium/WebView2 可用），退居兜底 | 否 |
| 5 | `NativeModules.AudioPlayer.playBytes` | `engine/tts/player.native.ts` | **Go `Audio` service**（`PlayBytes/StopPlayback/IsPlaying`） | 否 |
| 6 | DOM `Audio` + Blob URL | `engine/tts/player.web.ts` | **保留**（推荐主通道） | 否 |
| 7 | 平台 `fetch` 打 `http://127.0.0.1:8000` | `engine/tts/tts-client.ts` | **改走 Go `TTS.Synthesize` 代理**（解决 `wails://` scheme 的 CORS / mixed-content） | 否 |
| 8 | `lynx.setClipboardData` → `navigator.clipboard` | `services/clipboard.ts` | **Go `System.CopyText`** 作为第三级兜底 | 否 |
| 9 | `SystemInfo.platform` 探测 / `viewpagerEnabled` | `services/platform.ts` | **删除**，Go `System.PlatformInfo()` 只在需要时提供 | 否 |
| 10 | `lynx.createSelectorQuery().invoke('selectTab'/'scrollTo')` | `services/pagerSeek.ts` | **删除**，改 `ref.scrollTo()` | 是（Study 页简化） |
| 11 | 构建期注入 `__TTS_BASE_URL__` | `lynx.config.ts` `source.define` | Vite `define` 或**直接读 Go `TTS.Config()`** | 否 |

**关键判断**：第 1/3/5/7/8 五处是真正的「新代码」；第 2/4/6 三处 Lynx 的 Web 实现在 Wails WebView 下**直接可用**；第 9/10 两处**整层删除**。

## A.5 `tts-client.ts` 的能力（搬过来即可，零改动）

| 能力 | 常量 / 策略 |
|---|---|
| 超时 | `TTS_TIMEOUT_MS = 8000`（服务端 deadline 20s / http timeout 30s → 客户端必须更早掐断） |
| 预取超时 | `TTS_PREFETCH_TIMEOUT_MS = 15000` |
| 重试 | `network` / `timeout` / `unavailable` 重试 **1 次**，退避 300ms；503 且带 `voice` 时**重试去 voice**；`bad-request` / `error` 不重试 |
| 并发去重 | `TtsInflight`（客户端 singleflight）：同 key 只发一次网络请求；**失败结果不缓存** |
| 内存缓存 | `TtsAudioCache` LRU 双限：`TTS_CACHE_MAX_ENTRIES = 64`、`TTS_CACHE_MAX_BYTES = 4MiB`；淘汰时 `URL.revokeObjectURL` |
| 迟到响应丢弃 | `generation token`：facade 每次 `speak()` 递增 `gen`；`synthesize(params, gen)` 回调比对，不匹配则丢弃且不出声 |
| 取消 | `AbortController`（可用即用）+ `generation token`（**必须实现**，不依赖 AbortController） |

缓存 key（**与服务端 `sha256(format\0voice\0rate\0volume\0pitch\0text)` 同序对齐**）：

```ts
export function cacheKey(p: TtsSynthesisParams): string {
  const text = p.text.length > 64
    ? `${p.text.length}#${p.text.slice(0, 24)}#${p.text.slice(-24)}`
    : p.text
  return [p.format, p.voice ?? '', p.rate, '+0%', p.pitch, text].join('\u0000')
}
```

> ⚠️ `cacheKey` 用**未编码**的参数串（值恒为 `'+0%'` / `'+0Hz'`）；URL 编码只发生在 `buildSpeechUrl` 的最外层，不污染 `SynthesisParams` 内部值。见 §F。

## A.6 参数映射（纯函数，必须原样搬 + 单测保留）

```ts
export function toRateParam(rate: number | undefined): string {
  const r = clamp(rate ?? 1, 0.5, 1.5)
  const pct = Math.round((r - 1) * 100)
  return `${pct >= 0 ? '+' : '-'}${Math.abs(pct)}%`
}
export function toPitchParam(pitch: number | undefined): string {
  const p = clamp(pitch ?? 1, 0.5, 1.5)
  const delta = Math.round((p - 1) * 100)
  return `${delta >= 0 ? '+' : '-'}${Math.abs(delta)}${TTS_PITCH_UNIT}`   // TTS_PITCH_UNIT = 'Hz'
}
```

| `StudySettings.rate` | 0.5 | 0.8 | 1.0 | 1.2 | 1.5 | 越界 | `undefined`/NaN |
|---|---|---|---|---|---|---|---|
| `rate` | `-50%` | `-20%` | `+0%` | `+20%` | `+50%` | clamp | `+0%` |

冻结契约（写进单测，迁移不得改）：

- `lang` **恒 `'ja-JP'`**，禁止省略（省略会落到服务端中文兜底音色 `zh-CN-XiaoxiaoNeural`）
- `voice` 恒 `'ja-JP-NanamiNeural'`（常量可配）
- `format` **全平台恒 `mp3`**（iOS `AVAudioPlayer` / Safari 不支持 WebM-Opus）
- 传输默认 `json`（`POST /v1/tts/synthesize`）；`stream`（`GET /v1/tts/speech`）为备选
- 空文本 **不发请求**，直接走降级
- 朗读依据红线：**词恒 `word.kana`，例句恒 `sentence.ja`**；语法点 `pattern` 不直接朗读

---

# B · 领域层与状态层

## B.1 领域层（纯 TS，零框架、零端口 —— 本次迁移最大资产）

| 文件 | 职责 | 迁移动作 |
|---|---|---|
| `src/types/domain.ts` | `Stage`/`Module`/`Word`/`Grammar`/`Sentence`/`SentenceWord`/`SentenceGrammar`/`WordRelation`/`GrammarRelation` | **原样搬** |
| `src/types/progress.ts` | `SrsState`/`Progress`/`ReviewRecord`/`Session`/`StudySettings`/`JumpContext`/`JumpDecision` | **原样搬** |
| `src/types/graph.ts` | `GraphNode`/`GraphEdge`/`GraphView`/`LayoutResult`/`LayoutConfig`/`GraphSourceData` | **原样搬** |
| `src/engine/srs.ts` | 五态状态机 + 间隔序列（10min/1d/3d/7d/15d/30d）；`initialProgress` / `applyPresented` / `applySelfEval` / `applyReviewResult` / `applySkip` / `isDue` / `dueTargetIds` | **原样搬** |
| `src/engine/jumpRules.ts` | J1–J6 判定，`evaluate(ctx, triggeredBy): JumpDecision[]` | **原样搬** |
| `src/engine/progress.ts` | `wordCompletion` / `moduleCompletion` / `stageCompletion` / `overallCompletion`；`hasContent=false` 短路为「不参与」（避免 0/0=NaN） | **原样搬** |
| `src/engine/conjugation.ts` | 动词变形表（一段/サ変/カ変/五段，含 `行く→いって`、`ある→ない` 两个例外） | **原样搬** |
| `src/engine/graph/layout.ts` | 纯计算力导向布局，**确定性**（同输入同输出） | **原样搬** |
| `src/engine/graph/view.ts` | 三视图（overview/word/grammar）构造 | 搬 + 可选预建 Map |
| `src/engine/graph/svg.ts` | 生成 SVG 边字符串 | **Lynx 专用方式**可换内联 JSX SVG（见 `spec-ui-core.md` §8） |

关键语义裁决（**迁移时必须保留，否则行为漂移**）：

| Ruling | 内容 |
|---|---|
| Ruling 1 | `seen` 的语义收敛为「**卡片展示过**」，**不再参与**首次遇词判定；J1 改用 `history.length === 0` |
| Ruling 2 | 「展示即转态」：`applyPresented` 把 `未学 → 学习中` 且置 `seen: true`（守卫 `if (p.state !== '未学') return p`，幂等） |
| Ruling 3 | `applySkip` 刻意**不写 `history`** → `学习中 → 未学`，不计分，也不消耗「首次评估」 |
| — | `wordCompletion` 在「未学」返回 0；`stageCompletion` 对 `hasContent === false` 返回「不参与」而非 NaN |
| — | `evaluate` 返回**数组**（一次自评可同时命中 J1 + J5 + J6） |

`SrsState` 五态：`'未学' | '学习中' | '模糊' | '已掌握' | '需强化'`
`SelfEval` 三档：`'不认识' | '模糊' | '认识'`

## B.2 数据层（来源零耦合）

- `data/build/{stages,modules,words,grammar,sentences}.json` 是**唯一运行时数据入口**
- `src/data/repository.ts`：`DataRepository` 加载 JSON 并建索引（byId / byModule / sentencesByWord / sentencesByGrammar…），**纯查询、无来源分支**
- `src/data/index.ts` 导出单例 `repository`
- 构建期管线 `scripts/gen-data/*`（zod schema + 引用完整性 + 枚举校验，退出码非 0 即失败）

**Wails 下三种可选放法**（推荐 ②）：

| 方案 | 做法 | 评价 |
|---|---|---|
| ① 打进 bundle | `import words from '../data/build/words.json'` | 与现状完全一致，零改动；数据变大时 bundle 变大 |
| ② `fetch('/data/*.json')` | 放 `frontend/public/data/`，由 Wails AssetServer 提供 | 首屏少一次解析阻塞；**推荐**（`wails://` 同源，无 CORS） |
| ③ Go 侧提供 | `Data.GetWords()` binding | 可行但没必要，纯静态数据不该走 IPC |

## B.3 状态层（zustand v4 vanilla + 自定义持久化）

```ts
export const appStore = createStore<AppState>()(
  persist(
    (set, get) => ({
      progress: {},
      session: createInitialSession(),
      settings: createInitialSettings(),
      runtime: createInitialRuntime(),
      ...createActions(set, get),
    }),
    createPersistOptions(),
  ),
)
```

四片（**`runtime` 不持久化**）：

| 分片 | 内容 | 持久化 |
|---|---|---|
| `progress` | `Record<string, Progress>` | ✅ |
| `session` | 断点续学 / 打卡 / 今日配额（`todayNewCount` / `todayReviewCount` / `todayGrammarCount` / `streakDays` / `lastWordIndex` / `lastStudyDate`） | ✅ |
| `settings` | `rate` / `pitch` / `autoSpeakOnCard` / `unlockRuleEnabled` | ✅ |
| `runtime` | `hydrated` / `currentModuleId` / `currentIndex` / `sessionWrongCount` / `detailSheet` / `lastDecisions` | ❌ |

**hydration 双保险**（必须保留，`src/store/index.ts:110-116`）：

```ts
const HYDRATION_WATCHDOG_MS = 2500
setTimeout(() => {
  if (!appStore.getState().runtime.hydrated) {
    appStore.getState().setHydrated(true)
  }
}, HYDRATION_WATCHDOG_MS)
```

写入纪律：
- **唯一写入口是 `src/store/actions.ts` 的 action**；action 内部调纯引擎算新值，页面只 dispatch，不自己算
- 派生查询全部在 `src/store/selectors.ts`（签名统一为 `(state: AppState, ...)`）
- React 绑定在 `src/store/hooks.ts`：`useAppStore(selector)` / `useHydrated` / `useProgressMap` / `useSession` / `useRuntime` / `useSettings`
- `hooks.ts` 自定红线：**selector 必须返回稳定引用或原始值**，不得在其中构造新对象/新数组

**Wails 下的两个必要改动**：

1. `portableStorage` 的 `StoragePort` 从 `NativeModules.LynxStorage` 换成 **Go `KVStore` binding**（异步，接口形状完全一致）。
2. **必修缺陷**：zustand 4.5.7 只在 `version` 不一致时调用 `migrate`，版本一致的真实 rehydrate 走不到净化 —— 净化必须加在 `merge`（详见 §D.4 / §I.2）。

## B.4 服务层（编排，非引擎）

| 文件 | 职责 | 迁移动作 |
|---|---|---|
| `services/studySession.ts` | 学习会话编排（页面 ↔ store 的薄层）：`beginStudy` / `presentCurrentCard` / `stepIndex` / `applySelfEvaluation` / `skipCurrentWord` / `evaluateSceneEffect` | **原样搬**（本次迁移成本最低的模块） |
| `services/jumpService.ts` | `toStudyEffect(decisions)` / `detailSheetModeFor(effect)`（J1 优先于 J2） | **原样搬** |
| `services/quiz.ts` | 出题，**确定性无随机**（同输入同输出） | **原样搬，禁止改成 shuffle** |
| `services/highlight.ts` | `buildSegments` / `buildSentenceHighlight` | **原样搬** |
| `services/grammarView.ts` / `graphNav.ts` | 语法视图 / 图谱导航 | **原样搬** |
| `services/ttsController.ts` | C1 单例控制器（`useSyncExternalStore`），状态快照 `speakingText/lastText/capability/notice/fallbackText/copyNotice` | **原样搬**（只依赖 `TtsPort`） |
| `services/ttsPrefetch.ts` | 预取编排（并发 ≤2、静默失败、播放器可用才预取） | **原样搬** |
| `services/clipboard.ts` | `copyText`：先 Lynx 后 Web | **改**（加 Go 兜底） |
| `services/platform.ts` | `SystemInfo.platform` 探测 + `viewpagerEnabled` 开关（**当前恒返回 `'scroll'`**） | **删** |
| `services/pagerSeek.ts` | `lynx.createSelectorQuery()` 程序化翻页 | **删** |
| `services/swipe.ts` | `classifySwipe` —— **当前是死代码**（仅单测引用） | **删**（连同单测） |

`ttsController.speak()` 的时序是**硬约束**（零静默失败红线）：

```
① 同步 patch：speakingText = text；lastText = text；notice = null；fallbackText = null
   （不 await → 保证「点击 ≤100ms 有反馈」）
①' 同步 ttsPort.prime?.()   ← 手势调用栈内解锁自动播放
② 启动保持计时器 holdMs = clamp(text.length * 150, 500, 1800)
③ 能力检测 capability = ttsPort.getCapability()
   'unsupported' → 清计时器 + speakingText:null + notice + fallbackText = text → 返回
④ await ttsPort.speak(text, {rate, pitch})
⑤ !ok → 清计时器 + notice = describeTtsFailure(reason) + fallbackText = text
```

三个手感常量必须复刻：`HOLD_MIN_MS = 500` / `HOLD_MAX_MS = 1800` / `HOLD_PER_CHAR_MS = 150`。

---

# C · 测试与工程配置

## C.1 双 vitest 配置（隔离审计，这套设计要保留）

```ts
// vitest.config.ts —— 主基线（npm test）
export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'src/engine/**/__tests__/**/*.test.ts',
      'src/services/__tests__/**/*.test.ts',
      'src/store/__tests__/**/*.test.ts',
      'scripts/gen-data/__tests__/**/*.test.ts',
      'tests/qa/**/*.test.ts',
    ],
  },
})

// vitest.audit.config.ts —— 审计专用，与 npm test 完全隔离
export default defineConfig({
  test: { environment: 'node', include: ['tests/audit/**/*.test.ts'] },
})
// 用法：npx vitest run --config vitest.audit.config.ts
```

设计意图（迁移时保持不变）：**取证测试不改 `src/`、不进主基线**，避免「为了复现评审指控而污染 `npm test`」。

## C.2 三层测试结构

| 层 | 位置 | 性质 |
|---|---|---|
| 单元测试 | `src/**/__tests__/*.test.ts` | 纯逻辑，Node 环境即可 |
| QA 验收测试 | `tests/qa/**/*.qa.test.ts` | 对齐 QA 判据（T01–T05） |
| 审计取证测试 | `tests/audit/**/*.audit.test.ts` | 复现评审指控；**当前 29 通过 / 6 失败**（失败全为真实源码缺陷） |

## C.3 测试用例统计（静态清点，32 个测试文件）

> 统计口径：对 `^\s*(it|test)\s*\(` 逐文件计数。参考源未安装 `node_modules`，未实跑；评审报告记录的**历史基线为 261/261**（TTS 与 store actions 测试为之后新增）。

| 分组 | 文件 | `it/test` 数 | `describe` 数 |
|---|---|---:|---:|
| 脚本 | `scripts/gen-data/__tests__/validate.test.ts` | 9 | 1 |
| 引擎 | `src/engine/__tests__/jumpRules.test.ts` | 29 | 9 |
| 引擎 | `src/engine/__tests__/layout.test.ts` | 5 | 2 |
| 引擎 | `src/engine/__tests__/progress.test.ts` | 11 | 4 |
| 引擎 | `src/engine/__tests__/srs.test.ts` | 17 | 7 |
| 引擎 TTS | `src/engine/tts/__tests__/audio-cache.test.ts` | 9 | 3 |
| 引擎 TTS | `src/engine/tts/__tests__/request.test.ts` | 22 | 6 |
| 引擎 TTS | `src/engine/tts/__tests__/resolve.test.ts` | 16 | 5 |
| 引擎 TTS | `src/engine/tts/__tests__/tts-client.test.ts` | 15 | 4 |
| 服务 | `src/services/__tests__/grammarView.test.ts` | 8 | 2 |
| 服务 | `src/services/__tests__/graphNav.test.ts` | 7 | 2 |
| 服务 | `src/services/__tests__/highlight.test.ts` | 11 | 2 |
| 服务 | `src/services/__tests__/jumpService.test.ts` | 9 | 2 |
| 服务 | `src/services/__tests__/pagerSeek.test.ts` | 6 | 1 |
| 服务 | `src/services/__tests__/platform.test.ts` | 3 | 1 |
| 服务 | `src/services/__tests__/quiz.test.ts` | 9 | 2 |
| 服务 | `src/services/__tests__/swipe.test.ts` | 6 | 1 |
| 状态 | `src/store/__tests__/actions.test.ts` | 9 | 3 |
| 状态 | `src/store/__tests__/selectors.test.ts` | 12 | 3 |
| QA | `tests/qa/data/data-integrity.qa.test.ts` | 27 | 7 |
| QA | `tests/qa/engine/conjugation.qa.test.ts` | 14 | 5 |
| QA | `tests/qa/engine/graph-view.qa.test.ts` | 6 | 2 |
| QA | `tests/qa/engine/jumpRules.qa.test.ts` | 29 | 8 |
| QA | `tests/qa/engine/layout.qa.test.ts` | 11 | 2 |
| QA | `tests/qa/engine/progress.qa.test.ts` | 13 | 4 |
| QA | `tests/qa/engine/srs.qa.test.ts` | 20 | 6 |
| QA | `tests/qa/tts/tts-adversarial.qa.test.ts` | 18 | 5 |
| QA | `tests/qa/tts/tts-http.integration.qa.test.ts` | 10 | 0 |
| 审计 | `tests/audit/p0-cross-day.audit.test.ts` | 9 | 3 |
| 审计 | `tests/audit/p0-persist-merge.audit.test.ts` | 6 | 2 |
| 审计 | `tests/audit/p0-persistence-dirty.audit.test.ts` | 10 | 3 |
| 审计 | `tests/audit/p0-today-new-count.audit.test.ts` | 10 | 3 |

**汇总**

| 口径 | 用例数 | 文件数 | `describe` 数 |
|---|---:|---:|---:|
| 主配置 `vitest.config.ts`（`npm test`） | **361** | 27 | 97 |
| 审计配置 `vitest.audit.config.ts` | **35** | 4 | 11 |
| **全仓合计（written cases）** | **396** | **31**（另 1 个 QA 文件无 `describe`） | **108** |

> 交叉验证：复核报告记「四轮共 **35** 个审计用例」，与上表 35 完全吻合；评审报告记「**261/261** 通过」为 TTS 测试落地**之前**的基线。

## C.4 工程配置迁移对照

| 项 | Lynx（tts-ref） | Wails（master-a111e983） | 说明 |
|---|---|---|---|
| 构建 | Rspeedy + `@lynx-js/react-rsbuild-plugin` | Vite 8 + `@vitejs/plugin-react` + `@wailsio/runtime/plugins/vite` | 目标工程已就绪 |
| 类型检查 | `tsc -b`（references: `./tsconfig.node.json` + `./src`） | `frontend` 用 `tsc && vite build` | 迁移后需重建 references |
| 测试 | vitest 3（双配置） | 需新增 vitest 3 + 双配置 | **原样搬两个 config** |
| 脚本运行 | `tsx scripts/gen-data/index.ts` | `tsx` 或 `node --experimental-strip-types`（Node 22.22 已支持） | 保留 `tsx` 更稳 |
| 数据校验 | `zod@^3.23.8` | 同 | 构建期使用，不进 bundle |
| 构建期注入 | `lynx.config.ts` `source.define.__TTS_BASE_URL__` | Vite `define`，或改由 Go `TTS.Config()` 下发 | 推荐后者（消除注入环节） |
| Lint/Format | biome 2.5.3 | 需新增 biome（或沿用） | 建议搬 `biome.json` |
| 包管理 | npm（`engines: ^20.19.0 \|\| >=22.12.0`） | npm（Node 22.22.2 实测可用） | 一致 |
| 任务编排 | 无（npm scripts） | Taskfile（`task dev/build/package/run`） | Wails 侧已有 |

**Wails 侧需要新增的测试环境变量**：

- `player.web.ts` 依赖 DOM `Audio` / `Blob` / `URL.createObjectURL` → 主配置保持 `environment: 'node'`（该文件**不进**测试 include）；若要测，单独加 `environment: 'jsdom'` 的项目（vitest `workspace` 或第二个 config）。
- `tts-client.ts` 的 `fetch` **必须保持可注入**（构造参数或模块级 setter），否则无法用 fake 覆盖 400/503/504/超时/网络失败分支。

## C.5 迁移后建议保留的 npm scripts

```json
{
  "dev": "vite",
  "build": "tsc && vite build --mode production",
  "test": "vitest run",
  "test:watch": "vitest",
  "test:audit": "vitest run --config vitest.audit.config.ts",
  "typecheck": "tsc -b",
  "gen:data": "tsx scripts/gen-data/index.ts"
}
```

---

# D · 四个文档提炼

## D.1 `docs/design/ARCH-系统设计.md`（v1.0，698 行）

| 维度 | 提炼 |
|---|---|
| 事实基线 | F1 `<svg content={str}>` 静态整渲无子节点事件 → 禁 mermaid；F2 无 `localStorage`/`<canvas>`/`<audio>`；F3 Native Modules 仅后台线程；F4 内置 `<list>`/`<viewpager>`/`<scroll-view>`；F5 路由须 `react-router@6` + `MemoryRouter`（ReactLynx 仅 React v17 API）；F6 `<viewpager>` Web 不支持；F7 网络只有 `fetch`/`EventSource`，无 WebSocket |
| 分层 | constants → types → engine → data → store → services → pages，**单向依赖** |
| 路由 | 5 Tab + 5 二级；TabBar 由 `pathname` 判定；统一 `useNavigation()` 语义方法，不用 `<Link>` |
| 状态 | zustand v4 vanilla + `persist` + 自建 `portableStorage`（`StateStorage` 适配器桥 `StoragePort`） |
| 图谱 | 静态 SVG 边 + 绝对定位 `<view>` 节点 + `transform: scale()`；布局纯计算确定性 |
| 任务 | T01 基础设施/数据地基 → T02 引擎+单测 → T03 端口+状态+路由外壳 → T04 学习主链路 → T05 语法/图谱/自测/设置 |
| 里程碑 | M1 数据地基 / M2 学习主链路 / M3 语法与图谱 / M4 打磨与验收 |
| 红线 | 端口永不 throw；引擎不 throw；用户可见失败必有文案；无 Tailwind/MUI；文件内 import 一律带 `.js` 后缀 |

**对迁移的直接约束**：F1/F3/F4/F6 在 Wails 下**全部消失**（标准浏览器环境），因此 `services/platform.ts` 的降级分支、`services/pagerSeek.ts` 整层、`GraphCanvas` 的 SVG 字符串技巧都可以简化；F5 的 `MemoryRouter` 建议**保留**（无地址栏，且避免 `wails://` scheme 下的路由问题）。

## D.2 `docs/design/TTS-集成方案.md`（v2.0，1505 行）

| 维度 | 提炼 |
|---|---|
| 一句话 | HTTP 拉 MP3 → 播放；失败依次降级 原生 TTS → `speechSynthesis` → 明确文案 + 复制假名 |
| 推翻 v1.1 | 构建期离线预生成（v1.1）→ 运行期按需 HTTP（v2.0）；v1.1 的 `scripts/gen-tts/**`、`data/build/audio*/**`、`src/types/audio.ts` **全部作废** |
| 事实基线 | **H1–H13**（见 §F 的 H13；H4 恒传 `lang=ja-JP`；H6 服务端 LRU 256 条 / key 语义；H7 非流式、deadline 20s；H10 语料词 3.0 字 / 句 14.4 字 → 音频 10–60KB） |
| 决策 | D1 只交付设计；D2 Web/H5 优先保证能出声；D3 原生端本期只定契约 |
| 仲裁 | 原生播放采用**独立 `NativeModules.AudioPlayer`**，不扩展 `TTSEngine`（4 条理由，核心是避免能力检测误判） |
| 补偿 | 由此产生的 **M1–M5 互斥编排**为强制约定（见 §G） |
| 修订 | R1 `NativeModules` 白名单 2→3；R2 `TtsResult` 加宽；R3 `ttsController` 2 行接线 |
| 任务 | T01 契约与基础设施 → T02 HTTP 合成源 → T03 播放通道 → T04 facade 编排 → T05 预取 + 实测结案 |
| 待实测 | V-1~V-15（V-15 服务端契约**已实测结案**；V-1/V-2/V-3/V-4/V-6 是 Lynx `fetch` 与 Worker DOM 能力） |

**对迁移的直接利好**：V-1~V-4、V-6 这些「Lynx `fetch` 能力未知」「Web Worker 里有没有 DOM `Audio`」的待实测项，在 Wails 下**全部变成确定答案**（完整浏览器环境，`fetch` / `AbortController` / `Blob` / `arrayBuffer()` / DOM `Audio` 全可用）→ `TTS_TRANSPORT` 可直接锁定 `'json'`，`player.web.ts` 从「降级预案」升为**主通道**。

## D.3 `docs/reviews/2026-09-11-代码评审报告.md`（269 行）

| 编号 | 结论 | 迁移时必须处理 |
|---|---|---|
| **P0-1** | `todayNewCount` 主链路恒不递增：`markPresented`（展示即转态）先把 `seen` 置 `true`，`submitSelfEval` 却用 `existing.seen` 判「新学」 | ✅ 必修（改判据为 `history.length === 0`） |
| P1-1 | 4 个（实为 **7 个**）页面 `useAppStore((snapshot) => snapshot)` 全量订阅 | ⚠️ 建议修（Web 端重渲染成本低，但仍违反自定红线） |
| P1-2 | 图谱关联词收集全量扫描（实为 O(n·r)，50 词级可忽略） | ❌ 可延后（P3 技术债） |
| P2-1 | `words[index]` 越界闪空 | ✅ 必修（迁移时 Study 页会重写，顺手做 `safeIndex` 收敛） |
| P2-3 | `resetAllProgress` 未重置 `settings` | ❌ 有意设计，不改 |
| P2-5 | `declare let NativeModules` + `typeof` 探测无 TDZ 风险 | ✅ 迁移后无需 `NativeModules`，该声明删除 |

评分：分层/端口/纯函数引擎/健壮性/测试质量 🟢 优；数据正确性 🔴 差（P0-1）；性能 🟡 中（P1-1）。

## D.4 `docs/reviews/2026-09-11-评审复核报告.md`（366 行）

| 编号 | 复核判定 | 要点 |
|---|---|---|
| P0-1 | ⚠️ 部分成立 | 缺陷真实；但「恒为 0」表述错 —— P2 主链路恒不递增，**P8 自测（Quiz 页直连 `submitSelfEval`）可 +1**（口径污染）。已裁决：**Quiz 自测计入今日新学** → 方案 A（`history.length === 0`）即目标口径 |
| P1-1 | ✅ 成立（被低估） | 实为 **7 处**：`Home:31` / `Study:43` / `Review:31` / `VocabDetail:30` / `GrammarDetail:35` / `Me:47` / `StageMap:25`。且修法**落地不了**（派生函数签名全是 `(state: AppState, ...)`，只传分片类型不过）→ 前置需重构 selectors 签名；定级建议降 P2 |
| P1-2 | ⚠️ 部分成立 | 复杂度实为 O(n·r)；数据量为 **50 词 / 16 语法 / 19 例句 / 10 模块 / 4 阶段**；被 memo 缓存 → 建议降 P3 |
| P2-1 | ⚠️ 被低估 | 不是偶发闪空，而是**每次冷启动续学必然错一帧**（`runtime` 不持久化 → `currentIndex: 0`，而 `startStudy` 从 `session.lastWordIndex` 恢复）；更隐蔽后果是**首帧「效果算给 A 词、置态标记给 B 词」**（J3/J4/J5/J6 错位）。可观测表现：进度显示 `31/8` |
| P2-4 | ❌ 不成立 | 语法计数当前**未失效**（实测 +1 正常），是**潜在同源缺陷**；建议 P1 预防性同改 |
| **A（新增）** | ✅ 既有缺陷 | `readProgress` **零净化**；脏 `history` 下自评直接抛 `TypeError`。**崩溃点不在判据而在判据之前**（`jumpRules.ts:28` / `srs.ts:28`），现状 `seen` 判据**同样崩**。**净化必须加在 `merge`** —— zustand 版本一致时不调 `migrate`，只补 `readProgress` **等于白补** |
| **B（新增）** | ✅ P0 | actions 层零测试覆盖（261 条测试里 `submitSelfEval` / `markPresented` 零命中）—— 这是 P0-1 能逃逸到评审阶段的根本原因 |
| **C（新增）** | P1 | P8 自测绕过五态机（跳过 `markPresented`，「学习中」态被绕过） |
| **E（新增）** | P3 | 死代码：`ensureProgress` / `markStudyDay` 无业务调用者 |
| **F（新增）** | P3 | 配额常量（`DAILY_NEW_GOAL=20`）与 seed 规模（50 词）不匹配 → 第 4 天起新词耗尽，属**数据假象非代码缺陷** |

`merge` 净化补丁（迁移时必须带上）：

```ts
migrate: (persisted: unknown) => migrateState(persisted),
// zustand 仅在 version 不一致时调用 migrate（zustand/esm/middleware.mjs:376-388），
// 版本一致的存储损坏路径不经过净化，故在 merge 内再净化一次。
merge: (persisted, current) =>
  persisted === undefined ? current : { ...current, ...migrateState(persisted) },
```

> `persisted === undefined` 守卫**不能省**：首次安装 / 空存储时 `merge(undefined, current)` 也会被调用一次。
> `readProgress` 内另补 `history: Array.isArray(value.history) ? value.history : []` —— **必须用 `Array.isArray`**，`history: 'oops'` 时 `.length === 4` 会静默认定为「已评估过」不 +1，**不抛错但结果错，比崩溃更难查**。

---

# E · 必须新增的 Go 侧实现

> 目标工程现状：`main.go` 已用 `application.New(application.Options{ Services: []application.Service{ application.NewService(&GreetService{}) } })` 注册服务；
> `frontend/vite.config.ts` 已挂 `wails("./bindings")` 插件 → Go struct 的导出方法会自动生成 TS binding。
> 下面 4 个 service 是 Lynx 侧 3 个 `NativeModules` + 1 个平台 `fetch` 的直接对位替换。

## E.0 总体接线

```go
// main.go（改）
app := application.New(application.Options{
    Name:        "nijapl",
    Description: "JLPT N3 词汇学习",
    Services: []application.Service{
        application.NewService(&GreetService{}),   // 脚手架，可删
        application.NewService(NewKVStore()),
        application.NewService(NewTTSService()),
        application.NewService(NewAudioService()),
        application.NewService(NewSystemService()),
    },
    Assets: application.AssetOptions{ Handler: application.AssetFileServerFS(assets) },
    Mac: application.MacOptions{ ApplicationShouldTerminateAfterLastWindowClosed: true },
})
```

**三条 Go 侧铁律**（与前端「端口永不 throw」对位）：

1. **导出方法永不 panic**：统一 `defer func(){ recover() }()` 或显式判错，返回 `(value, error)` / `(value, ok)` 形状。
2. **不阻塞 UI**：合成 / 网络 / 播放一律在 goroutine 内，binding 方法只返回结果；长任务返回 `error` 而非卡住 WebView。
3. **零硬编码地址**：TTS base URL / 音色 / 格式全部来自 `TTSConfig`，可由环境变量 `NIJAPL_TTS_BASE_URL` 覆盖。

## E.1 `KVStore` service —— 对位 `NativeModules.LynxStorage`

```go
// kvstore.go
package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sync"

	"github.com/adrg/xdg" // 已在 go.mod（wails 间接依赖）
)

// KVStore 是 StoragePort 的 Go 侧实现：字符串键值，进程外持久化。
type KVStore struct {
	mu     sync.RWMutex
	path   string
	values map[string]string
}

func NewKVStore() *KVStore {
	dir := filepath.Join(xdg.DataHome, "nijapl")
	_ = os.MkdirAll(dir, 0o755)
	k := &KVStore{path: filepath.Join(dir, "store.json"), values: map[string]string{}}
	_ = k.load() // 失败即从空表开始，永不 panic
	return k
}

// Get 返回 (value, ok)。ok=false 等价前端的 null。
func (k *KVStore) Get(key string) (string, bool) {
	k.mu.RLock(); defer k.mu.RUnlock()
	v, ok := k.values[key]
	return v, ok
}

// Set 写入并落盘（同步刷盘；数据量 <1MB，代价可忽略）。
func (k *KVStore) Set(key string, value string) error {
	k.mu.Lock(); defer k.mu.Unlock()
	k.values[key] = value
	return k.flush()
}

// Remove 删除键。
func (k *KVStore) Remove(key string) error {
	k.mu.Lock(); defer k.mu.Unlock()
	delete(k.values, key)
	return k.flush()
}

// ExportJSON / ImportJSON 对应 P9「数据导出/导入」——
// ⚠️ 这是新的用户 JSON 入口，因此 §D.4-A 的净化必须在 ImportJSON 内做一次：
//    progress[*].history 必须是 []（Array.isArray 的 Go 对应：json 解码后判 nil）
func (k *KVStore) ExportJSON() (string, error) { /* ... */ }
func (k *KVStore) ImportJSON(raw string) error { /* 净化后 merge，不整体覆盖 */ }

func (k *KVStore) load() error { /* os.ReadFile + json.Unmarshal 到 map[string]string */ }
func (k *KVStore) flush() error { /* 先写 .tmp 再 os.Rename，避免崩溃时半截文件 */ }
```

**对位关系**：`StoragePort.get/set/remove`（`Promise<string|null>` / `Promise<void>`）⇄ `Get/Set/Remove`。
前端 `portableStorage` 适配器一行替换即可：

```ts
export const portableStorage: StateStorage = {
  getItem: async (name) => { const [v, ok] = await KVStore.Get(name); return ok ? v : null },
  setItem: async (name, value) => { await KVStore.Set(name, value) },
  removeItem: async (name) => { await KVStore.Remove(name) },
}
```

**必须注意**：Wails binding 的 `Get` 返回 `(string, bool)`，前端拿到的是 tuple；不要让前端直接 `await KVStore.Get(k)` 当 `string` 用（会拿到 `undefined` 而非 `null`，破坏 `persist` 的 `?? null` 语义）。

## E.2 `TTS` service —— 对位 `tts-client.ts`（平台 `fetch` → 自建服务）

```go
// ttsservice.go
package main

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"time"
)

type TTSConfig struct {
	BaseURL string `json:"baseUrl"` // 默认 http://127.0.0.1:8000；env NIJAPL_TTS_BASE_URL
	Lang    string `json:"lang"`    // 恒 "ja-JP"
	Voice   string `json:"voice"`   // 恒 "ja-JP-NanamiNeural"
	Format  string `json:"format"`  // 恒 "mp3"
	Timeout int    `json:"timeout"` // 8000 ms
}

type SynthRequest struct {
	Text  string  `json:"text"`
	Lang  string  `json:"lang"`
	Voice *string `json:"voice,omitempty"`
	Rate  string  `json:"rate"`  // "+0%" / "-50%"  ← ★ 见 §F：JSON body 里原样写，不编码
	Pitch string  `json:"pitch"` // "+0Hz"
	Format string `json:"format"`
}

type SynthResponse struct {
	OK          bool   `json:"ok"`
	Base64      string `json:"base64,omitempty"` // 标准 base64，不含 data: 前缀
	Mime        string `json:"mime,omitempty"`   // audio/mpeg
	Voice       string `json:"voice,omitempty"`
	Cached      *bool  `json:"cached,omitempty"`
	Reason      string `json:"reason,omitempty"` // empty-text|bad-request|unavailable|timeout|network|error
	Status      int    `json:"status,omitempty"`
	ServiceCode string `json:"serviceCode,omitempty"` // TTS_INVALID_ARGUMENT 等
}

type TTSService struct {
	cfg    TTSConfig
	client *http.Client
	cache  *lruCache // 可选：Go 侧再缓存一层（进程内，64 条 / 4MiB）
}

func NewTTSService() *TTSService {
	base := os.Getenv("NIJAPL_TTS_BASE_URL")
	if base == "" { base = "http://127.0.0.1:8000" }
	return &TTSService{
		cfg:    TTSConfig{BaseURL: base, Lang: "ja-JP", Voice: "ja-JP-NanamiNeural", Format: "mp3", Timeout: 8000},
		client: &http.Client{Timeout: 8 * time.Second},
	}
}

// Config 让前端读取常量（替代 lynx.config 的 source.define 注入）。
func (t *TTSService) Config() TTSConfig { return t.cfg }

// Synthesize 是 TtsSourcePort.synthesize 的 Go 侧实现。
// ★ 必须实现：超时、1 次重试（503 去 voice）、错误映射、gen 由前端自行比对。
func (t *TTSService) Synthesize(req SynthRequest) (SynthResponse, error) {
	if req.Lang == "" { req.Lang = t.cfg.Lang } // 恒 ja-JP，禁止省略（H4）
	if req.Format == "" { req.Format = t.cfg.Format }
	if req.Text == "" {
		return SynthResponse{OK: false, Reason: "empty-text"}, nil // 不发请求
	}
	resp, err := t.post("/v1/tts/synthesize", req)
	if err != nil { return SynthResponse{OK: false, Reason: "network"}, nil }
	if resp.Status == 503 && req.Voice != nil {
		req.Voice = nil // 重试去 voice（服务端不校验音色 → 错音色 503）
		resp, _ = t.post("/v1/tts/synthesize", req)
	}
	return resp, nil
}

// Cancel 取消在途请求（对位 TtsSourcePort.cancel）。
func (t *TTSService) Cancel() error { /* 递增内部 gen + 关掉当前 request context */ }
```

**为什么必须走 Go 代理而不是前端直连**：见 §I.1（`wails://` scheme 的 CORS / mixed-content）。
**附带收益**：`X-TTS-Cache` / `X-TTS-Voice` 响应头在 Go 侧读取**不受 CORS 限制**（前端跨域时读不到，需网关补 `Access-Control-Expose-Headers`），可直接回填 `SynthResponse.Voice` / `Cached`。

错误映射表（前端 `mapSourceFailure` 的 Go 侧对位）：

| HTTP | service reason | Go `Reason` | 前端对外 `TtsFailureReason` |
|---|---|---|---|
| 400 | `TTS_INVALID_ARGUMENT` / `TTS_LANGUAGE_UNSUPPORTED` | `bad-request` | `service-rejected` |
| 503 | `TTS_UPSTREAM_UNAVAILABLE` | `unavailable` | `service-unavailable` |
| 504 | `TTS_UPSTREAM_TIMEOUT` | `timeout` | `service-unavailable` |
| — | fetch reject / DNS / 断网 | `network` | `service-unavailable` |
| 其它 | — | `error` | `error` |

## E.3 `Audio` service —— 对位 `NativeModules.AudioPlayer`

```go
// audioservice.go
package main

import (
	"encoding/base64"
	"sync"
)

// AudioService 是 AudioPlayerPort 的原生侧实现（独立模块，与 TTS 并列互不隶属）。
type AudioService struct {
	mu      sync.Mutex
	player  Player // 平台实现接口：darwin(AVAudioPlayer/NSSound) / windows(winmm或MediaPlayer) / linux(alsa/pulse)
	playing bool
}

func NewAudioService() *AudioService { return &AudioService{player: newPlatformPlayer()} }

// PlayBytes ★ 内部先停后播（M4）：连续调用不得叠音。
// base64 为标准 base64，不含 data: 前缀；mime 为 audio/mpeg。
func (a *AudioService) PlayBytes(b64 string, mime string) error {
	defer func() { _ = recover() }() // 永不 panic
	raw, err := base64.StdEncoding.DecodeString(b64)
	if err != nil { return err }
	a.mu.Lock(); defer a.mu.Unlock()
	_ = a.player.Stop() // ★ M4
	if err := a.player.Play(raw, mime); err != nil { return err }
	a.playing = true
	return nil
}

// StopPlayback 停止并释放；★ 幂等，未播放时无副作用（M1/M2/M3 依赖这一点）。
func (a *AudioService) StopPlayback() { /* ... */ }

// IsPlaying 是否正在播放。
func (a *AudioService) IsPlaying() bool { /* ... */ }
```

**⚠️ 决策点（需要你拍板）**：桌面端其实**可以不需要这个 service** —— `player.web.ts`（DOM `Audio` + Blob URL）在 Wails WebView 下完全可用，且已经承担了 `prime()` 解锁、缓存命中手势内同步播放、精确错误分类。

| 方案 | 适用条件 | 代价 |
|---|---|---|
| **A（推荐）只保留 DOM `Audio`** | 桌面 WebView（WebView2 / WKWebView / WebKitGTK） | 零 Go 代码；自动播放策略需 `prime()` 解锁（已实现） |
| B 同时实现 Go `AudioService` | 需要系统级音频焦点 / 后台播放 / 逃过 WebView 自动播放限制 | 需为三平台各写一套播放实现（`oto` / `malgo` / `winmm`） |

建议：**先按 A 落地**，`AudioService` 作为逃生舱留在设计里，若实测 WebView 自动播放解锁（V-7）不可靠再启用 B。无论选哪个，**M1–M5 互斥编排都必须在 JS 侧保留**（见 §G）。

## E.4 `System` service —— 对位 `clipboard.ts` + `platform.ts`

```go
// systemservice.go
package main

import "runtime"

type SystemService struct{}

func NewSystemService() *SystemService { return &SystemService{} }

// CopyText 剪贴板兜底（第三级）。返回 false 由前端给「手动复制」文案，绝不静默。
func (s *SystemService) CopyText(text string) bool { /* 平台剪贴板；失败返回 false */ }

// PlatformInfo 替代 Lynx 的 SystemInfo.platform。
type PlatformInfo struct {
	OS      string `json:"os"`      // darwin | windows | linux
	Arch    string `json:"arch"`
	Version string `json:"version"`
}
func (s *SystemService) PlatformInfo() PlatformInfo {
	return PlatformInfo{OS: runtime.GOOS, Arch: runtime.GOARCH, Version: "0.0.1"}
}

// DataDir 暴露持久化目录（P9 数据导出、排障用）。
func (s *SystemService) DataDir() string { return dataDirPath }

// OpenExternal 打开外部链接（P9 / 关于页可能需要）。
func (s *SystemService) OpenExternal(url string) error { /* 白名单校验后再开 */ }
```

## E.5 Go ↔ 前端接缝总表

| Lynx 侧 | Go service 方法 | 前端调用点（替换后） |
|---|---|---|
| `NativeModules.LynxStorage.get/set/remove` | `KVStore.Get/Set/Remove` | `engine/storage/storage.wails.ts` |
| 平台 `fetch` → `/v1/tts/synthesize` | `TTS.Synthesize(req)` | `engine/tts/tts-client.ts`（内部换成 binding 调用，`fetch` 注入点改为 fake binding） |
| —（新增） | `TTS.Config()` | `constants/tts.ts` 可改为启动时拉一次 |
| `NativeModules.AudioPlayer.playBytes/stopPlayback/isPlaying` | `Audio.PlayBytes/StopPlayback/IsPlaying` | `engine/tts/player.wails.ts` |
| `lynx.setClipboardData` | `System.CopyText` | `services/clipboard.ts` 第三级 |
| `SystemInfo.platform` | `System.PlatformInfo()` | `services/platform.ts`（建议直接删） |
| —（新增） | `System.DataDir` | P9 我的页 |
| —（新增） | `KVStore.ExportJSON/ImportJSON` | P9 数据导出 / 导入（**新增用户 JSON 入口 → 必须做净化**） |

---

# F · H13 编码坑（query 参数编码）

> 出处：`docs/design/TTS-集成方案.md` §2.2 事实基线 **H13**（服务端契约已由主理人于 2026-09-12 在 `127.0.0.1:8000` 真实实测结案）。

## F.1 坑本体

`rate` / `pitch` / `volume` 三个参数的取值含 **`+`** 与 **`%`**：

- `+` 在 URL query 中会被解码为**空格** → 服务端拿到 `" 0%"`
- `%` 若不转义为 `%25` 属**非法转义**

二者都会让服务端正则 `^[+-]\d+%$`（rate/volume）与 `^[+-]\d+(Hz|%)$`（pitch）**匹配失败 → 400 `TTS_INVALID_ARGUMENT`**。

**JSON POST 路径无此问题**（参数在 body 里，不参与 query 解码）。

## F.2 实测证据（2026-09-12）

| 请求 | 结果 |
|---|---|
| `?rate=+0%`（未编码） | **400** |
| `?rate=-50%`（未编码） | **400** |
| `?rate=%2B0%25` | **200**，9348 字节（与基准一致，常态语速） |
| `?rate=-50%25` | **200**，**18228 字节**（明显更长 → 证明 `rate` 真实生效） |
| `?pitch=-50Hz`（连字符安全，未编码） | 200 |
| JSON body `{"rate":"+0%"}` | 200（**原样写，不编码**） |

## F.3 实现纪律（迁移时必须带的三行断言）

```ts
// src/engine/tts/request.ts（纯函数，可单测）
export function buildSpeechUrl(base: string, p: SynthesisParams): string {
  // ✅ 唯一正确写法：URLSearchParams 自动编码（+ → %2B、% → %25）
  const q = new URLSearchParams()
  q.set('text', p.text)
  q.set('lang', p.lang)
  if (p.voice) q.set('voice', p.voice)
  q.set('rate', p.rate)     // 值为 '+0%'，编码后 → '%2B0%25'
  q.set('pitch', p.pitch)   // 值为 '+0Hz'，编码后 → '%2B0Hz'
  q.set('format', p.format)
  return `${base}/v1/tts/speech?${q.toString()}`

  // ❌ 禁止：模板串拼接 —— rate='+0%' 原样进 URL → 服务端解成 " 0%" → 400
}
```

```ts
// src/engine/tts/__tests__/request.test.ts（现有 22 条用例中已含这组断言）
expect(toRateParam(1.0)).toBe('+0%')                    // ① 语义层：值本身带 '+'
const url = buildSpeechUrl('http://x', buildSynthesisParams('ねこ', { rate: 1.0, pitch: 1.0 }))
expect(url).toContain('rate=%2B0%25')                   // ② 编码层
expect(url).toContain('pitch=%2B0Hz')
expect(url).not.toMatch(/[?&]rate=[^&]*\+/)             // ③ 最终 query 中不得出现裸 '+'
expect(url).not.toMatch(/%[^0-9A-Fa-f]/)                // ④ 不得有非法 '%' 转义
```

## F.4 三条易错引申

1. **`URLSearchParams` 会把空格编码为 `+`** —— 本项目 `text` 已 `trim` 且 `rate`/`pitch`/`volume` 不含空格，故安全；但如果未来允许 text 含空格且走 GET，**要反过来担心 `+` 的双重含义**。
2. **`cacheKey()` 用未编码的参数串**（值恒 `'+0%'`），与服务端 `sha256(format\0voice\0rate\0volume\0pitch\0text)` 语义对齐 —— **编码只发生在 URL 组装的最外层，不污染 `SynthesisParams` 内部值**。混淆这两者会导致缓存命中率归零。
3. **迁移到 Go 侧后这个坑不会自动消失**：若 `TTSService.Synthesize` 内部改用 GET 裸流路径（`transport='stream'`），Go 侧同样要用 `url.Values{}.Encode()`，禁止 `fmt.Sprintf` 拼 query。
   **推荐做法**：Go 侧只实现 JSON POST 路径，`stream` 作为可选分支——从根源上规避 H13。

---

# G · M1–M5 互斥编排（双通道强制约定）

> 出处：`TTS-集成方案.md` §4.5.2（设计侧详述）+ §12.7（跨文件约定摘要），两处为同一份要求。
> 背景：采纳「独立 `AudioPlayer` 模块」后，`TTSEngine`（实时合成）与 `AudioPlayer`（字节播放）是**两个独立模块、两套音频会话**，「单一模块天然互斥」不复存在 → 必须显式编排。

| # | 触发点 | 必须执行的动作 | 落点 |
|---|---|---|---|
| **M1** | 走 **HTTP 播放**（`player.play(clip)`）**之前** | **先停实时合成通道**：`realtime.stop()`<br>原生 = `NativeModules.TTSEngine.stop()`；Web = `speechSynthesis.cancel()` | `ResolvingTtsPort.speak()` 第②步之前 |
| **M2** | 走 **实时合成**（`realtime.speak(text, opts)`）**之前** | **先停播放通道**：`player.stop()`<br>原生 = `NativeModules.AudioPlayer.stopPlayback()`；Web = `el.pause(); el.currentTime = 0` | `ResolvingTtsPort.speak()` 第③步之前 |
| **M3** | `TtsPort.stop()`（切卡 / 卸载 / 主动停止） | **三条通道全停**：`source.cancel()` + `player.stop()` + `realtime.stop()` —— **少一条即可能留残声** | `ResolvingTtsPort.stop()` |
| **M4** | 同一播放器实例内连续 `playBytes` | 播放器**内部先停后播**（原生侧责任；不得叠音） | `src/native/AudioPlayer/README.md` → 迁移后为 `AudioService.PlayBytes` |
| **M5** | Web 端 `speechSynthesis` 与 DOM `<audio>` 重叠 | 同 M1 / M2，由 facade 统一执行（共用浏览器音频输出，重叠即叠音）；**`tts.web.ts` 本身不改** | `ResolvingTtsPort` |

```ts
// src/engine/tts/index.ts:138-188 —— 已落地实现（迁移时原样搬）
async speak(text, opts) {
  const gen = ++this.gen
  this.lastHttpFailure = undefined
  this.realtime.stop()                                  // ★ M1
  const player = this.player
  if (player !== null && player.getCapability() === 'supported') {
    const params = this.buildParams(text, opts)
    const result = await this.source.synthesize(params, gen)
    if (gen !== this.gen) return { ok: true, engine: 'http' }   // 迟到响应丢弃
    if (result.ok) {
      const played = await player.play(result.clip)
      if (played.ok) return { ok: true, engine: 'http' }
      this.lastHttpFailure = played.reason === 'blocked' ? 'blocked' : 'no-player'
    } else if (result.reason !== 'empty-text') {
      this.lastHttpFailure = mapSourceFailure(result.reason)
    }
  } else {
    this.lastHttpFailure = 'no-player'                  // 播放器不可用 → 跳过 HTTP，不浪费网络
  }
  this.player?.stop()                                   // ★ M2
  // ...realtime.speak 降级
}

stop(): void {                                          // ★ M3
  this.source.cancel(); this.player?.stop(); this.realtime.stop()
}
```

**四条实现纪律**：

1. **无脑先停**：所有 `stop()` 均**幂等**（未注册无副作用、未播放无副作用）→ **直接调用**，不要先查 `isPlaying()` / `isSpeaking()` 再决定（多一次跨线程往返 / IPC）。
2. **互斥责任在 facade**：`player.native.ts` / `tts.native.ts` / `player.web.ts` / `tts.web.ts` **都不感知对方存在**，禁止在这些文件里交叉调用对方的 `stop()`。
3. **单测必覆盖**：`resolve.test.ts` 用 fake `player` + fake `realtime` **断言调用顺序与次数**（现有 16 条用例已含 M1/M2/M3 三条断言），纳入完成判据。
4. **永不 throw**：`stop()` 内部 try/catch。

**迁移后是否还需要？—— 需要，一条都不能省**：

| # | Wails 桌面端 | 结论 |
|---|---|---|
| M1 | HTTP 播放前先 `speechSynthesis.cancel()` | ✅ **必须保留**（否则系统语音与 `<audio>` 叠音） |
| M2 | 实时合成前先 `el.pause(); el.currentTime = 0` | ✅ **必须保留** |
| M3 | `stop()` 三条全停 | ✅ **必须保留** |
| M4 | 播放器内部先停后播 | ✅ 保留（DOM `Audio` 单例天然满足；若启用 Go `AudioService` 则必须显式实现） |
| M5 | Web 端双通道 | ✅ **主场景**（桌面端只有 Web 通道，`speechSynthesis` + `<audio>` 是最常见的叠音组合） |

唯一可简化的是：桌面端**没有** `NativeModules.TTSEngine`，因此 `realtime` 只剩 `tts.web.ts`（`speechSynthesis`）与 `UnsupportedTtsPort` 两种；`native` 分支的 `stop()` 调用点可删，但 M1–M3 的**编排结构不变**。

---

# H · 可复用清单

## H.1 原样搬（零改动或仅改 import 后缀）

| 文件 / 目录 | 行数级 | 说明 |
|---|---|---|
| `src/types/{domain,progress,graph}.ts` | — | 领域/进度/图谱类型，零框架依赖 |
| `src/engine/srs.ts` | — | 五态状态机 + 间隔序列，纯函数 |
| `src/engine/jumpRules.ts` | — | J1–J6 + Ruling 1/2/3 |
| `src/engine/progress.ts` | — | 三级完成度 + `hasContent` 短路 |
| `src/engine/conjugation.ts` | — | 动词变形（含两个例外） |
| `src/engine/graph/{layout,view,svg}.ts` | — | 确定性布局（svg.ts 可换 JSX） |
| `src/engine/tts/request.ts` | — | 参数映射 + URL/body 构造 + `cacheKey` |
| `src/engine/tts/audio-cache.ts` | 155 | 内存 LRU 双限 + `revokeObjectURL` |
| `src/engine/tts/inflight.ts` | 54 | 客户端 singleflight |
| `src/data/repository.ts` + `src/data/index.ts` | — | 索引 + 单例 |
| `src/store/{index,actions,selectors,hooks}.ts` | — | 状态层（**actions 需带 2 处必修缺陷**） |
| `src/services/{studySession,jumpService,quiz,highlight,grammarView,graphNav,ttsController,ttsPrefetch}.ts` | — | 服务层 8 个 |
| `src/constants/{pos,srs,jumpRules,routes,strings,theme}.ts` | — | 常量（theme.ts 可换纯 CSS 变量） |
| `data/build/*.json` + `scripts/gen-data/**` | — | 数据管线 + zod 校验 |
| 全部 `*/__tests__/*.test.ts`（除 `pagerSeek` / `platform` / `swipe`） | — | 测试资产，最有价值的复用物 |
| 双 vitest 配置 + 三层测试结构 | — | `vitest.config.ts` / `vitest.audit.config.ts` |

## H.2 小改（替换内部实现，契约不变）

| 文件 | 改动 |
|---|---|
| `src/engine/storage/index.ts` | 探测链改为 `KVStore(binding)` → `WebStorage` → `MemoryStoragePort` |
| `src/engine/tts/index.ts` | facade 组装改为 `ResolvingTtsPort(TTSService, player, detectRealtimePort())`；**M1–M3 原样保留** |
| `src/engine/tts/tts-client.ts` | 内部 `fetch` → Wails binding 调用；超时/重试/去重/缓存/gen 逻辑**全部保留** |
| `src/engine/tts/player.ts` | 探测链 `native(Go Audio)` → `web(DOM Audio)` → `null` |
| `src/engine/tts/player.web.ts` | 基本原样（从「降级预案」升为主通道） |
| `src/services/clipboard.ts` | 加第三级 `System.CopyText` |
| `src/constants/tts.ts` | `TTS_BASE_URL` 改为启动时从 `TTS.Config()` 拉取（或保留 Vite `define`） |
| `src/store/persistence.ts` | **必修**：净化加在 `merge` + `readProgress` 补 `Array.isArray` |
| `src/store/actions.ts` | **必修**：`todayNewCount` 判据 `existing.seen` → `(existing.history?.length ?? 0) === 0` |
| `src/typing.d.ts` | 删除 `NativeModules` 声明（或改为 Wails bindings 类型补全） |

## H.3 重写 / 删除

| 文件 | 动作 | 理由 |
|---|---|---|
| `src/engine/tts/tts.native.ts` | **删** | 桌面无 `NativeModules.TTSEngine`；`realtime` 只剩 Web 通道 |
| `src/engine/tts/player.native.ts` | **删或换** | 见 §E.3 决策点（推荐只保留 DOM `Audio`） |
| `src/engine/storage/storage.native.ts` | **换** | → `storage.wails.ts`（Go `KVStore`） |
| `src/engine/storage/storage.web.ts` | **保留** | Wails WebView 有完整 Web Storage |
| `src/services/platform.ts` | **删** | `SystemInfo` / `viewpagerEnabled` 均不存在；`slideMode` 恒 `'scroll'` |
| `src/services/pagerSeek.ts` | **删** | `createSelectorQuery` 不存在；改 `ref.scrollTo()` |
| `src/services/swipe.ts` | **删**（连同 `swipe.test.ts`） | 当前已是死代码，且会与 CSS scroll-snap 冲突 |
| `src/native/{TTSEngine,AudioPlayer,LynxStorage}/README.md` | **删** | 原生模块概念消失；Go service 契约另写 |
| `src/router/*` | **改** | `MemoryRouter` 建议保留；`@lynx-js/react` → `react` |
| 全部 `.css` + 页面/组件 | **重写** | 见 `docs/migration/spec-ui-core.md` |

## H.4 「原实现即如此」的细节清单（复刻时勿顺手修好）

1. `Home` 主按钮 `newRatio` **未夹取**（>1 由 `ProgressRing.clamp01` 收敛）
2. `Home` 阶段百分比 `completion < 0` 显示 `0%`；`hasContent === false` 显示 `冲刺期`
3. `Study` 的 `safeIndex` 夹取（NaN → 0）
4. `Quiz` 切题型后 `resetRound`，但 `questions` 是 `useMemo([words, mode])` → 同模式重测题目不变
5. `Quiz` 选项点击后**不可改答**（`picked !== null` 早 return）
6. `Quiz` 的 `--correct` 会高亮**正确答案**（即使未点中）
7. `Quiz` 出题**确定性无随机**，干扰项位置可预测（禁止改 shuffle）
8. `Review` 的开始复习按钮是**纯视觉禁用**（`opacity: 0.5`），点击仍绑定但内部短路
9. `TtsButton` 的 `ghost` variant 背景 `rgba(91,140,255,0.10)` **硬编码无 token**
10. `TtsButton` / `ProgressRing` / `NodeStateBadge` **无 CSS 文件**，样式全在内联 style
11. `WordCard` 的 `nodeState` prop 在 Study 页**从不传** → 徽章恒不显示（渲染 1rpx spacer）
12. `DetailSheet` 的 `settings` prop **未被组件使用**
13. `ttsController.stop()` 已实现但 UI 无入口
14. `ttsPrefetch` 是**唯一例外**的静默失败（纯优化，不写 notice、不走降级链、无文案）
15. 语法自评 `submitGrammarSelfEval` **不更新 `runtime`**（不参与 J2 会话错题计数）
16. `resetAllProgress` 不重置 `settings`（有意设计）
17. `ensureProgress` / `markStudyDay` 是无调用者的死代码
18. 数据规模假象：50 词 / 16 语法点 vs `DAILY_NEW_GOAL=20` → 第 4 天起「新学」耗尽（非代码缺陷）

---

# I · 三个坑

## I.1 坑一 · `wails://` scheme 下的网络与剪贴板（最高优先级）

**现象**：Wails v3 的 AssetServer 走自定义 scheme（`wails://`）。前端 `fetch('http://127.0.0.1:8000/v1/tts/synthesize')` 会遇到：

- **Mixed content**：`wails://` 被视为安全上下文，向 `http://` 发请求可能被拦截
- **CORS**：非同源，服务端未回 `Access-Control-Allow-Origin` 时预检失败；`X-TTS-Cache` / `X-TTS-Voice` 还需 `Access-Control-Expose-Headers`
- `Cache-Control: private, max-age=86400` 的浏览器缓存收益在此路径下也拿不到

**连带**：`navigator.clipboard.writeText` 在自定义 scheme 下**可能不可用**（非安全上下文 / 权限），而 `lynx.setClipboardData` 已不存在 —— 两级都会失败 → 触发「零静默失败」红线的破窗。

**规避**：

1. TTS 请求**改走 Go `TTSService.Synthesize`**（§E.2），前端 `tts-client.ts` 的注入点从 `fetch` 换成 binding —— UI 层零改动，`H13` 也可顺带规避（只实现 JSON POST）。
2. 剪贴板加第三级 `System.CopyText`（§E.4），三级全失败时前端已给「当前环境无剪贴板权限，假名如下，请手动复制」+ `fallbackText`，保持零静默。
3. 数据 JSON 放 `frontend/public/data/` 走 AssetServer（同源），或打进 bundle。

## I.2 坑二 · 持久化迁移 + zustand `merge` 不净化（脏数据必崩）

**现象链**：

1. Lynx 侧 `readProgress` **零净化**（只 `isRecord` 就直转），而 `readSession` / `readSettings` 有逐字段净化 —— 但 zustand **4.5.7 只在 `version` 不一致时调用 `migrate`**，真实 rehydrate（版本一致）走 `return deserializedStorageValue.state` 直返 → **三个分片的净化一次都不执行**。
2. 脏 `history`（`undefined` 或 `'oops'`）进 store 后，**崩溃点不在判据而在判据之前**：
   - `submitSelfEval('不认识')` → `jumpRules.ts:28` `isFirstEncounter` → `TypeError: reading 'length'`
   - `submitSelfEval('认识'/'模糊')` → `srs.ts:28` `pushRecord` 的 `[...history]` → `history is not iterable`
   - `submitGrammarSelfEval` / `submitReviewResult` → 同样崩
   - `skipWord` 不崩（`applySkip` 只做 `history: p.history`）
   - **现状用 `seen` 判据时同样崩** → 这是既有缺陷，不是修 P0-1 引入的回归
3. `history: 'oops'` 时 `'oops'.length === 4` → **不抛错但静默判定为「已评估过」不 +1**，比崩溃更难查。

**迁移时的额外风险**：Lynx `LynxStorage` → Go `KVStore` 是**换介质**迁移，且 `KVStore.ImportJSON` 是**新增的用户 JSON 入口**（Lynx 侧 `Me` 页只有导出无导入，`Me/index.tsx:143-146`）→ 脏数据可达性从「版本迁移/存储损坏」升级为「用户随手导入」。

**规避**：

- `merge` 内净化（补丁见 §D.4），`persisted === undefined` 守卫不能省
- `readProgress` 内 `history: Array.isArray(value.history) ? value.history : []`（**必须 `Array.isArray`，不能只判真值**）
- 判据处零成本双保险 `(existing.history?.length ?? 0) === 0`，**禁止**用 `existing.history!.length` 绕类型
- `KVStore.ImportJSON` 在 Go 侧做一次等价净化（json 解码后 `history == nil` → `[]`）
- 迁移后**补 actions 层单测**（当前 9 条，相对 405 行写操作仍不足）：`markPresented → submitSelfEval` 后 `todayNewCount === 1`；二次自评不递增；跨天新词仍 +1；脏 `history` 不抛错且 SRS 正常推进

## I.3 坑三 · Lynx 专有机制删除后的行为漂移（状态机与时序）

三个「删掉就变」的点：

1. **冷启动续学必然错一帧**（P2-1，被评审低估）：
   `runtime` **不持久化**（`persistence.ts:127-134` 只存 progress/session/settings）→ `createInitialRuntime().currentIndex = 0`，而 `startStudy` 从 `session.lastWordIndex` 恢复。
   时序：`useMemo` 渲染期先算出新 `words`，`beginStudy` 在 `useEffect` 渲染后才纠正 index → **首帧渲染第 1 个词，第二帧才跳到断点词**。
   更隐蔽后果：`Study/index.tsx:75-76` 一条读 store（纠正后的词）、一条用闭包（未纠正的 `words[0]`）→ **首帧「效果算给 A 词、置态标记给 B 词」**，J3/J4/J5/J6 效果错位。可观测表现：进度显示 `31/8`。
   → **迁移时 Study 页重写，必须做 `safeIndex` 收敛 + 冷启动门控**，不要用「加个 `?? words[0]`」糊过去（那只修了渲染，没修效果错位）。

2. **P8 自测绕过五态机**（复核报告 C）：`Quiz/index.tsx:89` 直连 `submitSelfEval`，跳过 `markPresented`，词条可从「未学」直接跳到「已掌握/需强化」，「学习中」态被绕过 —— 与 PRD §5.5「展示即转态」冲突。
   **已裁决**：Quiz 自测**计入**今日新学 → 方案 A（`history.length === 0`）即目标口径，无需来源参数。但状态机一致性问题仍是**独立立项项（P1）**。

3. **`<viewpager>` 三级降级逻辑整体消失**：`containerBroken` / `pagerFailCount` / `pagerToken` / `PAGER_FAIL_LIMIT = 2` / `.Study-fallback` 提示都是为 Lynx 的 `createSelectorQuery` 失败兜底。
   Wails 下 `scroll-snap` 不会创建失败 → 全部可删。
   **但要注意**：`.Study-fallback` 在原实现中因 `slideMode === 'scroll'` 恒定而**恒显示**（文案「可左右滑动或点按「上一张 / 下一张」翻页」）。若追求行为复刻应保留；若视为降级残留则应删 —— **需你拍板**，两者都不要默认。

---

# 附：三个需要你拍板的迁移决策

| # | 决策 | 选项 | 建议 |
|---|---|---|---|
| 1 | 音频播放通道 | A 只保留 DOM `Audio`（零 Go 代码）／ B 同时实现 Go `AudioService` | **A**；B 作逃生舱 |
| 2 | 数据 JSON 放置 | ① 打进 bundle ② `frontend/public/data/` 走 AssetServer ③ Go binding 提供 | **②**（同源、无 CORS、不增大 bundle） |
| 3 | `.Study-fallback` 提示 | 保留（恒显示）／ 删除（降级残留） | 删除；但需在评审记录中标注为**有意偏差** |

---

*本文档为只读调研产物，未修改 `tts-ref` 任何文件；所有行号与数据均取自 `feat/tts @ 74e1595`。*
*测试用例数为静态清点（参考源无 `node_modules`，未实跑）；交叉验证点为复核报告记录的「35 个审计用例」与评审报告的「261/261」历史基线。*
