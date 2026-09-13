# 系统架构设计 · JLPT N3 词汇学习 App（Wails v3 桌面端）

> 版本：**v2.0** ｜ 日期：2026-09-13 ｜ 状态：**以实现为准**（本文描述当前仓库的真实架构）
> v1.0（2026-09-10，Lynx/ReactLynx 方案）在迁移完成后**整体作废**，仅留 §0.4 的变更对照供回溯。
> 输入基线：
> - `docs/prd/PRD-JLPT-N3-词汇学习App.md`（需求 / 页面与跳转 / 状态机 / 数据方案）
> - `docs/design/TTS-集成方案.md` **v2.0**（TTS 的权威细则，本文只给摘要）
> - `docs/design/learning-flow.mermaid`（学习交互全图）、`docs/design/五十音图学习流程设计.md` + `kana-flow.mermaid`（K 域）
> - `docs/migration/PLAN.md` / `spec-*.md` / `PORTING-NOTES.md`（迁移规格、保真红线、差异证据）
> 工程约定：根 `AGENTS.md`、`frontend/src/engine/AGENTS.md`、`frontend/src/store/AGENTS.md`、
> `frontend/package.json`、`frontend/vite.config.ts`、`go.mod`、`main.go`

---

## 0. 阅读指引

- 本文是**现状架构文档**，不是施工计划：v1.0 的 Part B（T01–T05 任务分解）已全部落地或被迁移替代，不再作为执行依据，统一收敛到 §11「已落地盘点与门禁」。
- TTS 的字段级契约（参数映射 / 缓存 / 重试 / 编排伪代码 / 冒烟脚本）**以 `TTS-集成方案.md` v2.0 为准**，本文 §8 只保留链路摘要与约束，避免两处分叉。
- 图表：`class-diagram.mermaid` / `sequence-diagram.mermaid`（领域与主链路）、
  `tts-class-diagram.mermaid` / `tts-sequence-diagram.mermaid`（TTS 专图）。
- 路径前缀说明：迁移后前端全部位于 `frontend/` 下（`frontend/src/**`、`frontend/data/build/**`、
  `frontend/scripts/gen-data/**`、`frontend/tests/**`）。v1.0 中的 `src/**`、`data/**`、`scripts/**`
  均应理解为 `frontend/` 下的对应路径。

### 0.4 v1.0 → v2.0 变更总表（回溯用）

| # | v1.0（Lynx，已作废） | v2.0（Wails v3，现状） |
|---|---|---|
| 运行平台 | Lynx / ReactLynx（React 17 API）+ H5 宿主 | **Wails v3**（Go + 系统 WebView）+ **React 18** + Vite（见 §1） |
| 原生能力 | `NativeModules.TTSEngine` / `AudioPlayer` / `LynxStorage` 三模块 + `typing.d.ts` 声明 | **Go 服务**：`KVStore` / `TTS`（`/wails/tts`）/ `System`（见 §3）；`tts.native.ts` / `player.native.ts` / `storage.native.ts` / `services/platform.ts` 已删除 |
| TTS 合成通道 | 前端 `fetch` 直连自建服务 | **下沉 Go**（CORS 实测拦截，见 §8）；浏览器 `npm run dev` 保留 `fetch` 回退 |
| 播放通道 | 原生 `playBytes` / Web `<audio>`（待实测 V-6） | **DOM `<audio>` + Blob URL**（`player.web.ts`，见 §4）；`speechSynthesis` 退居兜底 |
| 列表 / 分页 | `<list>` + `<viewpager>`（含 Web 降级） | `<ul>/<li>/div` + **CSS `scroll-snap` 横滑**；`platform.ts` / `pagerSeek.ts` / `swipe.ts` 已删 |
| SVG / 手势 | `<svg content={string}>` + `'main thread'` + `setStyleProperty` | `dangerouslySetInnerHTML`（纯函数 `toSvg`，仅数字坐标）+ `ref.style.transform`（px，见 §7/§9） |
| 单位 | `rpx`（Lynx 原生） | `rpx` **语义保留**，经 Tailwind v4 落地：`--spacing: calc(1 * var(--rpx))`，故 `p-24` ≡ 24rpx（原 PostCSS 改写插件已删，见 §9） |
| 样式 | 内联 `style` 为主 + `<text>` | **Tailwind v4 工具类**为主（原各 `index.css` 已全量迁移并删除）+ 语义类名锚点；`<div>/<span>`；`body` 14px 对齐（见 §9） |
| 数据域 | 仅 W 域（词 / 语法 / 例句） | **W 域 + K 域（五十音，104 音 / 12 关）**并存、相互隔离（见 §6） |
| 任务分解 | T01–T05（Lynx 施工顺序） | 作废，见 §11 |

