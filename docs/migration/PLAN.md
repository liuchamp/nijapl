# nijapl：Wails v3 全量复刻实施规划

> **目标**：在 Wails v3（Go + WebView + React + Vite）下，1:1 复刻 `feat/tts` 分支（Lynx/ReactLynx）已实现的全部 UI/UX 与业务行为。
> **约束**：使用 git worktree 隔离；`feat/tts` 与当前分支互不干扰。
> **状态**：本文为**实施规划**（尚未动工），配套规格文档见同目录 `spec-ui-core.md` / `spec-ui-shell.md` / `spec-architecture.md`。

---

## 0. 一句话结论

原项目是**严格的六边形架构**：平台能力全部收敛在 `engine/storage/` 与 `engine/tts/` 两个端口目录（只有 3 个文件允许碰 `NativeModules`），`engine/` 其余部分与 `store/` `data/` `types/` `constants/` 是**零框架、零 Lynx API、零 DOM 的纯 TS**，约 **86% 的代码（含 ~340/396 个测试用例）可以原样搬运**。

真正的迁移工作量集中在三处：
1. **渲染层**：`<view>/<text>` → `div/span`、`rpx` → CSS 单位、内联 style → CSS、Lynx SVG 字符串 → 真 SVG DOM、补滚动容器；
2. **端口层**：3 个 native module（LynxStorage / TTSEngine / AudioPlayer）→ Wails Go service + 浏览器原生 API；
3. **CORS**：TTS 的 HTTP 合成本来由前端 `fetch` 直连 `127.0.0.1:8000`，桌面 WebView 同样执行同源策略 → 必须下沉 Go 或给服务端补 CORS 头。

---

## 1. 目标与范围

### 1.1 复刻范围（全部）

| 层 | 内容 | 处理方式 |
|---|---|---|
| 页面 P0–P9 | 首页 / 阶段地图 / 词汇学习 / 词汇详解 / 语法列表 / 语法详解 / 知识图谱 / 复习 / 自测 / 我的 | **100% 复刻 UI + 交互** |
| 组件 C1–C2 + 8 个通用组件 | TtsButton / WordCard / DetailSheet / ProgressRing / TabBar / GraphCanvas / StatTimeline / NodeStateBadge / GrammarHighlightText | **100% 复刻** |
| 引擎层 | SRS 五态机 / 完成度 / J1–J6 跳转 / 动词变形 / 图谱布局·SVG·视图 | **原样搬运** |
| 状态层 | zustand vanilla + persist + 14 action + 17 selector + hydration 门控 | **原样搬运**（只换持久化适配器） |
| 数据层 | `data/build/*.json`（27 KB）+ repository 索引 | **原样搬运** |
| 端口层 | storage / tts / player | **重写适配器**（新增 `.wails.ts`） |
| 测试 | 32 文件 ~396 用例 | 删除 3 个（platform）、改 15 个（tts-client fake fetch → mock binding）、其余原样 |

### 1.2 非目标（本期不做）

- 品牌视觉改版（樱粉/鼠尾草绿浅色系）—— 那是独立改版，不是迁移；
- 真实 N3 词库数据替换（992 词）—— 仍用 seed 数据，管线已就绪；
- i18n 运行时、云同步、账号体系；
- 移动端（iOS/Android）打包验证 —— Wails 支持但本期只验桌面三端。

---

## 2. 工作区与分支策略（worktree 隔离）

### 2.1 当前状态（已核实）

```
/Users/champliu/workspace/apps/nijapl                        [master]                    ← 主仓库工作树
/Users/champliu/WorkBuddy/Worktrees/nijapl/master-a111e983   [workbuddy/master-a111e983] ← 🟢 开发工作树（Wails v3 脚手架，602a81e）
/Users/champliu/WorkBuddy/Worktrees/nijapl/tts-ref           [detached HEAD 74e1595]     ← 🔒 只读参考树（feat/tts）
```

### 2.2 规则（必须遵守）

1. **所有开发只在 `master-a111e983` worktree 内进行**，主仓库 `master` 与 `tts-ref` 保持干净（已核实两者 `git status` 均为空）。
2. `tts-ref` 是 **detached HEAD 只读参考树**：
   - 只用于 `cat`/`grep`/比对，**禁止在此提交、禁止 `git checkout` 切分支**；
   - 每次开工前用 `git -C .../tts-ref status --porcelain` 确认零修改。
