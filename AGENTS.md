# AGENTS.md

本仓库是 **Wails v3**（Go + 系统 WebView）桌面应用：**JLPT N3 日语词汇学习**。
前端 **React 18 + TypeScript + Vite**，状态 **zustand v4 (vanilla)**，路由 **react-router@6 (MemoryRouter)**。
由 Lynx / ReactLynx 工程迁移而来（1:1 复刻 UI/UX，含反直觉行为）。

## 先读文档

- Wails v3：<https://v3.wails.io/llms.txt>
- 系统设计 / 迁移规格：`docs/design/ARCH-系统设计.md`、`docs/migration/spec-*.md`
- 迁移差异与保真决策：`docs/migration/PORTING-NOTES.md`、`docs/migration/PLAN.md`（§9 红线）
- 学习交互全图：`docs/design/learning-flow.mermaid`

## 常用命令

| 目的 | 命令 |
|---|---|
| 启动桌面应用（热重载） | `wails3 dev` |
| 构建 | `wails3 build`（跨平台打包 `task package`，由根 `Taskfile.yml` + `build/*/Taskfile.yml` 编排） |
| 前端单独起服务 | `cd frontend && npm run dev`（端口 9245） |
| 类型检查 | `cd frontend && npm run typecheck` |
| Lint + 格式化 | `cd frontend && npm run check` |
| 单元测试 | `cd frontend && npm test` |
| P0 行为审计 | `cd frontend && npm run test:audit` |
| 重新生成种子数据 | `cd frontend && npm run gen:data` |
| 重新生成类型绑定 | `wails3 generate bindings -ts` |
| Go 测试 | `go test ./internal/... .` |

完整脚本见 `frontend/package.json`（另有 `build:dev` / `preview` / `format` / `test:watch`）。
**无 CI**（无 `.github/workflows`、无 Makefile）：构建编排用 `Taskfile.yml`（`task dev/build/package`），
所有门禁靠本地手动执行。

## 提交前门禁

- 前端：`cd frontend && npm run typecheck && npm run check && npm test` 必须全绿。
- Go 改动：`go build ./... && go vet ./internal/... .`（另跑 `go test ./internal/... .`；
  真实 TTS 集成用例在服务不可达时自动跳过、并在报告中标注「未执行」）。

## 目录结构

```
main.go                     应用入口（Wails 装配 + 窗口选项）
internal/config/            TTS 地址与数据目录
internal/services/          Go 服务：KVStore / TTS / System（剪贴板）
frontend/src/engine/        平台端口（storage/tts）+ 纯引擎（srs/progress/jumpRules/conjugation/graph/kana）
frontend/src/store/         zustand vanilla：actions(唯一写入口)/selectors/hooks/persistence
frontend/src/services/      编排层：studySession / kanaWriteSession / ttsController / jumpService / quiz / clipboard…
frontend/src/pages/         P0–P9 页面 + K 域（Kana / KanaStudy / KanaQuiz）（每页一目录：index.tsx + index.css）
frontend/src/components/    C1/C2 + 通用组件 + K 域（KanaTable / KanaCanvas / KanaConfusableCard）（同目录结构）
frontend/src/constants/     routes / strings / theme / srs / pos / tts / jumpRules / kana（唯一真相源，无路径别名）
frontend/src/router/        index.tsx（AppShell + MemoryRouter 装配）/ routes.tsx / navigation.ts（页面一律 `useNavigation()`，禁用 `<Link>`）
frontend/src/types/         domain / progress / graph / kana（K 域实体）
frontend/src/data/          repository.ts（唯一数据入口，组装 JSON；上层禁直读 JSON）
frontend/data/build/        构建产物 *.json（words/modules/stages/sentences/grammar + 独立 kana.json，禁手改）
frontend/data/source/       种子 TS：seed/（W 域）+ kana/（K 域）
frontend/scripts/gen-data/  seed→JSON 管线（`npm run gen:data`；含 schema/validate/build-kana/validate-kana）
frontend/tests/{audit,qa}/  P0 行为审计 / QA 集成与对抗用例
frontend/bindings/          wails3 生成的类型安全绑定（生成后落盘但 gitignored，不入库，勿手改）
docs/                       设计 / 迁移 / PRD / QA / 评审
```

## 工程纪律与红线