---

# Part A · 系统设计（现状）

## 1. 技术栈与框架选型

| 层 | 选型 | 版本 / 说明 |
|---|---|---|
| 桌面宿主 | **Wails v3** | `go 1.25.0`，`wailsapp/wails/v3 v3.0.0-beta.20`；入口 `main.go`（窗口 1180×800 / 最小 900×640，见 §3） |
| 前端框架 | **React 18** + Vite | `react/react-dom ^18.2.0`，`vite ^8.0.5` + `@vitejs/plugin-react ^6.0.0` + `@wailsio/runtime/plugins/vite`；`frontend` 单独 `npm run dev` 端口 **9245** |
| 路由 | **`react-router@6` + `MemoryRouter`** | `react-router ^6.28.0`；桌面无地址栏，规避 `wails://` 路径问题；**不用 `<Link>`/`<NavLink>`**，统一 `useNavigate()` |
| 状态 | **zustand v4 vanilla** | `zustand ^4.5.5`；`createStore` + `persist` + 自研 `portableStorage`（见 §5）。**不升 v5**：与 Lynx 版同版本，最小改动搬运 |
| 数据校验 | `zod` | `zod ^3.23.8`，构建期 seed→JSON 管线用，不进 bundle |
| 测试 | `vitest` | `vitest ^3.2.0`（`environment: node`）；P0 审计独立配置 `vitest.audit.config.ts` |
| Lint/格式 | `biome` | `@biomejs/biome 2.5.3`；`npm run check` 为门禁（5 条规则按保真理由关闭，见 PORTING-NOTES §5） |
| 构建脚本 | `tsx` | `tsx ^4.19.0` 跑 `scripts/gen-data` |

**刻意不动的东西**：React / zustand 版本沿用 Lynx 时代锁定（升级无 UI/行为收益，只会放大搬运 diff）；
不引入 `tailwindcss` / `@mui/*` / `mermaid`（运行期）/ `d3` / `axios` / `i18n` 运行时。

## 2. 总体架构（六边形 + 分层）

```
┌─ Go 侧（main.go 装配）────────────────────────────┐
│ KVStore（持久化） TTS（合成/缓存/重试/取消） System（平台/剪贴板兜底） │
│ internal/config：TTS 地址（env > 构建注入 > 默认）· 数据目录          │
└────────────── ▲ Wails 绑定（TS 由 wails3 生成，不入库） ┘
               │
┌─ 前端端口层 frontend/src/engine/{tts,storage}/ ─────┐  ← 全仓库唯一可碰平台 API 处
│ facade：tts/index.ts（ResolvingTtsPort 编排） storage/index.ts（探测链）│
└────────────── ▲ 只暴露 facade ┘
               │
┌─ 纯引擎 frontend/src/engine/*.ts + graph/ + kana.ts ┐  ← 零框架/零 DOM，可单测
│ srs / progress / jumpRules / conjugation / graph/layout·view·svg / kana │
└────────────── ▲ 纯函数 ┘
               │
┌─ 状态层 frontend/src/store/ ────────────────────────┐
│ actions（唯一写入口） selectors（纯派生） hooks（React 绑定） persistence │
└────────────── ▲ dispatch / selector ┘
               │
┌─ 编排层 frontend/src/services/ ─────────────────────┐
│ studySession / jumpService / ttsController / quiz / highlight / graphNav / grammarView / ttsPrefetch / clipboard │
└────────────── ▲ 调用 ┘
               │
┌─ 表现层 ────────────────────────────────────────────┐
│ router（MemoryRouter + 条件 TabBar） pages P0–P9 components（C1/C2 + 通用） │
└─────────────────────────────────────────────────────┘
               │
┌─ 数据层 frontend/data/build/*.json + repository ────┐  ← 唯一入口，来源零耦合
│ W 域：stages/modules/words/grammar/sentences ＋ K 域：kana.json        │
└─────────────────────────────────────────────────────┘
```

### 平台能力隔离（红线，详见根 AGENTS.md）