3. **禁止**在 `master-a111e983` 上执行 `git merge feat/tts` / `git cherry-pick`（会污染当前分支历史）。搬运代码一律用**文件复制**（`cp`）+ 人工改写，保持单次提交的语义清晰。
4. 提交策略：按 Phase 分提交，信息格式 `feat(wails): <Phase> <内容>`；每个 Phase 结束跑一次全量校验（见 §10）。
5. 若需新开分支：`git switch -c feat/wails-replica`（在 `master-a111e983` worktree 内），不要动 `feat/tts`。

> 踩坑记录：本机 `git worktree add` 曾因残留的 locked 元数据反复报 `already exists`。清理顺序固定为
> `git worktree unlock <name>` → `git worktree remove --force <path>` → `git worktree prune`，
> 不要用 `rm -rf` 直接删（会被安全删除策略拦截，导致元数据残留）。

---

## 3. 技术栈基线

### 3.1 后端

| 项 | 版本/选择 | 说明 |
|---|---|---|
| Go | **1.27.1**（本机已装，go.mod 声明 1.25） | 满足 Wails v3 要求（≥1.25） |
| Wails | **v3.0.0-beta.20** | 脚手架已锁定；`wails3` CLI **尚未安装**，Phase 0 必装 |
| module 名 | `changeme` → **改为 `nijapl`** | 影响 bindings 生成路径与前端 import |

### 3.2 前端（脚手架现状 → 目标）

| 项 | 脚手架现状 | 目标 | 决策 |
|---|---|---|---|
| 构建器 | Vite 8 + `@vitejs/plugin-react` + `@wailsio/runtime/plugins/vite` | 保留 | 已正确接入 wails runtime 插件 |
| React | 18.2 | **18.2（不动）** | 升级 19 无收益，徒增变量 |
| 路由 | 无 | `react-router@6` + **MemoryRouter** | 与 Lynx 版一致；桌面无地址栏需求，且规避 `wails://` 路径问题 |
| 状态 | 无 | **zustand@4.5**（与 Lynx 版同版本） | v5 亦可，但不升，减少变量 |
| Lint/Format | 无 | **Biome 2.5.3**（原样搬 `biome.json`） | |
| 测试 | 无 | **vitest 3.2**（原样搬 `vitest.config.ts`） | `environment: node`，天然兼容 |
| 类型检查 | `tsc` | `tsc -b`，`jsxImportSource` 由 `@lynx-js/react` 改回 `react` | |
| 数据校验 | — | `zod@3` + `scripts/gen-data`（纯 Node，原样搬） | |

### 3.3 关键取舍：为什么不动 React/zustand 版本

原工程锁 zustand v4、用 React 17 API 是**被 Lynx 逼的**；Wails 下没有这个限制，但升级不带来任何 UI/行为收益，却会让 340 个搬运过来的测试与组件签名产生连带改动。**版本一律取"最小改动"**。

---

## 4. 架构映射总表（Lynx → Wails v3）

| 原（Lynx） | 新（Wails v3） | 改动性质 |
|---|---|---|
| `@lynx-js/react` `root.render` | `ReactDOM.createRoot(#root)` | 改写 |
| `<view>` / `<text>` | `<div>` / `<span>` | 机械替换 |
| `<list>` / `<list-item item-key>` | `<ul>/<li>` 或 `div`（用 React `key`） | 机械替换 |
| 内联 `style` + `className` | CSS 类为主，动态值保留内联 | 重构（不改观感） |
| `rpx` 单位 | `--rpx` CSS 变量 + `calc()` | 见 §8.1 决策 A |
| `bindtap` / `catchtap` | `onClick` / `onClick + stopPropagation` | 机械替换 |
| `main-thread:bindtouch*` + `setStyleProperty` | `onTouch*` + `ref.style.transform`（px） | 改写，保留"免重渲染"策略 |
| `<svg content={string}>` | 真 SVG DOM（JSX `<line>`/`<circle>`） | 改写（观感一致） |
| `<viewpager>` + 三级降级 | CSS `scroll-snap` 横滑 | 删除降级逻辑 |
| `SystemInfo.platform` | 删除 | 删除 `services/platform.ts` |
| `NativeModules.LynxStorage` | Go `KVStore` service **或** localStorage | 见 §8.2 决策 B |
| `NativeModules.TTSEngine` | 删除 → Web `speechSynthesis` 降级级 | 删除 |
| `NativeModules.AudioPlayer` | 删除 → DOM `<audio>`（`player.web.ts` 原样） | 删除 |
| 前端 `fetch` TTS | Go `TTS` service（net/http） | 见 §8.3 决策 C |
| `lynx.setClipboardData` | `navigator.clipboard.writeText`（Go 兜底可选） | 删分支 |
| 页面无滚动容器 | 补 `overflow-y:auto` | 见 §8.4 决策 D |
| `source.define.__TTS_BASE_URL__` | Go 侧配置（env / config） | 改写 |
| 18 个 SVG 图标（0 处引用） | 保持不接入 | 见 §8.5 决策 E |