- **平台能力隔离（六边形）**：存储 / TTS 只能经 `frontend/src/engine/` 下的 facade
  （`engine/tts/index.ts`、`engine/storage/index.ts`）访问。页面 / store / service
  **不得**直接调用 Wails 绑定或浏览器原生 API。
  **唯一例外**：`services/clipboard.ts` 直连 `System` 绑定（本项目未定义 Clipboard 端口，见
  `docs/migration/spec-architecture.md` §E.4）。端口实现文件（`*.web.ts` / `*.wails.ts` /
  `tts-client.ts` / `player*.ts`）**禁止**被外部 import。
- **端口契约**：端口**永不 throw**；失败必给用户可见降级文案（零静默失败）。
- **写操作唯一入口**：页面 / service 只 dispatch `store/actions.ts`，不自行改状态；
  `store/selectors.ts` 必须是纯函数 `(state,…) => 值`，且**返回稳定引用或原始值**
  （勿在其中构造新对象 / 数组，否则无限重渲染）。
- **持久化净化加在 `merge`**：zustand 版本一致时 `migrate` 不执行，只补 `readProgress` 无效；
  校验 `history` 必须用 `Array.isArray`（`'oops'.length === 4` 会静默误判），禁止用 `!` 绕过类型。
- **样式单位**：CSS 直接写 `rpx`，由 `frontend/vite.config.ts` 的 PostCSS 插件在构建期改为
  `calc(N * var(--rpx))`。**JS 尺寸常量**（`constants/theme.ts`）必须写 `'calc(N * var(--rpx))'`
  —— 它不经 PostCSS，写 `'Nrpx'` 在浏览器里是无效值。
- **import 后缀**：TS/TSX 相对导入一律带 `.js` 后缀（`moduleResolution: bundler`），无路径别名。
- **事件阻断**：原 Lynx `catchtap`（绑定 + 阻断冒泡）迁到 Web `onClick` 后**不会**自动阻断，
  必须显式 `event.stopPropagation()`。典型：`WordCard` 的 `.WordCard-reveal` 与 `TtsButton`
  （否则一次点击触发两次发音）。
- **文本/容器语义**：原 Lynx `<view>` 默认 `display:flex; flex-direction:column`（子元素被块级化），
  Web `<div>` 是 block。若容器含多个相邻 `<span>` / `<svg>`，或子 `<span>` 依赖 `width` /
  `text-align`，**必须显式补** `display:flex; flex-direction:column`。
- **默认字号**：Lynx 的 UA 默认字号是 **14px**（浏览器 16px），已在 `frontend/src/App.css`
  的 `body` 上对齐；新增未显式设字号的元素时留意。
  **例外**：`pages/KanaQuiz` 的「输入罗马音」是本仓库唯一的 `<input>`；表单控件不继承
  `body` 的字号 / 配色，故它显式声明了 font-size / color / background / border。
- **零随机 / 固定契约**：Quiz 出题确定性，禁止 shuffle；`lang` 恒 `'ja-JP'`；朗读依据为
  词=`kana`、例句=`sentence.ja`；词性用显式枚举（`constants/pos.ts`），禁止单字匹配。
- **禁止硬编码**：中文 UI 文案一律 `constants/strings.ts`（`STRINGS.*`）；TTS 地址一律
  `constants/tts.ts` 的 `TTS_BASE_URL`（业务代码禁止出现 IP / 域名字面量）。
- **不要"顺手修好"**：要求与原 Lynx 行为逐处一致，包括反直觉之处；红线清单见
  `docs/migration/PLAN.md` §9。已知有意保留项：Quiz 无入口、Graph 暗色下白圈边线、
  TTS 降级时 `.WordCard-reveal` 被压窄、18 个 SVG 图标不接入。

### K 域（五十音）专项红线

设计基线：`docs/design/五十音图学习流程设计.md`（v1.0）。K 域与 W 域（词条 / 语法）**物理隔离**：

- **RK1 · 进度 key 必须带前缀**：K 域进度一律 `kana:<romaji>`（`constants/kana.ts` 的
  `kanaProgressKey` 是唯一构造器）。**禁止**页面手写 `'kana:' + id`；**禁止**把假名塞进
  `data/build/words.json` 或当成 `WORD` 用。
- **RK2 · 数据契约独立**：K 域数据单独产 `data/build/kana.json`，**不并入** `BuildData`
  （`ARCH §8.7` 数据契约冻结）；schema 独立在 `scripts/gen-data/kana-schema.ts`。
- **RK3 · 罗马音判定必须走变体表**：`romajiAliases` 显式枚举（`し = shi|si`），
  判定只用 `matchKanaRomaji`，**禁止**前缀 / 模糊匹配。同音异形对（`じ↔ぢ`、`ず↔づ`）
  由 `isRomajiQuizSafe` 判定并**自动降级为听音题**——不许维护黑名单。