- 页面 / store / service **只能**经 `engine/tts/index.ts`、`engine/storage/index.ts` 访问平台能力；
  端口实现文件（`*.web.ts` / `*.wails.ts` / `tts-client*.ts` / `tts-handler.ts` / `player*.ts` /
  `request.ts` / `audio-cache.ts` / `inflight.ts` / `storage.*.ts` / `types.ts`）**禁止**被外部 import。
- 允许 import `frontend/bindings/` 的**仅 3 处**：`engine/tts/tts-client.wails.ts`、
  `engine/storage/storage.wails.ts`，以及**唯一例外** `services/clipboard.ts`（直连 `System` 绑定，
  因本项目未定义 Clipboard 端口）。
- 端口**永不 throw**；失败必给用户可见降级文案（零静默失败）。`lang` 恒 `'ja-JP'`；
  朗读依据：词=`kana`、例句=`sentence.ja`；词性用 `constants/pos.ts` 显式枚举，禁止单字匹配；
  Quiz 出题确定性，禁止 shuffle。

### 实际目录结构（摘要）

```
main.go                          Wails 装配 + 窗口选项
internal/config/config.go        TTS 地址与数据目录
internal/services/               kvstore.go / tts.go（含 ServeHTTP）/ system.go
frontend/src/engine/             wails.ts + 纯引擎（srs/progress/jumpRules/conjugation/kana/graph）
frontend/src/engine/tts|storage/ 端口 facade + 平台实现
frontend/src/store/              index/actions/selectors/hooks/persistence
frontend/src/services/           studySession/jumpService/ttsController/quiz/highlight/graphNav/grammarView/ttsPrefetch/clipboard
frontend/src/pages/              P0–P9 + K 域 Kana/KanaStudy/KanaQuiz（每页一目录，仅 index.tsx；样式走 Tailwind 工具类）
frontend/src/components/         TabBar/Sidebar/WordCard/TtsButton/DetailSheet/ProgressRing/GraphCanvas/StatTimeline/GrammarHighlightText/Icon/Kana*
frontend/src/constants/          routes/strings/theme/srs/pos/tts/jumpRules/kana/icons
frontend/src/types/              domain/graph/progress/ports/tts/kana (+index barrel)
frontend/src/data/               repository（索引 frontend/data/build/*.json）
frontend/data/source/seed|kana/  种子 TS；frontend/scripts/gen-data/ 为 seed→JSON 管线
frontend/tests/{audit,qa}/       P0 行为审计 / QA 集成与对抗用例
frontend/bindings/               wails3 生成物（不入库）
```

## 3. Go 侧服务（`main.go` + `internal/`）

`main.go` 注册 **4** 个服务并给出 **1180×800（最小 900×640）** 窗口（`--rpx: calc(100vw / 750)`
的视觉基准；`≥768px` 时由 `frontend/src/styles/index.css` 冻结为 `1px`，见 T05 响应式），
`BackgroundColour #0b1020`，macOS 隐藏式标题栏：

- `services.NewKVStore()` —— 替代 `NativeModules.LynxStorage`；
- `services.NewTTS()`（`Route: "/wails/tts"`）—— 替代前端 `fetch` 直连，规避桌面 WebView 同源策略；
- `services.NewSystem()` —— 替代 `SystemInfo` / `lynx.setClipboardData`；
- `services.NewMobile()` —— 移动端原生能力（实时 TTS / 屏幕常亮 / 触觉 / 安全区）经 `application.Mobile` 转发；桌面由 `mobile_stub.go`（`//go:build !ios && !android`）提供 no-op，故无需 build tag。

| 服务 | API（永不抛错到前端） | 要点 |
|---|---|---|
| `KVStore`（`kvstore.go`） | `Get(key) *string`（nil→JS `null`）/ `Set` / `Remove` / `Flush` | 内存 map 为真相；**250ms 防抖**（`persist` 每次 setState 都写）；临时文件 + `os.Rename` 原子落盘；读失败按空数据处理 |
| `TTS`（`tts.go`） | `Synthesize(params)` / `Prefetch(params)` / `Cancel()`；`ServeHTTP`（`GET /wails/tts?...`，恒 200 + `Access-Control-Allow-Origin: *`，供 Android 同源调用） | 超时用户 **8s** / 预取 15s；**503 去 `voice` 重试一次**（退避 300ms），400 只记日志不重试；`singleflight` 在途去重；LRU **64 条 / 4 MiB**；失败不进缓存；`gen` + `Cancel()` 双保险防串音；query 拼装用 `url.Values.Encode()`，并对 Android 转发层吃掉的前导 `+` 做 `repairPlusSign` 回补 |
| `System`（`system.go`） | `Platform() string`（`runtime.GOOS`）/ `SetClipboard(text) bool` | `pbcopy` 仅 darwin，其余返回 false 由前端回退到 `navigator.clipboard` 或文本展示 |
| `config`（`config.go`） | `TTSBaseURL()` / `DataDir()` | 地址优先级：**`NIJAPL_TTS_BASE_URL` > 构建期 ldflags 注入（Android 用）> 默认 `http://127.0.0.1:8000`**；数据目录 `os.UserConfigDir()/nijapl`（macOS `~/Library/Application Support/nijapl`） |