---

## 5. 目录结构设计（目标形态）

```
nijapl/                                   # worktree master-a111e983
├── main.go                               # Wails 入口：Options / Services / 窗口
├── go.mod                                # module nijapl；wails v3 beta.20
├── greetservice.go                       # 🗑 删除（脚手架 demo）
├── internal/
│   ├── config/config.go                  # TTS baseURL / 数据目录 / 窗口尺寸
│   └── services/
│       ├── kvstore.go                    # Get/Set/Remove（原子写 + 防抖）
│       ├── tts.go                        # Synthesize/Prefetch/Cancel（见 §7.2）
│       ├── audio.go                      # 可选：PlayBytes/StopPlayback
│       └── system.go                     # Platform/SetClipboard（可选兜底）
├── frontend/
│   ├── index.html  vite.config.ts  tsconfig.json  package.json
│   ├── bindings/                          # 🆕 生成物（wails3 generate bindings -ts）
│   ├── data/
│   │   ├── build/*.json                   # 从 tts-ref 搬运（27 KB）
│   │   └── source/seed/*.ts               # 从 tts-ref 搬运
│   ├── scripts/gen-data/**                # 从 tts-ref 搬运（纯 Node）
│   └── src/
│       ├── main.tsx  App.tsx  App.css     # 外壳 + 全局令牌
│       ├── constants/                     # 搬运（theme/strings/srs/jumpRules/pos/routes/tts）
│       ├── types/                         # 搬运（domain/graph/progress/tts/ports）
│       ├── data/{index,repository}.ts     # 搬运
│       ├── engine/
│       │   ├── srs.ts progress.ts jumpRules.ts conjugation.ts graph/**   # 搬运
│       │   ├── storage/{index,types,storage.web,storage.wails}.ts        # 🆕 .wails
│       │   └── tts/{index,request,audio-cache,inflight,tts.web,player.web,tts-client.wails}.ts
│       ├── store/**                       # 搬运（persistence 换适配器）
│       ├── services/**                    # 搬运；删 platform.ts / swipe.ts
│       ├── router/**                      # 搬运（MemoryRouter 保留）
│       ├── components/**                  # 搬运 + 标签/样式改写
│       ├── pages/**                       # 搬运 + 标签/样式改写
│       └── styles/rpx.css                 # 🆕 rpx 换算与基础重置
├── tests/{qa,audit}/**                    # 搬运（vitest）
├── vitest.config.ts  vitest.audit.config.ts  biome.json   # 搬运到 frontend/ 或根（见 §6 Phase1）
├── build/**  Taskfile.yml                 # Wails 构建配置（更新 build/config.yml 的 info）
└── docs/migration/*.md                    # 本规划 + 3 份规格
```

**关于 package.json 位置**：原 Lynx 工程 `package.json` 在仓库根；Wails 脚手架在 `frontend/`。
**决策：统一放 `frontend/`**（与 Wails 生态一致，`build/Taskfile.yml` 的 `common:dev:frontend` 已按此约定），`scripts/gen-data` 与 `tests/` 一并迁入 `frontend/`，路径前缀随之调整。

---

## 6. 分阶段实施计划

> 每阶段遵守「写 → 验 → 报」：完成即跑校验（lint / typecheck / test / build / 冒烟），全绿才进下一阶段。

### Phase 0 · 环境与基线验证　（复杂度：低）