- **RK4 · 依赖关系显式化**：关解锁用 `KanaGroup.prerequisiteGroupIds`，
  **禁止**从 `baseKanaId` 隐式推导；音表横轴用 `Kana.row`，**禁止**从罗马音前缀反推
  （`shi/chi/tsu/fu/ji/wo` 这些不规则音会反推错）。
- **RK5 · 隔离要连计数器一起管**：完成度 / 错词本 / 到期队列靠"假名不在 `words` 里"
  免费隔离，但 `todayNewCount` / `todayReviewCount` 是**计数器**——`store/actions.ts` 的
  `submitSelfEval` / `submitReviewResult` 内已显式跳过 `kana:` 前缀目标。改这两个 action 时
  不要"顺手简化"掉该判断（回归用例：`store/__tests__/kana-isolation.test.ts`）。

## 代码地图（高频符号）

| 符号 | 位置 | 作用 |
|---|---|---|
| `appStore` / `appActions` | `store/index.ts` / `store/hooks.ts` | 全局 store 与稳定 action 引用 |
| `createActions` | `store/actions.ts` | 唯一写入口（自评 / 跳过 / 复习 / 续学 / 打卡 / 设置） |
| `selectStageUnlocked` / `selectStageCompletion` / `selectContinueTarget` | `store/selectors.ts` | 阶段解锁、完成度、续学目标 |
| `stageCompletion` / `moduleCompletion` / `wordCompletion` | `engine/progress.ts` | 三级完成度（`hasContent=false` → `NO_CONTENT`） |
| `applySelfEval` / `applyReviewResult` / `applyPresented` | `engine/srs.ts` | SRS 五态机 |
| `evaluate` | `engine/jumpRules.ts` | J1–J6 跳转决策 |
| `beginStudy` / `applySelfEvaluation` / `evaluateSceneEffect` | `services/studySession.ts` | 学习会话编排 |
| `ttsController` | `services/ttsController.ts` | C1 发音控制器（三级链路，零静默） |
| `kanaCompletion` / `kanaGroupCompletion` / `overallKanaCompletion` | `engine/kana.ts` | K 域完成度（复用 `STATE_SCORE` / `mean`） |
| `isKanaGroupUnlocked` / `firstUnmasteredIndex` / `isKanaFullyMastered` | `engine/kana.ts` | K 域解锁 / 续学定位 / 结业判据 |
| `buildKanaQuestions` / `pickFinalQuizTargets` / `matchKanaRomaji` | `engine/kana.ts` | K2 出题底座（一关题 / 结业抽样）与罗马音判定 |
| `splitKanaMora` / `buildKanaGlyphIndex` | `engine/kana.ts` | P3 拆音（音拍切分 + 字形索引） |
| `kanaProgressKey` | `constants/kana.ts` | K 域进度 key 唯一构造器（`kana:` 前缀） |
| `selectKanaGateActive` / `selectKanaContinueTarget` / `selectKanaNextGroup` | `store/selectors.ts` | K 域门控 / 续学 / 局部导航 |
| `startKanaGroup` / `setKanaIndex` / `toggleKanaMemory` / `resetKanaProgress` | `store/actions.ts` | K 域写操作（自评 / 复习仍复用 W 域 action，只换 `targetId`） |
| `enterKanaGroup` / `revealKanaPeek` / `cancelKanaPeek` | `services/kanaWriteSession.ts` | K 域写会话编排（含 2s 偷看计时器） |
| `TTS.Synthesize` / `KVStore` / `System.SetClipboard` | `internal/services/*.go` | Go 侧服务 |

## 迁移背景

本项目由 Lynx / ReactLynx 工程迁移而来。系统性差异、排查手段与已修复项详见
[`docs/migration/PORTING-NOTES.md`](docs/migration/PORTING-NOTES.md)；
排查脚本在 `docs/migration/tools/`。子模块细则见 `frontend/src/engine/AGENTS.md`（TTS 细则下沉
`frontend/src/engine/tts/AGENTS.md`）、`frontend/src/store/AGENTS.md`、`frontend/src/services/AGENTS.md`、
`frontend/src/pages/AGENTS.md`、`frontend/src/components/AGENTS.md`、`frontend/src/constants/AGENTS.md`、
`frontend/src/router/AGENTS.md`、`frontend/src/types/AGENTS.md`、`frontend/tests/AGENTS.md`、
`internal/services/AGENTS.md`、`frontend/scripts/gen-data/AGENTS.md`。