前端绑定由 `wails3 generate bindings -ts` 生成到 `frontend/bindings/`（**不入库**）。

## 4. 前端端口层（`engine/tts/`、`engine/storage/`）

### 4.1 存储链：Wails → Web → 内存

`storage/index.ts`（`detectStoragePort`，模块加载时定型，探测本身不 throw）：

1. `storage.wails.ts` → Go `KVStore.Get/Set/Remove`；
2. `storage.web.ts` → `localStorage` → `sessionStorage` → 内存兜底（`npm run dev` / 单测用）；
3. 内存 `Map` 兜底（进程内有效，重启丢失，保证不崩）。

### 4.2 TTS 链：`ResolvingTtsPort` 编排（三级降级，零静默）

`tts/index.ts` 对外仍是**同一个 `TtsPort` 单例**（`prime` / `prefetch` 为可选方法，调用方零感知）：

```
① Go HTTP 合成 + 播放（engine:'http'）→ ② 系统语音 speechSynthesis（engine:'web'）
→ ③ 明确失败文案 + 复制假名（reason 见 types/ports.ts）
```

- 合成源选路（`createTtsSource`）：Android UA → 同源 Go handler（`tts-handler.ts`，query only）；
  Wails 宿主 → Go 绑定（`tts-client.wails.ts`）；否则 → 前端 `fetch`（`tts-client.ts`，仅调试回退）。
- 播放（`player.ts` 探测 + `player.web.ts` 实现）：DOM `<audio>` 单例 + Blob URL；
  `prime()` 必须在**用户手势调用栈内同步执行**（静音 WAV 解锁，不 `await`、不发请求）；
  缓存命中可在手势内同步起播。`tts.native.ts` / `player.native.ts` 已删除（Wails 下无 `NativeModules`）。
- 双通道互斥 **M1–M3**（`AudioPlayer` 独立模块的强制补偿，见 TTS-集成方案 §4.5.2）：
  **M1** 进 HTTP 播放前先 `realtime.stop()`；**M2** 进实时合成前先 `player.stop()`；
  **M3** `stop()` 三通道全停 + `gen` 递增。所有 `stop()` 幂等、**无脑先停**（禁止先查 `isPlaying` 再决定）；
  `player*.ts` 与 `tts*.ts` 禁止交叉调对方 `stop()`。
- 迟到响应丢弃：`speak()`/`stop()` 递增 `gen`，过期结果返回良性成功不出声、不误报文案。
- 内部件：`request.ts`（参数映射 + `cacheKey`，`buildSpeechUrl` 必须 `URLSearchParams`）、
  `audio-cache.ts`（内存 LRU 条目 + 字节双限，淘汰 revoke `objectUrl`）、`inflight.ts`（singleflight，失败不缓存）。
- 运行时探测（`engine/platform/index.ts`；原 `engine/wails.ts` 已并入并删除）：`hasWailsRuntime()`
  （`window._wails.environment` 存在性，**实时读取、不缓存**）与 `detectPlatform()`（守卫式，永不 throw；
  宿主 `_wails.environment.OS` 优先，缺失时 UA 兜底）。注意 `detectPlatform()` **不锁定 UA 兜底得到的
  `'web'`**——桌面 Wails 的 UA 与普通浏览器无法区分，锁定会让它与 `hasWailsRuntime()` 永久背离。
- `services/clipboard.ts`（**端口外例外**）：优先 `navigator.clipboard.writeText`，再兜底 Go `System.SetClipboard`；
  都不可用返回 `false`，由 P9 导出给出明确降级展示。

## 5. 状态层（`store/`：vanilla + persist）