1. `go install github.com/wailsapp/wails/v3/cmd/wails3@latest`，`wails3 setup`（或 `wails3 doctor`）确认工具链。
2. `go mod tidy` + `go build ./...` 确认 beta.20 依赖可解析。
3. `wails3 dev` 跑通脚手架 demo（React 页面 + GreetService + time 事件），确认 bindings 生成路径 `frontend/bindings/changeme`。
4. 验证 `wails3 generate bindings -ts` 产出 TS 版本，记录 import 形态（规划要用到）。
5. 确认 `tts-ref` 只读树干净。

**验收**：`wails3 doctor` 全绿；demo 窗口可交互；`frontend/bindings/` 有生成物；`git status` 两个参考树为空。

### Phase 1 · 工程骨架改造　（复杂度：中）

1. `go.mod` module 改 `nijapl`；`main.go` 去掉 demo service/事件/time goroutine，改为最小骨架（窗口 + Assets + Mac 选项）。
2. `build/config.yml` 的 `info`（companyName/productName/productIdentifier/description/version）改为 nijapl。
3. `frontend/`：
   - `package.json` 加依赖：`react-router@6`、`zustand@4.5`、`zod@3`；devDeps 加 `biome`、`vitest@3.2`、`tsx`、`@types/node`；
   - `tsconfig.json`：`jsx: react-jsx`（去掉 `jsxImportSource: @lynx-js/react`）、`resolveJsonModule`、`strict`、`verbatimModuleSyntax`；
   - 搬 `biome.json`、`vitest.config.ts`、`vitest.audit.config.ts`（include 路径改为 `frontend/src/**`、`frontend/tests/**`）；
   - `vite.config.ts` 保留 wails 插件；若 TTS 留前端则加 `define`，否则不加。
4. 建立 `src/styles/rpx.css`：全局重置 + 字体栈 + **rpx 换算**（决策 A：`--rpx: calc(100vw / 750)`）。
   - 配套：`:root { background-color }` 改为 `html, body`；窗口默认尺寸给 420×860（`application.WebviewWindowOptions`），并提供最小宽度保护（`< 320px` 时退化为固定 `--rpx: 0.5px`，避免极端窄窗口下字号过小）。
5. 搬 `src/App.css` 的 `:root` 令牌（颜色/间距/字号/圆角），`html,body` 承载背景色。

**验收**：`wails3 dev` 起空壳窗口（深色底、无报错）；`npx biome check`、`tsc -b`、`vitest run`（0 用例）均通过。

### Phase 2 · 纯层搬运 + 单测跑通　（复杂度：中，价值最高）

按顺序复制（源 → 目标），除注明外**零改动**：

| 复制内容 | 改动 |
|---|---|
| `src/types/**` | 零 |
| `src/constants/**` | `tts.ts` 的 `__TTS_BASE_URL__` 改读 Go 配置（或保留 define，看决策 C） |
| `data/build/*.json`、`data/source/seed/*.ts`、`scripts/gen-data/**` | 路径前缀调整 |
| `src/engine/srs.ts` `progress.ts` `jumpRules.ts` `conjugation.ts` `graph/{layout,svg,view}.ts` | 零 |
| `src/engine/tts/{request,audio-cache,inflight}.ts` | 零 |
| `src/data/{index,repository}.ts` | JSON import 路径调整 |
| `src/store/**` | `persistence.ts` 的 `portableStorage` 注入源改为新 facade |
| `src/services/**` | 删 `platform.ts`（+其测试）、`swipe.ts`（死代码）、`pagerSeek.ts` |
| `tests/qa/**`、`tests/audit/**`、`src/**/__tests__/**` | 删 `platform.test.ts`；`tts-client.test.ts` 见 Phase 6 |

**验收**：`vitest run` ≈ **365 用例全绿**（396 − 3 platform − 15 tts-client − 10 tts-http.integration，后两项在 Phase 6 处理）；`npm run gen:data` 可重跑且产出一致；`tsc -b` 无错。

### Phase 3 · Go 侧服务 + 端口适配　（复杂度：高）

1. `internal/config`：TTS baseURL（env `NIJAPL_TTS_BASE_URL`，默认 `http://127.0.0.1:8000`）、数据目录（`os.UserConfigDir()/nijapl`）。
2. `internal/services/kvstore.go`（决策 B，若选 Go）：
   - `Get(key) *string`（nil → JS `null`）、`Set(key,value) error`、`Remove(key) error`；
   - JSON 文件 + `sync.RWMutex` + **200–300ms 防抖写盘** + **临时文件 + `os.Rename` 原子替换**；
   - 所有 error 吞掉（端口契约「永不 throw」）。