- 装配（`index.ts`）：`createStore<AppState>()(persist(...))`，四分片
  `progress` / `session` / `settings`（持久化）+ `runtime`（**不落盘**：`currentModuleId` / `currentIndex` /
  `sessionWrongCount` / `detailSheet` / `lastDecisions` / `hydrated`）；
  另有 **2.5s 看门狗**兜底置 `hydrated=true`，永不卡启动态。
- 写入口（`actions.ts`，**唯一**）：`setHydrated` / `markPresented`（`未学→学习中`幂等，五态唯一入口）/
  `submitSelfEval`（返回 `JumpDecision[]`，首评判据用 `history.length===0`，**不用 `seen`**）/
  `submitGrammarSelfEval` / `skipWord`（`学习中→未学`不计分）/ `submitReviewResult` /
  `startStudy`（读断点定位词序）/ `setCurrentIndex`（越界夹取）/ `openDetailSheet` / `closeDetailSheet` /
  `markStudyDay`（跨天重置配额并推进 `streakDays`；打卡 UI 待接，函数保留供 QA）/
  `updateSettings` / `toggleUnlockRule` / `resetAllProgress`。
- 派生（`selectors.ts`）：纯函数 `(state,…) => 值`，**必须返回稳定引用或原始值**
  （禁在 selector 内构造新对象 / 数组 / 正则），如 `selectStageUnlocked` / `selectStageCompletion` /
  `selectContinueTarget` / `selectCurrentWord`。
- 绑定（`hooks.ts`）：`useAppStore` / `useHydrated` / `useProgress(Map)` / `useSession` /
  `useSettings` / `useRuntime` / `useDetailSheet` + 稳定 `appActions`（可进依赖数组 / 事件回调）。
- 持久化（`persistence.ts`）：`portableStorage` 桥 `StoragePort`（不用默认 localStorage）；
  `partialize` 只存 progress/session/settings；`version: 1` + `migrateState`；
  **净化必须加在 `merge`**（版本一致时 zustand 不调 `migrate`，只补 `readProgress` 无效），
  `history` 校验必须 `Array.isArray`（`'oops'.length===4` 会静默误判），禁止 `!` 断言；
  `onRehydrateStorage` 成功 / 失败都解门控，失败记 `console.error` 并回落默认进度。

## 6. 数据层（W 域 + K 域，来源零耦合）

| 域 | 构建产物（唯一运行时入口） | 种子来源 | repository 查询 |
|---|---|---|---|
| **W 域**（词汇） | `stages/modules/words/grammar/sentences.json` | `data/source/seed/*.ts` | `getStages/getModules/getAllModules/getModuleWords/getWordsByStage/getWordById/getGrammarById/getAllGrammars/getSentencesByWord/getSentencesByGrammar`（缺失 id 返回 `undefined`，调用方处理） |
| **K 域**（五十音） | `kana.json`（**104 音 / 12 关**，独立文件**不并入** `BuildData`，W 域契约冻结） | `data/source/kana/*.ts`（紧凑行规格：码点步长切分、浊音基准、拗音取行首、易混对称闭包、关卡 `kanaIds` 按行声明序派生） | `getKanaGroups/getKanaGroupById/getKanaByGroup/getKanaByVoiceType/getAllKana/getKanaById/getKanaByIds`，与 W 域方法并列互不引用 |

- 管线：`frontend/scripts/gen-data/`（`schema` + `build-*` + `validate` + `index`，含 `build-kana` /
  `validate-kana`），`npm run gen:data` 一键产出 + 校验（`source` 枚举 `seed|ai|human`，
  `reviewStatus` `pending|approved`；K 域 `source: 'human'`，`strokePaths` 恒空数组占位）。
- 页面 / 引擎只见 `DataRepository` 查询，**不得**出现来源分支；真实数据替换只改 JSON，代码零改动。

## 7. 纯引擎（零框架，可单测）