3. `internal/services/tts.go`（决策 C）：`Synthesize(req, gen)` / `Prefetch(req)` / `Cancel()`，详见 §7.2。
4. `internal/services/system.go`（可选）：`Platform()` / `SetClipboard(text) bool`。
5. `main.go` 注册 services；`wails3 generate bindings -ts` 生成到 `frontend/bindings/`。
6. 前端新增：
   - `src/engine/storage/storage.wails.ts` + `index.ts` 探测链改为 **wails → web → memory**；
   - `src/engine/tts/tts-client.wails.ts`（调 bindings）；`index.ts` 装配改为 `createTtsWailsClient()`；
   - `src/services/clipboard.ts` 删 lynx 分支。

**验收**：`go build ./...` + `go vet ./...` 通过；bindings TS 生成且类型正确；前端 `tsc -b` 通过；手工验证 `Set/Get/Remove` 落盘文件内容正确、重启后仍在。

### Phase 4 · 应用外壳　（复杂度：中）

1. `App.tsx` + `App.css`：hydration 门控 Splash（文案 `JLPT N3 単語` / `正在恢复学习进度…`）、2500ms 看门狗。
2. `router/index.tsx`（`MemoryRouter` + Shell + 条件 TabBar）、`router/routes.tsx`（10 路由 + 兜底）、`router/navigation.ts`（零改动）。
3. `components/TabBar`：5 Tab、110rpx 高、整格选中底 `rgba(91,140,255,0.16)`、无图标、24rpx label。
4. 滚动容器方案落地（决策 D）：`.Shell` 高度 100% + `.Shell-content` `overflow-y:auto`，TabBar 固定底部。
5. 字体栈：`PingFang SC, MiSans, Noto Sans JP, system-ui, sans-serif`。

**验收**：5 个 Tab 可切换、选中态正确、二级页不显示 TabBar、长页面可滚动且 TabBar 不随之滚动。

### Phase 5 · 页面与组件复刻　（复杂度：高，工作量最大）

严格按规格文档逐页实现，建议顺序（先主链路，后枝叶）：

| 序号 | 页面/组件 | 规格来源 | 关键点 |
|---|---|---|---|
| 5.1 | `components/NodeStateBadge` + `ProgressRing` | shell/core | 补 CSS（原无 CSS 文件，字号未定义 → 定 20rpx） |
| 5.2 | P0 `Home` | core | 今日目标、继续学习入口、图谱入口 |
| 5.3 | `components/WordCard` + `TtsButton` | core | TtsButton `.notice` 需补 `flex-direction:column` |
| 5.4 | P2 `Study` | core | 卡片流（CSS scroll-snap）、进度行 `Math.min` 夹取、跳过/自评、J1–J6 跳转 |
| 5.5 | P3 `VocabDetail` + `DetailSheet` | core | 例句高亮、变形表、关联词 |
| 5.6 | P1 `StageMap` | shell | 解锁规则条、模块行、锁定态 `opacity:0.5`、静默点击 |
| 5.7 | P7 `Review` + P8 `Quiz` | core | 复习队列、自测流程 |
| 5.8 | P4 `GrammarList` + P5 `GrammarDetail` | shell | chip 筛选、例句、自评三按钮（含末尾 margin-right 细节） |
| 5.9 | P6 `Graph` + `GraphCanvas` | shell | SVG 真 DOM、缩放/平移、两段式点击、图例 |
| 5.10 | P9 `Me` | shell | 语速/音调步进、统计 `StatTimeline`、导出 JSON、两段式清空 |

**每页完成后立即**：跑 `biome check` + `tsc -b` + 与 `tts-ref` 源码逐项比对（布局/样式/文案/交互清单）。

### Phase 6 · TTS 接入与降级链　（复杂度：高）

1. 前端 `ResolvingTtsPort` 编排**不变**（M1–M3 互斥、gen 丢弃、reason 映射）。
2. 替换 source：Go `TTSService.Synthesize` → base64 → `player.web.ts`（`atob` → `Uint8Array` → `Blob` → `<audio>`）。
3. 降级链：`Go HTTP` → `speechSynthesis`（`tts.web.ts` 原样）→ 明确文案 + 复制假名。
4. `stop()`：`Go Cancel()` + `player.stop()` + `speechSynthesis.cancel()`。
5. 测试改造：`tts-client.test.ts`（15 用例）改 mock Go binding；`tts-http.integration.qa.test.ts`（10 用例）待 Go service + 本地 8000 服务就绪后重跑。
6. 用 bindings 返回的 **CancellablePromise `.cancel()`** 实现真实取消，与 `gen` 双保险。

**验收**：朗读成功出声；连点不串音；切换页面立即静音；服务不可用时降级到 speechSynthesis 且有明确文案；8 秒超时生效；503 去 voice 重试一次。

### Phase 7 · 行为对齐与验收　（复杂度：中）

1. **重跑 4 个 P0 审计测试**（跨天配额 / persist merge 净化 / 脏数据 / todayNewCount）—— 这是"行为未漂移"的硬证据，必须全绿。
2. 逐条过 §8 的"非直觉细节清单"（规格文档 §16 / §11.6 共 30+ 条），确认未被"顺手修好"。
3. 交互回归清单：学习→自评→跳转 J1–J6、跳过不计分、阶段解锁阈值 0.8、打卡、导出、清空两段式。
4. 视觉对齐：按页面截图对比（可用 `wails3 dev` 窗口截图 vs 规格描述），重点核对 TabBar/卡片/图谱/统计条。

### Phase 8 · 构建与打包　（复杂度：中）

1. `wails3 build`（darwin）→ 验证 `.app` 可独立运行、数据落盘路径正确、TTS 可用。
2. `build/config.yml` 的 appicon / Info.plist 元数据补全。
3. 交叉编译 windows/linux（`GOOS=windows wails3 build`）冒烟（可选，依赖本机有无对应工具链）。
4. 更新 `README.md` / `AGENTS.md`：Wails + Vite 的 dev/build/lint/test 命令与纪律（原 AGENTS.md 写的 `bun run lint` 与实际 npm 脚本不一致，一并修正）。

---

## 7. Go 侧设计要点

### 7.1 `KVStore`（决策 B 选 Go 时）

```go
type KVStoreService struct {
    path string                 // os.UserConfigDir()/nijapl/store.json
    mu   sync.RWMutex
    data map[string]string
    // 防抖：time.AfterFunc(250ms) → flush()
}

func NewKVStore() *KVStoreService
func (s *KVStoreService) Get(key string) *string      // nil ⇒ JS null
func (s *KVStoreService) Set(key, value string) error // 吞错，返回 nil
func (s *KVStoreService) Remove(key string) error
func (s *KVStoreService) flush() error                // 写 .tmp + os.Rename
```

要点：zustand `persist` 每次 setState 都写盘，必须防抖；progress 全量后可达百 KB 级，用 JSON 文件（不受 NSUserDefaults 上限约束）。

### 7.2 `TTS`（决策 C 推荐下沉 Go）

```go
type SynthesizeRequest struct {
    Text  string  `json:"text"`
    Lang  string  `json:"lang"`            // 恒 "ja-JP"（硬约束 H4）
    Voice *string `json:"voice,omitempty"`
    Rate  string  `json:"rate"`            // "+0%" / "-50%"
    Volume string `json:"volume"`          // 恒 "+0%"
    Pitch string  `json:"pitch"`           // "+0Hz"
    Format string `json:"format"`          // "mp3"
}

type SynthesizeResult struct {
    OK bool; Clip *AudioClip; Reason string; Status int; ServiceReason string
}

func (t *TTSService) Synthesize(req SynthesizeRequest, gen int64) SynthesizeResult // 永不返回 error
func (t *TTSService) Prefetch(req SynthesizeRequest)
func (t *TTSService) Cancel()   // gen++ + cancel 在途 ctx
```

必须复刻的 6 条语义（**否则行为漂移**）：

1. 空文本 → `reason:'empty-text'`，不发请求；
2. 超时 **8s**（预取 15s），超时归 `timeout` 而非 `network`；
3. **503 时去掉 `voice` 重试一次**，退避 300ms；400 不重试只打日志；
4. `lang` 恒 `ja-JP`（省略会落到服务端中文兜底音色）；
5. 缓存 key 与服务端同序同字段：`sha256(format \0 voice \0 rate \0 volume \0 pitch \0 text)`；前端侧 key = `[format, voice ?? '', rate, volume, pitch, text].join('\u0000')`；
6. 失败结果**不进缓存**，inflight 失败即删。