| 模块 | 签名 / 语义 |
|---|---|
| `srs.ts`（五态机） | `initialProgress` / `applyPresented`（`未学→学习中`）/ `applySelfEval`（三档）/ `applyReviewResult`（对/错）/ `applySkip`（`学习中→未学`不计分）/ `isDue` / `dueTargetIds`；间隔 10min/1d/3d/7d/15d/30d |
| `progress.ts`（三级完成度） | `wordCompletion`（未学→0）/ `moduleCompletion` / `stageCompletion` / `overallCompletion`；`hasContent=false`（冲刺期）短路为 `NO_CONTENT`，无 NaN |
| `jumpRules.ts`（J1–J6） | `evaluate(ctx, triggeredBy): JumpDecision[]`（数组：一次自评可同时命中 J1+J5+J6）。`selfEval` 触发 J1（首见 + `不认识`自动详解）/ J2（`sessionWrongCount≥2` 引导）；`scene` 触发 J3（例句未掌握语法高亮）/ J4（模块学完）/ J5（`POS_VERB` 显式枚举动词变形表）/ J6（关联词 chips） |
| `conjugation.ts` | J5 动词变形表（按 `pos` 纯函数生成） |
| `graph/` | `layout.ts`（纯计算、确定性：径向 / 力导向，空图 / 单节点不崩）/ `view.ts`（三视图 overview/word/grammar）/ `svg.ts`（边 + 底圈序列化为 SVG 字符串，仅数字坐标 + 常量颜色） |
| `kana.ts`（K 域） | 罗马音归一 / 变体 / 作答判定（`matchKanaRomaji` 大小写不敏感、去分隔符）+ 确定性出题（`buildKanaQuiz`：干扰项固定优先级、选项轮转、`typeRomaji` 无选项），无随机 |
| `quiz.ts`（服务侧，确定性） | W 域自测出题同样**禁止 shuffle** |

## 8. TTS 端到端（摘要；细则见 `TTS-集成方案.md` v2.0）

- 主链路：`TtsButton` / 整卡热区 → `ttsController.speak(kana|sentence.ja, settings)`（**≤100ms 先置视觉反馈**、
  同步调 `prime()`）→ `ResolvingTtsPort`（Go 合成 → 播放 → `speechSynthesis` → 明确文案 + 复制假名）。
- 参数（`constants/tts.ts` 唯一真相，业务代码禁 IP 字面量）：`lang` 恒 `'ja-JP'`（省略落中文兜底音色，硬约束 H4）；
  `voice` 默认 `ja-JP-NanamiNeural`（置 `''` 则只传 `lang`）；`rate` / `pitch` 由 settings `[0.5,1.5]` 映射为
  `±n%` / `±nHz`；`volume` 恒 `'+0%'` **显式发送**（对齐服务端缓存 key）；`format` 全平台 `'mp3'`；
  传输默认 `'json'`（`POST /v1/tts/synthesize`），`'stream'` 备选。
- 服务契约：2xx → `{audio(base64), content_type?, voice?, cached?}`；非 2xx → `{reason}`，
  400→`bad-request`（不重试）、503→`unavailable`（去 `voice` 重试一次）、504/408→`timeout`。
- **H13 编码坑**：`+` / `%` 在 query 中必须编码。前端 `buildSpeechUrl` 用 `URLSearchParams`，
  Go 拼 query 用 `url.Values.Encode()`，**禁止** `fmt.Sprintf` / 模板串拼接；
  Android 转发层吃 `+` 的历史问题由 `repairPlusSign` 回补（`rate/volume/pitch` 专用，`text` 不走）。
- 下沉 Go 的原因（PORTING-NOTES §3.4 实测）：桌面 WebView 同样执行同源策略，
  前端直连 `127.0.0.1:8000` 被 CORS 拦截（无 `Access-Control-Allow-Origin`）。
- 文案映射（`service-unavailable` / `service-rejected` / `no-player` 等）与 `prime()` / 预取 / 取消语义见 TTS-集成方案 §4.8 / §5.4 / §6.5。

## 9. 路由、应用外壳、样式

- 路由表（`router/routes.tsx`，5 Tab + 5 二级 + 兜底 `*`）：`/`（P0 首页）/ `/stages`（P1）/
  `/grammar`（P4）/ `/review`（P7）/ `/me`（P9）为 Tab；`/study/:moduleId`（P2，可 `?mode=review`）/
  `/vocab/:wordId`（P3）/ `/grammar/:grammarId`（P5）/ `/graph`（P6，`?view=overview|word|grammar&focus=:id`）/
  `/quiz`（P8，**已实现但无入口**，保真红线）为二级。路径唯一来源 `constants/routes.ts`
  （含 `studyPath/vocabPath/grammarDetailPath/graphPath` 构造器与 `isTabPath`）。