**⚠️ H13 编码坑（实测事故）**：`rate='+0%'` 里的 `+` 与 `%` 必须编码。
Go 侧**必须**用 `url.Values.Encode()`，**禁止** `fmt.Sprintf` 拼 query（前者把 `+`→`%2B`、`%`→`%25`，与前端 `URLSearchParams` 行为一致；裸拼会被服务端解码成 `" 0%"` → 正则不匹配 → 400）。

**并发**：`golang.org/x/sync/singleflight` 做客户端去重；`atomic.Int64` 维护 `gen` 丢弃迟到响应（binding 的 `cancel()` 只是丢弃 Promise，请求仍在跑，gen 是最后防线）。

**缓存**：`hashicorp/golang-lru/v2`，双限 64 条 / 4 MiB。

---

## 8. 需要拍板的决策点

> 每项给出推荐值；如无异议我按推荐执行，实施中不再打断。

| # | 决策 | **结论** | 备选 | 影响面 |
|---|---|---|---|---|
| **A** | **rpx 换算 / 窗口尺寸** | ✅ **响应式**：`--rpx: calc(100vw / 750)`，全站 `calc(N * var(--rpx))`，窗口可自由拉伸（整体等比缩放，与 Lynx 行为一致） | 固定视口 375×812 + `--rpx: 0.5px` | 全部样式。注意：`transform: translate()` 里不能用 rpx，需换算成 px（`calc(N * var(--rpx))` 在 transform 内可用，但拖拽直写 style 时建议取 `getComputedStyle` 的 `--rpx` 值后算 px） |
| **B** | **持久化** | ✅ **一期 localStorage**（`storage.web.ts` 原样复用，零成本） | 二期按需上 Go KVStore（端口 API 一致，可无痛切换） | 端口层 |
| **C** | **TTS HTTP** | ⏳ **服务端 HTTP 接口已提供**（`ttsedservice`）。调用侧待定 → **建议 Go 侧代理**（规避 CORS）；若坚持前端直连，必须先给服务端补 `Access-Control-Allow-Origin` + `Access-Control-Expose-Headers: X-TTS-Cache, X-TTS-Voice` | 见左 | 端口层 + Go service |
| **D** | **滚动** | ✅ **补 `overflow-y:auto`**（`.Shell-content` 滚动、TabBar 固定底部） | 严格不滚动 | Lynx 原缺陷（内容超高被裁切）的体验修复 |
| **E** | **18 个 SVG 图标** | ✅ 保持**不接入**（原代码 0 处引用） | 接入并改 `currentColor` | 无 |
| **F** | **品牌配色** | ✅ 复刻**现有代码**（深色 `#0b1020` 系） | 品牌规范浅色系（独立改版项目） | 全局 |
| **G** | **路由** | ✅ `MemoryRouter`（与原实现一致） | `HashRouter` | 路由层 |
| **H** | **pager 降级代码** | ✅ 删除 `platform.ts` / `pagerSeek.ts` / `swipe.ts` | 保留为死代码 | 无（注意 `.Study-fallback` 在原实现恒显示） |
| **I** | **`services/swipe.ts`** | ✅ 删除（死代码） | — | 无 |

---

## 9. "别顺手修好"清单（复刻保真红线）

以下都是**原实现即如此**的行为，复刻时必须保留（节选，完整版见 `spec-ui-core.md` §11.6 与 `spec-ui-shell.md` §16）：

1. Quiz **不可改答**；Review 按钮**只视觉禁用**；WordCard 徽章**恒不显示**；
2. StageMap 点**未解锁模块无任何反馈**（静默）；
3. `GrammarDetail` 自评三按钮**都带** `margin-right:16rpx`（含最后一个）；例句**最后一条也有**下边框；
4. `StatTimeline` 最后一行也有 `margin-bottom:16rpx`；
5. Graph 视图 Tab 选中是**底色变主色但文字仍 `#f5f7ff`**；而「进入详情」「导出数据」是**主色底 + `#0b1020` 深字**（两套反色规则并存）；
6. 切换图谱视图 Tab **不带 focus 且 focusId 不重置**；`view=word/grammar` 未命中 focus 时回退到**第一条**数据；
7. `GrammarDetail` 例句**未使用** `GrammarHighlightText`（该组件只在 `VocabDetail` 用）；
8. Me 页导出**成功与失败都会**展示 JSON 原文（单行、无格式化）；
9. GraphCanvas 背景 SVG 与前景节点**半径相同**（都乘 2.4），白填充被覆盖只露 **2px `#4c6ef5` 蓝环**；`panX/panY` 恒为 0；
10. TabBar 选中是**整格背景**，非仅文字变色，且**无图标**。