- 外壳（`App.tsx` + `router/index.tsx`；原 `App.css` 已迁移删除）：hydration 未完成渲染极简 Splash
 （`JLPT N3 単語` / `正在恢复学习进度…`）；完成后挂载 `MemoryRouter` + `AppShell`，按窗口宽度二选一：
  `<768px` → `NarrowShell`（纵向 flex + `overflow-y:auto` 内容区 + TabBar 固定底部，决策 D）；
  `≥768px` → `WideShell`（左侧 `Sidebar` + 居中限宽 480rpx 内容区，**不渲染 TabBar**，T05 决策 5）。
  切换由 `router/useIsWide.ts` 的 `matchMedia('(min-width: 768px)')` 判定（JS 分支，非 CSS 断点）。
  TabBar 5 项（110rpx 高，整格选中底 `rgba(91,140,255,0.16)`，**图标经 `components/Icon` 接入**）。
- 样式：**全量 Tailwind v4**（`src/styles/index.css` 是全仓唯一 CSS 文件）。数字工具类基于
 `--spacing: calc(1 * var(--rpx))`，故 `p-24` ≡ 24rpx、`gap-8` ≡ 8rpx；`--rpx: calc(100vw / 750)`，
 `≥768px` 冻结为 `1px`、`<320px` 退化 `0.5px`（后两者见该文件末段的两个 `@media`）。
 原 PostCSS `rpxPlugin` 已从 `vite.config.ts` 移除——**内联 `style` 里禁止裸 `rpx`**（会被浏览器
 整条丢弃）；**JS 尺寸常量**（`constants/theme.ts`）手写 `'calc(N * var(--rpx))'`。
  `body` 显式 `font-size: 14px` 对齐 Lynx 默认字号；字体栈
  `PingFang SC, MiSans, Noto Sans JP, …`；`div/span` 统一 `box-sizing: border-box`。
- Lynx→Web 语义补齐（PORTING-NOTES §3）：含多 `<span>` / `<svg>` 的容器补
  `display:flex; flex-direction:column`（`ProgressRing` / `TtsButton-notice` / `WordCard-meaningBox`，
  `GrammarHighlightText` 保持行内流除外）；原 `catchtap` 在有 tap 祖先的 2 处补 `event.stopPropagation()`
  （`WordCard-reveal`、`TtsButton` 外壳，另 `GraphCanvas-node` 同理），其余 58 处无可观测差异不改。
- P2 卡片流：`<viewpager>` 改为 **CSS `scroll-snap` 横向滚动**（Lynx 降级逻辑已删）；
  P6 图谱：`toSvg` 字符串经 `dangerouslySetInnerHTML` 作背景 + 绝对定位 `<div>` 节点承载点击
  （词→P3 / 语法→P5 / 模块→P2），缩放 `transform: scale(k) translate(px)`，手势经 ref 直改 DOM（免重渲染），
  节点半径显示放大 2.4（背景与前景同值，只露 2px 蓝环——保真红线）。

## 10. 页面与组件（职责一句话）

| 页面 | 职责 |
|---|---|
| P0 `Home` | 仪表盘：打卡 / 目标环 / 继续学习（SESSION 断点）/ 阶段条 / 今日任务 / 薄弱预警 / 图谱入口 |
| P1 `StageMap` | 4 阶段树 + 节点五态 + 解锁规则（上一含词阶段 ≥80%，设置可关）+ 冲刺期短路；未解锁模块点击**静默无反馈**（红线） |
| P2 `Study` | 卡片流 + 整卡热区发音 + 三档自评 + 跳过 + J1/J2→C2 + 语法高亮；进度行夹取 |
| P3 `VocabDetail` | 读音 / 词性活用（J5）/ 释义 / 例句（J3 高亮可点→P5）/ 关联 chips（J6）/ 时间线 |
| P4 `GrammarList` | 长列表 + 周次 / 层级筛选 |
| P5 `GrammarDetail` | 接续 / 场景 / 例句 TTS / 近义辨析互跳 / 涉及词汇（→P3）/ 自评回写 |
| P6 `Graph` + `GraphCanvas` | 三视图 + 缩放 / 拖拽 + 聚焦高亮 + 点空白取消聚焦；视图 Tab 切换不带 focus、不重置 focusId |
| P7 `Review` | 今日到期队列 + 错词本 + 开始复习（与 PROGRESS 一致） |
| P8 `Quiz` | 日→中 / 中→日 / 听音选词 + 回写进度；**无入口**（红线 §12） |
| P9 `Me` | 发音设置（即时生效 + 持久化，无读音选择）+ 试听 + 统计 + 导出 JSON（成功失败都展示原文）+ 两段式清空 |

组件：C1 `TtsButton`（即刻视觉反馈 → `ttsController`，降级 `notice` 需纵向 flex）、
`WordCard`（正 / 背面，`.WordCard-reveal` 阻断冒泡）、C2 `DetailSheet`（`position: fixed` 半屏，
确认→P3 / 忽略→下一张）、`ProgressRing` / `NodeStateBadge`（五态徽章）/ `StatTimeline` /
`GrammarHighlightText`（仅 P3 用，P5 例句不用）/ `GraphCanvas` / `TabBar`。18 个 SVG 图标**不接入**（0 处引用，红线）。

---

# Part B · 已落地盘点与门禁（取代 v1.0 任务分解）

v1.0 的 T01–T05 是 Lynx 施工顺序，迁移后**作废**；当前以本仓库实现为准。
Go / 前端 / 数据 / 测试的对应关系见 `docs/migration/PLAN.md`（Phase 0–8）与 `spec-architecture.md`。

## 11. 门禁（提交前必须全绿）

| 门禁 | 命令 | 说明 |
|---|---|---|
| 前端类型 | `cd frontend && npm run typecheck` | `tsc -b` 零错误 |
| Lint/格式 | `cd frontend && npm run check` | `biome check --write` 零错误 |
| 单元 + QA | `cd frontend && npm test` | `vitest run`（引擎 / 存储 / TTS / 服务单测 + QA；真实 TTS 集成在服务不可达时自动跳过并标注「未执行」） |
| P0 行为审计 | `cd frontend && npm run test:audit` | 4 组 35 例（跨天配额 / persist merge 净化 / 脏数据 / todayNewCount），行为未漂移的硬证据 |
| 数据管线 | `cd frontend && npm run gen:data` | seed→JSON 可重跑且产出一致 |
| Go 编译 / 审查 | `go build ./... && go vet ./internal/... .` | 零错误 |
| Go 测试 | `go test ./internal/... .` | 通过（含真实 TTS 用例，同上跳过语义） |
| 桌面构建 | `wails3 build` | 产物可运行；`frontend/bindings/` 按需重生成（`wails3 generate bindings -ts`） |

**无 CI**：无 `.github/workflows`、无 Makefile，门禁靠本地手动执行。
相对导入一律带 `.js` 后缀（`moduleResolution: bundler`），无路径别名。

## 12. 跨文件约定与保真红线

- 中文 UI 文案一律 `constants/strings.ts`（`STRINGS.*`）；TTS 地址一律 `constants/tts.ts` 的
  `TTS_BASE_URL`（业务代码禁 IP / 域名字面量）；设计令牌唯一来源 `constants/theme.ts` + `App.css` `:root`。
- **不要"顺手修好"**（`docs/migration/PLAN.md` §9 / `PORTING-NOTES.md` §4）：Quiz 无入口且不可改答；
  Graph 暗色下白圈边线、背景与前景同半径；TTS 降级时 `.WordCard-reveal` 被压窄；
  `GrammarDetail` 三按钮与例句末项的 margin / 边框细节；Me 导出展示单行原文；
  StageMap 未解锁静默；18 图标不接入。迁移差异与排查脚本见 PORTING-NOTES §2–§3
  （`docs/migration/tools/`）。
- i18n：本期不引入运行时，`strings.ts` 为唯一文案入口（未来可接，不改调用点）。
- 数据契约冻结：`frontend/data/build/*.json`（+ 独立 `kana.json`）为唯一入口；
  `source`（`seed|ai|human`）与 `reviewStatus`（`pending|approved`）由管线保证。

## 13. 遗留与待明确

- 仅 macOS 验证；Windows / Linux 未冒烟；`build/appicon.png` 仍为脚手架图标。
- 真实 N3 词库（992 词级）未切换，当前仍为 seed 基线；Q1–Q6（数据到位时点 / 词性取值 / 规模 / 周映射 / H5 宿主）随 PRD 变更重新评估。
- 本期不做：客户端熔断、持久化音频缓存、音色选择 UI、`/v1/tts/languages` 调用、gRPC、云同步 / 账号。
- K 域数据与引擎先行（设计见 `五十音图学习流程设计.md`）；W 域契约不受其影响。

*本设计以实现为准；若 PRD 变更，门禁与红线需重新评估。*