---

## 10. 每阶段校验门禁（Definition of Done）

| 门禁 | 命令 | 要求 |
|---|---|---|
| Go 编译 | `go build ./... && go vet ./...` | 零错误 |
| Go 测试 | `go test ./...` | 通过（Phase 3 后） |
| 前端类型 | `cd frontend && tsc -b` | 零错误 |
| Lint | `npx biome check` | 零错误 |
| 单测 | `npx vitest run` | 全绿（Phase 2 后 ≈365，Phase 6 后 ≈390） |
| 审计 | `npx vitest run --config vitest.audit.config.ts` | 35 用例全绿 |
| 数据 | `npm run gen:data` | 产出与 `data/build` 一致 |
| 构建 | `wails3 build` | 产物可运行 |
| 隔离 | `git -C .../tts-ref status --porcelain` | 空 |
| 分支 | `git status`（当前 worktree） | 只有预期改动 |

---

## 11. 主要风险与对策

| 风险 | 影响 | 对策 |
|---|---|---|
| **CORS**：桌面 WebView 同样执行同源策略，前端直连 TTS 会失败 | TTS 完全不可用 | 决策 C 下沉 Go；若暂留前端，必须先给服务端补 CORS 头 |
| **H13 编码**：query 中 `+`/`%` 未编码 → 400 | TTS 全量失败 | Go 侧强制 `url.Values.Encode()`，加单测 |
| **binding 无法真 abort**：`cancel()` 只丢弃 Promise | 串音 | gen 机制 + `atomic` 丢弃迟到响应 |
| **wails3 CLI 未安装 / beta 版本 API 漂移** | 阻塞开工 | Phase 0 先验证；锁 `beta.20` 不追 latest |
| **rpx 换算偏差**导致整体视觉不对 | 全局返工 | Phase 1 先用 Home 页试算，确认后再铺开 |
| **滚动行为差异**被误判为"复刻偏差" | 争议 | 决策 D 明确写入本文并让用户在 Phase 4 确认 |
| **worktree 误操作**污染 `feat/tts` | 分支受损 | §2.2 规则；每阶段门禁检查两个参考树干净 |

---

## 12. 命令速查

```bash
# 参考树（只读）
git -C /Users/champliu/WorkBuddy/Worktrees/nijapl/tts-ref status --porcelain

# 开发（当前 worktree）
cd /Users/champliu/WorkBuddy/Worktrees/nijapl/master-a111e983
wails3 dev                        # 热重载（Go 改重建 + 前端 HMR + 自动重生成 bindings）
wails3 generate bindings -ts      # 生成 TS 绑定到 frontend/bindings
wails3 build                      # 生产构建
wails3 task darwin:package        # 打包 .app

# 前端
cd frontend
npx biome check                   # lint/format
npx tsc -b                        # 类型检查
npx vitest run                    # 单测
npm run gen:data                  # 重生成 data/build/*.json
```

---

## 13. 附：规划依据

| 文档 | 内容 |
|---|---|
| `docs/migration/spec-ui-core.md` | 核心学习链路（Home / Study / VocabDetail / Quiz / Review + WordCard / TtsButton / ProgressRing / DetailSheet + 相关 service）逐文件规格 |
| `docs/migration/spec-ui-shell.md` | 应用外壳 / TabBar / StageMap / Graph + GraphCanvas / GrammarList / GrammarDetail / Me / StatTimeline / NodeStateBadge / GrammarHighlightText / 图标资产 / Lynx→Web 改写总表 |
| `docs/migration/spec-architecture.md` | 端口接缝映射、领域层与状态层可复用清单、测试工程统计、Go service 设计草案、H13 编码坑、M1–M5 互斥 |
| 上游文档 | https://v3.wails.io/（Method Bindings / Frontend Runtime / Mobile） |
