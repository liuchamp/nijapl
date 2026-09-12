# nijapl · Lynx → Wails v3 迁移 UI/UX 规格清单（核心学习链路）

> 参考源：`/Users/champliu/WorkBuddy/Worktrees/nijapl/tts-ref`（分支 `feat/tts`，commit `74e1595`）
> 目标栈：Wails v3 + WebView（标准浏览器环境）+ React + Vite
> 本文件为**只读调研产物**，未修改任何参考文件。
>
> **单位约定**：Lynx `rpx` 为「按 750rpx 设计宽度的响应式单位」，即 `1rpx = 视口宽 / 750`。
> 迁移时建议直接换算为 `1rpx = (100vw / 750)`，或统一定义 `--rpx: calc(100vw / 750)` 后用 `calc(var(--rpx) * N)`。
> 若目标是固定桌面窗口（Wails 常见），也可按「设计宽度 375px → 1rpx = 0.5px」固定换算（750rpx = 375px）。
> 下文所有尺寸均**原样保留 rpx 数值**，换算策略由你统一决定。

---

## 0. 全局设计令牌（`src/App.css` `:root` + `src/constants/theme.ts`）

CSS 变量与 JS 常量**同名同值**（`COLORS/SPACING/FONT/RADIUS` 是 JS 侧副本，供内联 style 用）。迁移后建议**只保留 CSS 变量**，删掉 JS 常量与内联 style。

| Token | CSS 变量 | 值 | JS 常量 |
|---|---|---|---|
| 背景 | `--color-bg` | `#0b1020` | `COLORS.bg` |
| 卡片面 | `--color-surface` | `#151b30` | `COLORS.surface` |
| 次级面 | `--color-surface-alt` | `#1d2540` | `COLORS.surfaceAlt` |
| 主文字 | `--color-text` | `#f5f7ff` | `COLORS.text` |
| 次文字 | `--color-text-muted` | `#9aa4c4` | `COLORS.textMuted` |
| 主色 | `--color-primary` | `#5b8cff` | `COLORS.primary` |
| 主色淡 | `--color-primary-soft` | `rgba(91,140,255,0.16)` | `COLORS.primarySoft` |
| 成功 | `--color-success` | `#39c47a` | `COLORS.success` |
| 警告 | `--color-warning` | `#f0b44a` | `COLORS.warning` |
| 危险 | `--color-danger` | `#ff5f6d` | `COLORS.danger` |
| 描边 | `--color-border` | `rgba(255,255,255,0.12)` | `COLORS.border` |
| 间距 xs/sm/md/lg/xl | `--space-*` | `8 / 16 / 24 / 32 / 48rpx` | `SPACING.*` |
| 字号 xs/sm/md/lg/xl | `--font-*` | `20 / 24 / 28 / 36 / 56rpx` | `FONT.*` |
| 圆角 sm/md/lg/pill | `--radius-*` | `8 / 16 / 24 / 999rpx` | `RADIUS.*` |

全局基线（必须复刻，否则文字颜色会跑掉）：

```css
:root { background-color: #0b1020; }
text { color: var(--color-text); }   /* Lynx：<text> 元素统一默认主文字色 */
```

**Web 端对应实现**：
```css
:root { /* 全部变量原样搬过来 */ }
body  { background-color: var(--color-bg); color: var(--color-text); }
/* Lynx 的 `text { color }` 规则消失；改为在 body/:root 上设 color，
   并让所有文本节点继承（不要给 span 单独 reset color）。 */
```

### 0.1 应用外壳（App / Shell / TabBar）

```
.App             flex column, width 100%, min-height 100vh, bg --color-bg
└─ .Shell        flex:1, flex column, width 100%
   ├─ .Shell-content  flex:1, flex column, width 100%   ← 路由出口
   └─ .TabBar    （仅当 pathname ∈ ['/', '/stages', '/grammar', '/review', '/me']）
```

```css
.TabBar {
  display: flex; flex-direction: row; align-items: center; justify-content: space-around;
  width: 100%; height: 110rpx;
  background-color: var(--color-surface);
  border-top: 1rpx solid var(--color-border);
}
.TabBar-item      { flex:1; display:flex; align-items:center; justify-content:center; height:100%; }
.TabBar-item--active { background-color: var(--color-primary-soft); }
.TabBar-label     { font-size: var(--font-sm); color: var(--color-text-muted); }
.TabBar-item--active .TabBar-label { color: var(--color-primary); font-weight: 700; }
```

Tab 文案（`src/constants/routes.ts` `TABS`）：`首页 / 阶段 / 语法 / 复习 / 我的`
点击跳转用 `navigate(tab.path)`，**不用 `<Link>`**（Lynx 无此组件）→ Web 端可直接换回 `<Link>` 或保留 `useNavigate`，UI 表现一致。

### 0.2 启动态（hydration 门控）

```css
.Splash        { flex:1; flex column; align-items:center; justify-content:center; }
.Splash-title  { font-size: var(--font-xl); font-weight:700; margin-bottom: var(--space-md); }
.Splash-hint   { font-size: var(--font-sm); color: var(--color-text-muted); }
```
文案：`JLPT N3 単語` / `正在恢复学习进度…`
行为：持久化恢复完成前渲染；store 侧有 **2500ms 看门狗**兜底强制 `hydrated=true`（`src/store/index.ts:110-116`），永不卡启动态。
**Wails 侧建议**：Go 启动时读取本地 JSON → 通过 Wails binding 注入，或仍用 `localStorage`；看门狗逻辑原样保留。

---

## 1. `src/pages/Home/index.tsx` + `index.css`（P0 首页仪表盘）

### 1.1 布局结构（自上而下，纵向）

```
.Home                       flex column, flex:1, width:100%, padding: 24rpx
├─ .Home-head               row, align-items:flex-end, justify-content:space-between
│  ├─ .Home-greeting        「欢迎回来」
│  └─ .Home-appName         「JLPT N3 単語」
├─ .Home-goal               row, align-items:center, margin-top 24rpx, padding 24rpx,
│  │                        bg --color-surface, radius 24rpx
│  ├─ <ProgressRing value label />
│  └─ .Home-goalSide        column, flex:1, margin-left 32rpx
│     ├─ .Home-goalTitle    「今日任务」
│     ├─ .Home-goalLine     「新学 {n}/20」
│     ├─ .Home-goalLine     「复习 {n}/35」
│     └─ .Home-goalLine     「语法 {n}/2」
├─ .Home-stats              row, align-items:center, justify-content:space-between, margin-top 24rpx
│  └─ ×4 .Home-stat         column, align-items:center, flex:1
│     ├─ .Home-statValue    数值（新学/复习/连续打卡 N天/今日到期）
│     └─ .Home-statLabel    标签
├─ .Home-primary            row center, width 100%, margin-top 32rpx,
│  │                        padding 24rpx 0, bg --color-primary, radius pill
│  └─ .Home-primaryLabel    「继续学习」/「开始学习」
├─ .Home-hint               （仅无 session 时）「还未开始学习，从第一个模块开始吧」
├─ .Home-section            column, margin-top 32rpx   ← 薄弱预警
│  ├─ .Home-sectionTitle    「薄弱预警」
│  ├─ .Home-sectionEmpty    （空态）「暂无薄弱词条」
│  └─ .Home-weakList        column, margin-top 16rpx
│     └─ ×N .Home-weakItem  row, space-between, padding 16rpx, margin-top 8rpx,
│                           bg --color-surface, radius 16rpx
│        ├─ .Home-weakKana      word.kana
│        └─ .Home-weakMeaning   word.meaning
└─ .Home-section            column, margin-top 32rpx   ← 阶段进度
   ├─ .Home-sectionHead     row, space-between
   │  ├─ .Home-sectionTitle 「阶段进度」
   │  └─ .Home-graphEntry   padding 8rpx 16rpx, bg --color-primary-soft, radius pill
   │     └─ .Home-graphLabel 「知识图谱」
   └─ .Home-stageList       column, margin-top 16rpx
      └─ ×N .Home-stageItem row, space-between, padding 16rpx, margin-top 8rpx,
                            bg --color-surface, radius 16rpx
         ├─ .Home-stageLeft    column
         │  ├─ .Home-stageName    stage.name
         │  └─ .Home-stagePercent 「{percent}%」或「冲刺期」
         └─ <NodeStateBadge state />
```

### 1.2 视觉样式明细

| 元素 | 字号 | 字重 | 颜色 | 其它 |
|---|---|---|---|---|
| `.Home-greeting` | `--font-lg` 36rpx | 700 | 继承 `--color-text` | |
| `.Home-appName` | `--font-xs` 20rpx | 400 | `--color-text-muted` | |
| `.Home-goalTitle` | 28rpx | 700 | 主文字 | margin-bottom 8rpx |
| `.Home-goalLine` | 24rpx | 400 | `--color-text-muted` | margin-top 8rpx |
| `.Home-statValue` | 36rpx | 700 | 主文字 | |
| `.Home-statLabel` | 20rpx | 400 | `--color-text-muted` | margin-top 8rpx |
| `.Home-primaryLabel` | 28rpx | 700 | **`--color-bg`（#0b1020 深字）** | 主色底 |
| `.Home-hint` | 20rpx | 400 | `--color-text-muted` | margin-top 16rpx |
| `.Home-sectionTitle` | 28rpx | 700 | 主文字 | |
| `.Home-sectionEmpty` | 24rpx | 400 | `--color-text-muted` | margin-top 16rpx |
| `.Home-graphLabel` | 20rpx | 400 | `--color-primary` | |
| `.Home-weakKana` | 28rpx | 400 | 主文字 | |
| `.Home-weakMeaning` | 24rpx | 400 | `--color-text-muted` | |
| `.Home-stageName` | 28rpx | 400 | 主文字 | |
| `.Home-stagePercent` | 20rpx | 400 | `--color-text-muted` | margin-top 8rpx |

### 1.3 文案原文（完整）

```ts
STRINGS.home = {
  greeting:        '欢迎回来',
  todayGoal:       '今日任务',
  newLearned:      '新学',
  reviewed:        '复习',
  grammarLearned:  '语法',
  streak:          '连续打卡',
  dayUnit:         '天',
  dueToday:        '今日到期',
  continueLearning:'继续学习',
  startLearning:   '开始学习',
  weakWarning:     '薄弱预警',
  weakEmpty:       '暂无薄弱词条',
  stageProgress:   '阶段进度',
  graphEntry:      '知识图谱',
  noSessionHint:   '还未开始学习，从第一个模块开始吧',
}
STRINGS.app.name = 'JLPT N3 単語'
STRINGS.stage.sprintTitle = '冲刺期'
```
拼接规则：
- 进度环 label：`${stats.newCount}/${DAILY_NEW_GOAL}` → 如 `7/20`
- 目标三行：`新学 7/20` / `复习 3/35` / `语法 1/2`（注意模板里有空格）
- 连续打卡：`${stats.streakDays}天`
- 阶段百分比：`${Math.round(completion*100)}%`；`completion < 0` 时显示 `0%`；`stage.hasContent === false` 时显示 `冲刺期`

### 1.4 交互行为

- **主按钮**：有 `target` → `goStudy(target.moduleId)`；无 `target`（数据为空）→ `goStages()`。
- **薄弱条目**：点击 → `goVocab(word.id)`。
- **知识图谱入口**：点击 → `goGraph()`。
- 按钮文案由 `hasSession`（`state.session.moduleId !== ''`）二选一，二者互斥。
- **无过渡/动画**：首页全部静态渲染，无 loading 态（数据来自打包进 bundle 的 JSON，同步可用）。
- 无错误态。
- `now = Date.now()` 在**渲染期直接调用**（非 memo），每次渲染重算；迁移到 React 严格模式会有双调用，建议 `useMemo(() => Date.now(), [])` 保持语义一致即可（不影响 UI）。

### 1.5 数据依赖

| 来源 | 取用 |
|---|---|
| store | `selectTodayStats(state, now)` → `newCount / reviewCount / grammarCount / streakDays / dueCount` |
| store | `selectContinueTarget(state)` → `{moduleId, index} \| null` |
| store | `selectWeakTop(state, 3)` → `Word[]`（`需强化`/`模糊` 且 `seen`，按 `wrongCount` 降序、id 升序，取前 3） |
| store | `state.session.moduleId`（判断 hasSession） |
| store | `selectStageCompletion(state, stage.id)`、`selectStageNodeState(state, stage.id)` |
| repository | `repository.getStages()`（按 `order` 升序） |
| 常量 | `DAILY_NEW_GOAL=20`、`DAILY_REVIEW_GOAL=35`、`DAILY_GRAMMAR_GOAL=2`（`src/constants/srs.ts`） |
| Word 字段 | `id / kana / meaning` |
| Stage 字段 | `id / name / hasContent` |

注：`newRatio = stats.newCount / DAILY_NEW_GOAL`（**未夹取**，>1 由 `ProgressRing.clamp01` 收敛）。

### 1.6 Lynx 特有写法 → Web 改写

| # | Lynx 写法 | Web 实现 |
|---|---|---|
| 1 | `<view className="Home">` | `<div className="Home">` |
| 2 | `<text className="Home-greeting">{...}</text>` | `<span>`（建议：块级文案用 `<div>`/`<p>`，保持 `display:block` 以免破坏 block 布局；行内片段用 `<span>`） |
| 3 | `catchtap={() => ...}` | `onClick={...}`（Lynx `catchtap` = 点击 + 阻止冒泡；Web 用 `onClick` + 需要时 `e.stopPropagation()`） |
| 4 | `rpx` 单位 | CSS `calc(var(--rpx) * N)` 或构建期 PostCSS 插件转 `px/rem` |
| 5 | `STRINGS.*` 静态文案 | 原样搬，建议落到 `src/constants/strings.ts` 不改 |
| 6 | `useAppStore((snapshot) => snapshot)` 全量订阅 | Web 端同样可用（zustand v4），但建议改成细粒度 selector 减重渲染；**UI 表现无差异** |
| 7 | `repository` 同步 JSON import | Wails 下可继续 Vite `import`/`fetch('/data/*.json')`，或改为 Go binding 提供 |

---

## 2. `src/pages/Study/index.tsx` + `index.css`（P2 词汇学习，最复杂）

### 2.1 布局结构

```
.Study                      flex column, flex:1, width:100%, padding: 24rpx
├─ .Study-head              row, align-items:center, justify-content:space-between
│  ├─ .Study-back           padding 8rpx 16rpx, bg --color-surface-alt, radius pill
│  │  └─ .Study-backLabel   「返回」
│  ├─ .Study-title          「词汇学习」/「复习模式」
│  └─ .Study-progress       「卡片进度 3/12」
├─ .Study-fallback          （条件）「可左右滑动或点按「上一张 / 下一张」翻页」  色 --color-warning
├─ .Study-stage             row, flex:1, width:100%, margin-top 24rpx   ← 卡片容器
│  └─ 容器（三选一，见 2.4）
│     └─ .Study-item ×N     row, center, flex-shrink:0, width:100%, padding:24rpx
│        └─ <WordCard />
├─ .Study-eval              row, space-between, gap 16rpx, margin-top 24rpx
│  └─ ×3 .Study-evalBtn     flex:1, row center, padding 24rpx 0, radius 16rpx, border 1rpx
│     │                     --unknown 底 rgba(255,95,109,0.16)
│     │                     --vague   底 rgba(240,180,74,0.16)
│     │                     --known   底 rgba(57,196,122,0.16)
│     └─ .Study-evalLabel   「不认识」/「模糊」/「认识」   28rpx / 700 / --color-text
├─ .Study-nav               row, space-between, gap 16rpx, margin-top 24rpx
│  ├─ .Study-navBtn 「上一张」   flex:1, padding 16rpx 0, bg --color-surface-alt, radius pill
│  ├─ .Study-wrong 「本次答错 N」 padding 0 16rpx（不可点，catchtap 空实现）
│  ├─ .Study-navBtn 「跳过」
│  └─ .Study-navBtn 「下一张」
├─ .Study-graphHint         （条件，J4 命中）「知识图谱」  20rpx / --color-primary
└─ <DetailSheet visible mode word settings onConfirm onDismiss />
```

**空态**（`words.length === 0`）：只渲染 `.Study-head` + `.Study-empty`（flex:1 居中）→ `.Study-emptyLabel`「该模块暂无词条」（28rpx / `--color-text-muted`）。此时**不渲染** eval / nav / 容器。

### 2.2 视觉样式明细

| 元素 | 样式 |
|---|---|
| `.Study-title` | 36rpx / 700 |
| `.Study-progress` | 20rpx / `--color-text-muted` |
| `.Study-backLabel` | 24rpx / `--color-text` |
| `.Study-fallback` | 20rpx / `--color-warning` / margin-top 16rpx |
| `.Study-evalBtn` | `flex:1; padding: 24rpx 0; border-radius: 16rpx; border: 1rpx solid var(--color-border)` |
| `.Study-evalLabel` | 28rpx / 700 / `--color-text` |
| `.Study-navBtn` | `flex:1; padding: 16rpx 0; border-radius: 999rpx; background: var(--color-surface-alt)` |
| `.Study-navLabel` | 24rpx / `--color-text` |
| `.Study-wrongLabel` | 20rpx / `--color-text-muted` |
| `.Study-graphHint` | 20rpx / `--color-primary` / margin-top 16rpx |

⚠️ `.Study-item` 的 `flex-shrink: 0` 是**必需的**（源码注释：否则 item 被压缩会导致子项 UI 尺寸异常）。Web 用 `scroll-snap` 时同样必须保 `flex: 0 0 100%`。

### 2.3 文案原文（完整）

```ts
STRINGS.study = {
  title:           '词汇学习',
  reviewTitle:     '复习模式',
  emptyModule:     '该模块暂无词条',
  webFallbackHint: '可左右滑动或点按「上一张 / 下一张」翻页',
  cardProgress:    '卡片进度',
  selfEvalUnknown: '不认识',
  selfEvalVague:   '模糊',
  selfEvalKnown:   '认识',
  detailedEntry:   '进入详解',   // 本页未使用（预留）
  sessionWrong:    '本次答错',
}
STRINGS.common = { back:'返回', next:'下一张', prev:'上一张', skip:'跳过', flip:'看释义', flipBack:'看假名', times:'次' }
```
拼接：`卡片进度 ${safeIndex + 1}/${words.length}`；`本次答错 ${state.runtime.sessionWrongCount}`

### 2.4 交互行为（★核心，含 Lynx 特有降级）

**序号夹取（60301 修复，必须复刻）**
```ts
const maxIndex  = Math.max(words.length - 1, 0)
const safeIndex = Math.min(Math.max(Number.isFinite(index) ? index : 0, 0), maxIndex)
```
全页（容器属性 / 当前词 / 进度文案 / 传给 WordCard 的 `isCurrent`）**统一用 `safeIndex`**，非有限值（NaN / Infinity / 脏持久化）归 0。

**容器三级降级**（`slideMode` + `containerBroken`）

| 级别 | 条件 | 渲染 | 翻页方式 |
|---|---|---|---|
| ① `<viewpager>` | `slideMode === 'viewpager'`（**默认关闭**，`services/platform.ts` `viewpagerEnabled=false`，Web 宿主必为 `scroll`） | `<viewpager initial-select-index>` + `<viewpager-item>` | 原生手势 |
| ② 横向 `<scroll-view>` | 默认（`slideMode === 'scroll'`） | `<scroll-view scroll-orientation="horizontal" initial-scroll-to-index>` + 子节点 `flatten={false}` | 原生手势 |
| ③ 单卡片 | `containerBroken`（`pagerFailCount >= 2`） | 只渲染 `renderCard(word, revealed)` | 纯按钮翻页 |

- `PAGER_FAIL_LIMIT = 2`：首次挂载必 seek 一次（`pagerIndexRef` 初值 `-1`），失败重建后再试一次，两次不行即永久降级单卡片。
- `pagerKey = ${PAGER_ID}-${moduleId}-${pagerToken}`：`pagerToken` **仅在宿主不支持程序化翻页时自增**（`onUnsupported`），失败不无限重建。
- 换模块（`moduleId` 变化）：`studySession.beginStudy(moduleId)` + `setRevealed(false)` + `pagerIndexRef.current = -1`（**不**自增 pagerToken）。
- `.Study-fallback` 提示仅当 `slideMode === 'scroll' || containerBroken` 时显示。

**手势**：**不再**用 `services/swipe.ts`（该文件当前是**死代码**，仅被单测引用，源码注释明确「不再把左滑绑成跳过」）。翻页完全交给容器原生滚动 + 底部按钮。

**卡片可见副作用**（依赖 `[word?.id]`）
1. `studySession.presentCurrentCard()` → `未学 → 学习中`（展示即转态，幂等）
2. `setEffect(studySession.evaluateSceneEffect(word))`（J3/J4/J5/J6）
3. `setRevealed(false)`（换卡自动收起释义）
4. `ttsController.clearNotice()`（清掉上一张卡的 TTS 提示）
5. `ttsPrefetch.schedule(nextWord.kana, settings)`（预取**下一个词**的假名；失败静默）

**自评三档**
```
onSelfEval('不认识'|'模糊'|'认识')
  → studySession.applySelfEvaluation(word.id, selfEval)
  → outcome.effect → detailSheetModeFor(effect)
  → 命中 J1/J2（sheetMode !== null）→ appActions.openDetailSheet(word.id, mode)，停在当前词
  → 未命中 → advance(1)
```
**跳过**：`studySession.skipCurrentWord(word.id)` → `advance(1)`（与滑动解耦）
**上一张/下一张**：`studySession.stepIndex(∓1)`（内部 `setCurrentIndex` 再次夹取）
**整卡发音**：点卡片任意空白 → `ttsController.speak(word.kana, settings)`（`WordCard` 根节点 `bindtap`）
**浮层**：`查看详解` → `closeDetailSheet()` + `goVocab(wordId)`；`忽略，继续` → `closeDetailSheet()` + `advance(1)`；点遮罩 = 忽略
**复习模式判定**：`location.search.includes('mode=review')` → 标题改「复习模式」（仅标题差异，其余完全一致）

**加载态 / 空态 / 错误态**
- 加载态：无（数据同步）
- 空态：`words.length === 0` 早返回（见 2.1）
- 错误态：容器降级提示（`.Study-fallback`，警告色文案）+ TTS 降级提示（在 `TtsButton` 内，见 §7）
- 边界：`word === undefined` 时所有副作用 `return`；`renderCard` 在 `containerBroken` 分支下对 `undefined` 渲染 `null`

### 2.5 数据依赖

| 来源 | 取用 |
|---|---|
| route | `useParams<{moduleId}>()`、`useLocation().search`（`mode=review`） |
| repository | `repository.getModuleWords(moduleId)` |
| store | `state.runtime.currentIndex`、`state.runtime.detailSheet`（`{visible, mode}`）、`state.runtime.sessionWrongCount` |
| store | `useSettings()` → `settings`（`rate/pitch/autoSpeakOnCard/unlockRuleEnabled`） |
| service | `detectSlideMode()`、`seekPager()`、`studySession.*`、`ttsController`、`ttsPrefetch`、`detailSheetModeFor` |
| WordCard 字段 | `id / kana / kanji / pos / meaning` |

### 2.6 Lynx 特有写法 → Web 改写（★重点）

| # | Lynx 写法 | Web 实现建议 |
|---|---|---|
| 1 | `<viewpager>` / `<viewpager-item>` / `<scroll-view scroll-orientation="horizontal">` / `flatten={false}` | **全部删除**。用 CSS Scroll Snap：`overflow-x:auto; scroll-snap-type: x mandatory;` + 子项 `scroll-snap-align:center; flex:0 0 100%`，并 `scrollbar-width:none` 隐藏滚动条 |
| 2 | `initial-select-index` / `initial-scroll-to-index` | 挂载时 `el.scrollTo({ left: index * el.clientWidth, behavior:'auto' })`，或用 CSS `scroll-behavior:smooth` + `scrollIntoView` |
| 3 | `bindchange={(e) => ...event.detail.index}` | 监听 `scrollend`（Chromium 新版可用）+ `IntersectionObserver` 交叉比判定当前页；回写 `setCurrentIndex`。**注意防抖**，避免滚动中反复 seek 造成抖动（原实现用 `pagerIndexRef` 防回环，Web 端同样需要一个 ref 记录「程序化定位目标」） |
| 4 | `services/pagerSeek.ts`（`lynx.createSelectorQuery()` + `invoke('selectTab'/'scrollTo')`） | **整层删除**。改为 `ref.current.scrollTo({left, behavior:'smooth'})`，同步可靠，不会有 `onUnsupported`/`onFail` 分支 |
| 5 | `services/platform.ts`（`SystemInfo.platform` 探测 / `viewpagerEnabled` 开关） | **删除**，`slideMode` 恒为 `'scroll'` |
| 6 | `containerBroken` / `pagerFailCount` / `pagerToken` 三级降级 | **删除**。Web 的 scroll-snap 不会创建失败；保留「单卡片」无意义 |
| 7 | `.Study-fallback` 提示 | 建议**保留**（Web 端确实靠滑动/按钮翻页，文案仍成立），或直接删除（原注释说这是降级提示）。若追求像素级复刻且 `slideMode==='scroll'` 恒定 → 该提示在原实现中**恒显示**，复刻则应恒显示 |
| 8 | `catchtap` / `bindtap` | `onClick`；`bindtap`（冒泡）→ 普通 `onClick`；`catchtap`（阻止冒泡）→ `onClick={e => {e.stopPropagation(); ...}}` |
| 9 | `flatten={false}` 属性 | 删除（Web 无此概念） |
| 10 | `import { useEffect, useMemo, useRef, useState } from '@lynx-js/react'` | 改为 `from 'react'` |
| 11 | `import { useLocation, useParams } from 'react-router'` | 保持（react-router v6 在 Web 下原生可用） |
| 12 | `svg content={string}`（ProgressRing） | 见 §8 |

---

## 3. `src/pages/VocabDetail/index.tsx` + `index.css`（P3 词汇详解）

### 3.1 布局结构

```
.Vocab                      flex column, flex:1, width:100%, padding: 24rpx
├─ .Vocab-head              row, center, space-between
│  ├─ .Vocab-back           padding 8rpx 16rpx, bg --color-surface-alt, radius pill → 「返回」
│  └─ .Vocab-title          「词汇详解」  28rpx / 700
├─ .Vocab-notFound          （未找到）margin-top 48rpx, text-align:center, 28rpx, muted
│
├─ .Vocab-hero              column, align-items:center, margin-top 24rpx,
│  │                        padding 32rpx, bg --color-surface, radius 24rpx
│  ├─ .Vocab-kana           word.kana            56rpx / 700
│  ├─ .Vocab-kanji          kanji==='' ? kana : kanji   36rpx / muted / margin-top 8rpx
│  └─ .Vocab-heroRow        row, space-between, width:100%, margin-top 24rpx
│     ├─ .Vocab-pos         word.pos             20rpx / muted
│     └─ <TtsButton text={word.kana} label="再听一次" />
├─ .Vocab-block  「释义」    column, margin-top 24rpx, padding 24rpx, bg surface, radius 24rpx
│  ├─ .Vocab-blockTitle     「释义」  28rpx / 700
│  └─ .Vocab-meaning        word.meaning   36rpx / margin-top 16rpx
├─ .Vocab-block  「记忆状态」 column
│  ├─ .Vocab-blockHead      row, space-between
│  │  ├─ .Vocab-blockTitle  「记忆状态」
│  │  └─ <NodeStateBadge state={progress?.state ?? '未学'} />
│  └─ .Vocab-memoryLine     「累计答错 {n}次」  24rpx / muted / margin-top 16rpx
├─ .Vocab-block  「动词变形」 （conjugation.length > 0 才渲染）
│  ├─ .Vocab-blockTitle     「动词变形」
│  └─ .Vocab-conjTable      column, margin-top 16rpx
│     └─ ×5 .Vocab-conjRow  row, space-between, padding 8rpx 0, border-bottom 1rpx solid --color-border
│        ├─ .Vocab-conjForm   「辞書形/ます形/て形/た形/ない形」 24rpx / muted
│        └─ .Vocab-conjValue  值  28rpx
├─ .Vocab-block  「关联词」  （relatedWords.length > 0 才渲染）
│  ├─ .Vocab-blockTitle     「关联词」
│  └─ .Vocab-chips          row, flex-wrap, margin-top 16rpx
│     └─ ×N .Vocab-chip     padding 8rpx 24rpx, margin-right 16rpx, margin-bottom 16rpx,
│                           bg --color-primary-soft, radius pill
│        └─ .Vocab-chipLabel  目标词（kanji || kana || toId）  24rpx / --color-primary
└─ .Vocab-block  「例句」
   ├─ .Vocab-blockTitle     「例句」
   ├─ .Vocab-empty          （空态）「暂无例句」  24rpx / muted / margin-top 16rpx
   └─ ×N .Vocab-sentence    column, margin-top 16rpx, padding 16rpx,
                            bg --color-surface-alt, radius 16rpx
      ├─ <GrammarHighlightText text={sentence.ja} ranges onTapGrammar />
      ├─ .Vocab-sentenceZh        sentence.zh   24rpx / muted / margin-top 8rpx
      └─ .Vocab-sentenceFallback  （有缺偏移语法点时）pattern 用 ' / ' 拼接
                                  20rpx / --color-primary / margin-top 8rpx
```

### 3.2 视觉样式补充

- 例句高亮嵌套文本（`components/GrammarHighlightText/index.css`）：
  - `.Ght` / `.Ght-seg`：28rpx，`line-height: 1.6`
  - `.Ght-seg--word`（当前词条命中）：`background-color: var(--color-primary-soft); border-radius: 8rpx`
  - `.Ght-seg--grammar`（未掌握语法命中，可点）：`color: var(--color-primary); text-decoration: underline`

### 3.3 文案原文（完整）

```ts
STRINGS.vocab = {
  title:       '词汇详解',
  kana:        '读音',       // 本页未直接使用
  pos:         '词性',       // 本页未直接使用
  meaning:     '释义',
  conjugation: '动词变形',
  related:     '关联词',
  sentences:   '例句',
  memory:      '记忆状态',
  wrongCount:  '累计答错',
  noSentences: '暂无例句',
  notFound:    '未找到该词条',
}
STRINGS.tts.replay = '再听一次'
STRINGS.common.times = '次'
```
变形形名（引擎硬编码，`engine/conjugation.ts`）：`辞書形 / ます形 / て形 / た形 / ない形`（**日文体，必须原样**）

### 3.4 交互行为

- **返回** → `nav.back()`
- **TTS** → `TtsButton` 读 `word.kana`
- **关联词 chip** → 目标存在则 `nav.goVocab(target.id)`；目标 `undefined` 时点击**无反应**（`catchtap` 里 `if (target !== undefined)`）
- **例句语法高亮片段** → `nav.goGrammarDetail(grammarId)`；仅 `.Ght-seg--grammar` 且 `grammarId !== undefined` 时绑定
- **效果门控**（`effect`）：
  - `effect.showConjugation` → 渲染变形表（`buildConjugationTable(word)` 非动词返回 `[]` → 区块不渲染）
  - `effect.showRelated` → 渲染关联词 chips（`word.related ?? []`）
  - `effect.highlightGrammarIds` → 传给 `buildSentenceHighlight`
- **预取**：`useEffect` 依赖 `[wordId]`，对**前 2 条**例句调 `ttsPrefetch.schedule(sentence.ja, settings)`（失败静默）
- **空态**：`sentenceRenders.length === 0` → 「暂无例句」
- **未找到态**：`word === undefined` → 早返回，只有 head + 「未找到该词条」（居中，margin-top 48rpx）
- **无滚动容器**：Lynx 页面本身不可滚动（页面无 `scroll-view`），内容超高会被裁切 ⚠️ → **Web 端必须给 `.Vocab` 加 `overflow-y:auto`**，否则长内容不可达（这是 Lynx 原实现的一个实际缺陷，迁移时建议补上）

### 3.5 数据依赖

| 来源 | 取用 |
|---|---|
| route | `useParams<{wordId}>()` |
| repository | `getWordById(wordId)` / `getSentencesByWord(word.id)` / `getWordById(relation.toId)` / `getGrammarById(grammarId)?.pattern` |
| store | `state.progress[word.id]` → `state` / `wrongCount`；`useSettings()` |
| service | `studySession.evaluateSceneEffect(word)`（scene 触发，评估 J3/J4/J5/J6） |
| engine | `buildConjugationTable(word)` / `buildSentenceHighlight(sentence, wordId, effect.highlightGrammarIds)` |
| Word 字段 | `id / kana / kanji / pos / meaning / related[]` |
| Sentence 字段 | `id / ja / zh / words[] / grammars[]` |

### 3.6 Lynx 特有写法 → Web 改写

| # | Lynx | Web |
|---|---|---|
| 1 | 嵌套 `<text>` 实现富文本高亮（`GrammarHighlightText`） | `<span>` 嵌套即可；`text-decoration: underline` 在 `span` 上原生生效（Lynx 里是 `<text>` 属性） |
| 2 | 页面不可滚动 | 加 `overflow-y: auto`（见 3.4 ⚠️） |
| 3 | `text-align: center`（`.Vocab-notFound`） | 原生可用 |
| 4 | `useMemo(() => repository.getWordById(wordId), [wordId])` | 保持 |
| 5 | `import { useEffect, useMemo } from '@lynx-js/react'` | `from 'react'` |

---

## 4. `src/pages/Quiz/index.tsx` + `index.css`（P8 自测）

### 4.1 布局结构

```
.Quiz                       flex column, flex:1, width:100%, padding: 24rpx
├─ .Quiz-head               row, center, width:100%, margin-bottom 16rpx
│  ├─ .Quiz-back            padding 8rpx 16rpx, bg --color-surface-alt, radius pill → 「返回」
│  └─ .Quiz-title           flex:1, text-align:center, 36rpx / 700 → 「自测」
├─ .Quiz-modes              row, center, width:100%, margin-bottom 24rpx
│  └─ ×3 .Quiz-mode         flex:1, row center, padding 8rpx 0, margin-right 8rpx,
│     │                     bg --color-surface-alt, radius pill
│     │                     .Quiz-mode--on → bg --color-primary
│     └─ .Quiz-modeLabel    「日→中」/「中→日」/「听音选词」  24rpx / --color-text
│
├─ [questions.length === 0]  .Quiz-empty  「暂无可出题的词条」  28rpx / muted / margin-top 32rpx
├─ [done]  .Quiz-result      column, align-items:center, padding 48rpx
│  ├─ .Quiz-resultTitle      「本轮完成」  36rpx / 700 / margin-bottom 16rpx
│  ├─ .Quiz-resultScore      「得分 6/8」  56rpx / --color-primary / margin-bottom 32rpx
│  └─ .Quiz-restart          padding 16rpx 32rpx, bg --color-surface-alt, radius pill
│     └─ .Quiz-restartLabel  「再测一次」  28rpx / --color-text
└─ [进行中] .Quiz-body       column, width:100%
   ├─ .Quiz-progress         「题目 3/8」  20rpx / muted
   ├─ .Quiz-promptLabel      「请选择正确释义」/「请选择正确假名」/「请选择听到的词」  24rpx / muted / margin-top 16rpx
   ├─ listen 模式 → .Quiz-listen  row, margin 16rpx 0 24rpx
   │  └─ <TtsButton text={question.answer} label="播放发音" />
   │  否则 → .Quiz-prompt       56rpx / 700 / margin-top 16rpx / margin-bottom 24rpx
   ├─ .Quiz-options          column, width:100%
   │  └─ ×≤4 .Quiz-option    row, align-items:center, padding 24rpx, margin-bottom 16rpx,
   │     │                   bg --color-surface, radius 16rpx, border 1rpx solid --color-border
   │     │                   --correct → bg rgba(57,196,122,0.2) + border --color-success
   │     │                   --wrong   → bg rgba(255,95,109,0.2) + border --color-danger
   │     └─ .Quiz-optionLabel  option.text   28rpx / --color-text
   └─ [picked !== null] .Quiz-feedback   column, margin-top 16rpx
      ├─ .Quiz-feedbackText   正确 → 「回答正确」(--ok: --color-success)
      │                       错误 → 「回答错误 · 正确答案: {answer}」(--bad: --color-danger)
      │                       24rpx
      └─ .Quiz-next           row center, padding 24rpx 0, margin-top 16rpx,
                              bg --color-primary, radius pill
         └─ .Quiz-nextLabel   「下一题」/「看结果」（最后一题）  28rpx / 700 / --color-bg
```

### 4.2 文案原文（完整）

```ts
STRINGS.quiz = {
  title:        '自测',
  modeJaZh:     '日→中',
  modeZhJa:     '中→日',
  modeListen:   '听音选词',
  promptJaZh:   '请选择正确释义',
  promptZhJa:   '请选择正确假名',
  promptListen: '请选择听到的词',
  listen:       '播放发音',
  correct:      '回答正确',
  wrong:        '回答错误',
  next:         '下一题',
  finish:       '看结果',
  done:         '本轮完成',
  score:        '得分',
  restart:      '再测一次',
  empty:        '暂无可出题的词条',
  progressLabel:'题目',
  answerLabel:  '正确答案',
  back:         '返回',
}
```
拼接：`题目 ${index+1}/${questions.length}`；`得分 ${score}/${questions.length}`；错误反馈 `回答错误 · 正确答案: ${question.answer}`（注意用的是半角冒号+空格 `': '`）

### 4.3 交互行为

**状态机**（组件内 `useState`，**不进 store**）：`mode / index / picked / score / done`

| 行为 | 逻辑 |
|---|---|
| 切题型 | `switchMode(next)`：相同则 no-op；否则 `setMode` + `resetRound()`（index/picked/score/done 全清） |
| 选项点击 | `choose(i)`：`picked !== null`（已作答）或 `question === undefined` → **直接 return（不可改答）**；否则 `setPicked(i)` + 正确则 `score+1` + `appActions.submitSelfEval(question.wordId, 正确?'认识':'不认识')`（回写 SRS） |
| 下一题 | `next()`：`questions.length===0` → return；`index+1 >= questions.length` → `setDone(true)`；否则 `index+1` + `picked=null` |
| 再测一次 | `resetRound()`（**不**重新出题，`questions` 是 `useMemo` 依赖 `[words, mode]`，模式未变题目不变） |
| 返回 | `nav.back()` |

**着色规则**（作答后固定）：
```
optionIndex === question.answerIndex → --correct（即使没被点，也标出正确答案）
optionIndex === picked 且非正确      → --wrong
其余 → 默认
```
`.Quiz-feedback` **仅在 `picked !== null` 时出现**（作答前无反馈区）。
`.Quiz-next` 按钮文案最后一题为「看结果」。

**出题规则**（`services/quiz.ts`，确定性无随机）：
- `QUIZ_COUNT = 8`，池 = `words.filter(w => w.meaning !== '' && w.kana !== '')`
- 池大小 `< 2` → 返回 `[]` → 走 `.Quiz-empty`
- 选项数 `OPTION_COUNT = 4`（1 正确 + ≤3 干扰）；干扰项取 `pool[(i+step) % total]`，跳过同 id / 同文本 / 重复文本
- `answerIndex = questions.length % (distractors.length + 1)`，`options.splice(answerIndex, 0, answer)`
- 干扰项为 0 时该题 `continue`（跳过）
- `ja-zh`：题面 = `kanji || kana`，选项 = `meaning`
- `zh-ja`：题面 = `meaning`，选项 = `kana`
- `listen`：题面 = 空串（改渲染 TtsButton），选项 = `kana`，`question.answer` 是假名（TTS 朗读文本）

**听音降级**：`listen` 模式渲染 `TtsButton`，TTS 不可用时由 `TtsButton` 展示「明确提示 + 复制假名 + 假名文本」（零静默失败）——**不**额外显示题面假名。

**边界**：`question !== undefined ? ... : null`（`questions` 非空但 index 越界 → 渲染 null，理论上不会发生）。无加载态、无动画。

### 4.4 数据依赖

| 来源 | 取用 |
|---|---|
| repository | `repository.getAllWords()` |
| store | `useSettings()`（rate/pitch）→ 传给 TtsButton；`appActions.submitSelfEval` 写进度 |
| service | `buildQuizQuestions(words, mode, 8)` / `isAnswerCorrect(question, optionIndex)` |
| Word 字段 | `id / kana / kanji / meaning` |

### 4.5 Lynx 特有写法 → Web 改写

| # | Lynx | Web |
|---|---|---|
| 1 | `catchtap` | `onClick`（选项无需 stopPropagation，无父级热区） |
| 2 | `let className = 'Quiz-option'; if (...) className += ' ...'` 字符串拼接 | 建议 `clsx`/模板串，注意保留**类名顺序与层叠顺序**（`--correct`/`--wrong` 必须在基础类之后以覆盖背景与边框） |
| 3 | `<text className="Quiz-optionLabel">` | `<span>`（`.Quiz-option` 是 flex row + align-items center，span 作为 flex item 正常） |
| 4 | `import { useMemo, useState } from '@lynx-js/react'` | `from 'react'` |
| 5 | 页面不可滚动 | 8 题单页不超高，可不加滚动；保险起见加 `overflow-y:auto` |

---

## 5. `src/pages/Review/index.tsx` + `index.css`（P7 复习）

### 5.1 布局结构

```
.Review                     flex column, flex:1, width:100%, padding: 24rpx
├─ .Review-title            「复习」  36rpx / 700
├─ .Review-summary          column, align-items:center, margin-top 24rpx,
│  │                        padding 24rpx, bg --color-surface, radius 24rpx
│  ├─ .Review-summaryValue  due.length   56rpx / 700 / --color-primary
│  └─ .Review-summaryLabel  「待复习」   24rpx / muted / margin-top 8rpx
├─ .Review-start            row center, margin-top 24rpx, padding 24rpx 0,
│  │                        bg --color-primary, radius pill
│  │                        .Review-start--disabled → opacity: 0.5
│  └─ .Review-startLabel    「开始复习」  28rpx / 700 / --color-bg
├─ .Review-section          column, margin-top 32rpx   ← 今日到期
│  ├─ .Review-sectionTitle  「今日到期」  28rpx / 700
│  ├─ .Review-empty         （空态）「今日没有到期内容」  24rpx / muted / margin-top 16rpx
│  └─ .Review-list          column, margin-top 16rpx
│     └─ ×N <WordRow />  = .Review-row  row, space-between, padding 16rpx,
│                          margin-top 8rpx, bg --color-surface, radius 16rpx
│        ├─ .Review-rowKana      word.kana      28rpx
│        └─ .Review-rowMeaning   word.meaning   24rpx / muted
└─ .Review-section          column, margin-top 32rpx   ← 错词本
   ├─ .Review-sectionTitle  「错词本」
   ├─ .Review-empty         （空态）「暂无错词，继续保持！」
   └─ .Review-list → WordRow ×N
```

### 5.2 文案原文（完整）

```ts
STRINGS.review = {
  title:     '复习',
  dueTitle:  '今日到期',
  weakTitle: '错词本',
  dueCount:  '待复习',
  start:     '开始复习',
  dueEmpty:  '今日没有到期内容',
  weakEmpty: '暂无错词，继续保持！',
}
```

### 5.3 交互行为

- **开始复习**：`firstDue !== undefined` → `nav.goStudy(firstDue.moduleId, { mode: 'review' })`；无到期词 → `catchtap` 内 `if` 短路（**点击无效**），但**按钮仍可见**，仅通过 `.Review-start--disabled`（`opacity: 0.5`）表达不可用。⚠️ 注意：`aria-disabled` / `pointer-events` 都没有，是纯视觉禁用。
- **词条行**（两个列表共用 `WordRow`）：点击 → `nav.goVocab(word.id)`
- 无加载态、无动画、无错误态
- `now = Date.now()` 渲染期直算

### 5.4 数据依赖

| 来源 | 取用 |
|---|---|
| store | `selectTodayReviewQueue(state, now)` → `Word[]`（`dueTargetIds(progress, now)` 到期目标 → 词条） |
| store | `selectWeakWords(state)` → `Word[]`（`需强化`/`模糊` + `seen`，按 `wrongCount` 降序、id 升序） |
| Word 字段 | `id / kana / meaning / moduleId` |
| 导航 | `nav.goStudy(moduleId, {mode:'review'})` → `/study/:moduleId?mode=review` |

### 5.5 Lynx 特有写法 → Web 改写

| # | Lynx | Web |
|---|---|---|
| 1 | `<view className="Review-row" catchtap>` | `<div onClick>`（整行可点；建议加 `cursor:pointer`，Lynx 端没有光标概念但 Web 端「可点」暗示是体验一致的必要项） |
| 2 | 列表无虚拟化 | 数据规模小（种子数据仅数十词），Web 端直接 `map` 即可；若未来词库变大建议 `content-visibility:auto` |
| 3 | 页面不可滚动 | ⚠️ 错词本可能很长，Web 端 `.Review` 需 `overflow-y:auto` |
| 4 | `function WordRow(props: {word, onTap})` 内联子组件 | 保持 |

---

## 6. `src/components/WordCard/index.tsx` + `index.css`（P2 学习卡片）

### 6.1 布局结构

```
.WordCard                   column, align-items:center, width:100%,
│                           padding 32rpx, bg --color-surface, radius 24rpx,
│                           border 1rpx solid --color-border
│                           ★ 根节点 bindtap = onSpeak（整卡热区发音）
├─ .WordCard-top            row, center, space-between, width:100%
│  ├─ nodeState !== undefined ? <NodeStateBadge/> : <view className="WordCard-topSpacer"/>
│  │                            （spacer: 1rpx × 1rpx，占位保持 space-between 布局）
│  └─ .WordCard-pos         word.pos   20rpx / muted
├─ .WordCard-kana           word.kana          56rpx / 700 / --color-text / margin-top 32rpx
├─ .WordCard-kanji          kanji==='' ? kana : kanji   36rpx / muted / margin-top 16rpx
├─ .WordCard-actions        row, center, gap 24rpx, margin-top 32rpx
│  ├─ .WordCard-reveal      padding 16rpx 24rpx, bg --color-surface-alt, radius pill
│  │  │                     ★ catchtap（阻止冒泡到整卡热区）
│  │  └─ .WordCard-revealLabel  revealed ? '看假名' : '看释义'   24rpx / --color-text
│  └─ <TtsButton text={word.kana} label="再听一次" />
└─ revealed ? .WordCard-meaningBox : .WordCard-hint
   ├─ .WordCard-meaningBox  margin-top 32rpx, padding 24rpx, bg --color-surface-alt,
   │  │                     radius 16rpx, width:100%
   │  └─ .WordCard-meaning  word.meaning   36rpx / --color-text / text-align:center
   └─ .WordCard-hint        「点击卡片发音」  20rpx / muted / margin-top 32rpx
```

### 6.2 视觉样式要点

- 卡片是**唯一带 1rpx 描边**的容器（其余卡片区块无描边）
- `padding: 32rpx`（比页面 24rpx 更大）
- 整卡 `align-items: center` → 除 `.WordCard-top`（`width:100%` + `space-between`）与 `.WordCard-meaningBox`（`width:100%`）外全部水平居中
- `revealed` 与 `!revealed` 两种尾部区块**高度不同**（释义框 vs 一行提示），会引发布局跳动 —— 原实现无过渡动画，迁移时若要「体验级复刻」应保持**无动画**；若要增强，可加 `transition` 但属偏差

### 6.3 文案原文（完整）

```ts
STRINGS.common.flip     = '看释义'
STRINGS.common.flipBack = '看假名'
STRINGS.tts.tapToSpeak  = '点击卡片发音'
STRINGS.tts.replay      = '再听一次'
```

### 6.4 交互行为

| 手势 | 位置 | 行为 |
|---|---|---|
| 点击卡片**任意空白处** | `.WordCard` 根（`bindtap`，冒泡） | `props.onSpeak()` → 父层 `ttsController.speak(word.kana, settings)` |
| 点击「看释义 / 看假名」 | `.WordCard-reveal`（`catchtap` 阻止冒泡） | `props.onToggleReveal()` → 父层 `setRevealed(prev => !prev)`，**不发音** |
| 点击 TTS 按钮 | `TtsButton` 内部（`catchtap` ×2 层） | 发音一次，**不触发整卡热区**（防重播两次） |

- 组件**无自身状态**、**无数据写入**（`markPresented` 由 Study 页统一调用）
- `revealed` 由父层传入；Study 页对**非当前卡片**强制传 `false`（`renderCard(cardWord, cardIndex === safeIndex)` → `isCurrent ? revealed : false`），即滑动到相邻卡片时释义自动收起
- `nodeState` prop 在 Study 页**未传**（`WordCardProps.nodeState` 可选，Study 页不传 → 恒渲染 1rpx spacer）。VocabDetail 页不用 WordCard。→ **复刻时该徽章恒不显示**，但 prop 与 spacer 分支要保留以备后用。

### 6.5 数据依赖

| 来源 | 取用 |
|---|---|
| props | `word: Word`（`id/kana/kanji/pos/meaning`）、`settings`、`revealed`、`onToggleReveal`、`onSpeak`、`nodeState?` |
| 组件 | `NodeStateBadge`、`TtsButton` |

### 6.6 Lynx 特有写法 → Web 改写

| # | Lynx | Web |
|---|---|---|
| 1 | `bindtap`（冒泡，可被子节点 `catchtap` 阻止） | 根节点 `onClick`；子节点 `onClick={e => {e.stopPropagation(); ...}}`。**必须保留 stopPropagation**，否则点「看释义」会同时发音 |
| 2 | `catchtap` ×2（reveal 按钮、TtsButton 外壳 + 内层） | 同上 |
| 3 | `<text className="WordCard-hint">` | `<span>`；注意 `.WordCard` 是 flex column + `align-items:center`，`<text>`/`<span>` 作为 flex item 会被拉伸为 block 行为，居中由父级 `align-items` 保证 → Web 端 `span` 作 flex item 同样成立 |
| 4 | `.WordCard-topSpacer { width:1rpx; height:1rpx }` | 保留（0 尺寸会被 flex 忽略，用 1rpx 保占位） |
| 5 | `gap: var(--space-md)` | Web 原生支持（Lynx 也支持，无差异） |

---

## 7. `src/components/TtsButton/index.tsx`（发音按钮 / C1 语音入口）

⚠️ **本组件没有配套 CSS 文件**（`TtsButton/index.css` 不存在）。所有样式**仅在 JSX 内联 style 中**；`className` 仅为语义标记，无任何规则命中。这是迁移时最容易漏掉的坑。

### 7.1 结构（全部内联 style）

```
<view className="TtsButton" catchtap={stopBubble}>        ← 空函数，只为阻断冒泡
├─ <view className="TtsButton-main" catchtap={speak}>     ← 真正触发
│  │   style: backgroundColor / borderRadius=pill / padding: 16rpx 24rpx
│  └─ <text className="TtsButton-label"
│          style: color / fontSize=FONT.sm(24rpx) / fontWeight=700
│      >{props.label ?? '再听一次'}</text>
└─ [notice !== null] <view className="TtsButton-notice">   ← 降级提示块（无样式！）
   ├─ <text className="TtsButton-noticeText" style={{color: warning}}>{notice}</text>
   ├─ <view className="TtsButton-copy" catchtap={copyKana}
   │  │   style: bg=surfaceAlt / radius=sm(8rpx) / padding: 8rpx 16rpx
   │  └─ <text className="TtsButton-copyLabel" style={{color:text, fontSize:xs(20rpx)}}>复制假名</text>
   ├─ <text className="TtsButton-kana" style={{color:text, fontSize:md(28rpx)}}>假名：{text}</text>
   └─ [copyNotice !== null] <text className="TtsButton-copyNotice"
          style={{color:textMuted, fontSize:xs(20rpx)}}>{copyNotice}</text>
```

### 7.2 视觉样式（从内联 style 反推，需落成 CSS）

| 元素 | 规则 |
|---|---|
| `.TtsButton-main` 默认（variant=`solid`） | `background-color: var(--color-primary-soft)`（`rgba(91,140,255,0.16)`）；`border-radius: 999rpx`；`padding: 16rpx 24rpx` |
| `.TtsButton-main` variant=`ghost` | `background-color: rgba(91,140,255,0.10)`（**硬编码，无 token**） |
| `.TtsButton-main` **speaking 中** | `background-color: var(--color-primary)` `#5b8cff`（**优先级最高，覆盖 variant**） |
| `.TtsButton-label` | `font-size: 24rpx`；`font-weight: 700`；`color: speaking ? var(--color-bg) : var(--color-primary)` |
| `.TtsButton-notice` | **无任何样式** → Lynx 默认 `display:linear`（≈ 纵向堆叠）。Web 端 `<div>` 默认 block，子元素（span/span/div/span）会按 block/inline 混排 → **必须显式补 `display:flex; flex-direction:column;`** 才能复刻 |
| `.TtsButton-noticeText` | `color: var(--color-warning)`；字号未设（继承默认） |
| `.TtsButton-copy` | `background: var(--color-surface-alt)`；`border-radius: 8rpx`；`padding: 8rpx 16rpx` |
| `.TtsButton-copyLabel` | `color: var(--color-text)`；`font-size: 20rpx` |
| `.TtsButton-kana` | `color: var(--color-text)`；`font-size: 28rpx` |
| `.TtsButton-copyNotice` | `color: var(--color-text-muted)`；`font-size: 20rpx` |

### 7.3 文案原文（完整）

```ts
STRINGS.tts = {
  tapToSpeak:       '点击卡片发音',
  replay:           '再听一次',
  unsupportedTitle: '当前环境不支持语音',
  unsupportedBody:  '当前运行环境不支持日语语音合成，请用「复制假名」自行朗读。',
  noJaVoice:        '当前环境缺少日语语音包，已降级为「复制假名」。',
  blocked:          '首次播放需在点击内触发，请再点一次「试听」。',
  serviceDown:      '语音服务暂时不可用，已尝试系统语音；仍无声请用「复制假名」。',
  serviceRejected:  '语音服务拒绝了本次请求（参数或语种异常），请用「复制假名」。',
  noPlayer:         '当前环境没有可用的音频播放器，请用「复制假名」。',
  error:            '语音播放失败，请重试或使用「复制假名」。',
  copyKana:         '复制假名',
  copied:           '假名已复制到剪贴板',
  copyFallback:     '当前环境无剪贴板权限，假名如下，请手动复制',
  copyTitle:        '假名',
}
```
拼接：`假名：${props.text}`（全角冒号）

### 7.4 交互行为（含时序，★必须精确复刻）

`speak()` 顺序严格为 **① 视觉反馈 → ② 能力检测 → ③ 出声 → ④ 失败给明确文案**：

```
① 同步 patch：speakingText = text；lastText = text；notice = null；fallbackText = null
   （不 await 任何东西 → 保证「点击 ≤100ms 有反馈」）
①' 同步 ttsPort.prime?.()   ← Web 必需：手势调用栈内解锁自动播放
② 启动保持计时器 holdMs = clamp(text.length * 150, 500, 1800)
   到点后若 speakingText 仍是该 text → patch(speakingText: null)
② 能力检测：capability = ttsPort.getCapability()
   'unsupported' → 清计时器 + speakingText:null + notice=unsupportedBody + fallbackText=text → 返回
③ await ttsPort.speak(text, {rate, pitch})
④ !ok → 清计时器 + speakingText:null + notice=describeTtsFailure(reason) + fallbackText=text
   ok 且 capability==='gesture-required' → notice = blocked（**不清 speakingText**）
```

- **视觉反馈最短 500ms / 最长 1800ms / 每字符 +150ms**
- **失败原因 → 文案映射**（`describeTtsFailure`）：
  `no-tts→unsupportedBody` / `no-ja-voice→noJaVoice` / `blocked→blocked` / `service-unavailable→serviceDown` / `service-rejected→serviceRejected` / `no-player→noPlayer` / 其它→`error`
- **同一页面上多个 TtsButton 通过文本隔离状态**：`speaking = state.speakingText === props.text`；`notice = state.lastText === props.text ? state.notice : null`；`copyNotice = state.fallbackText === props.text ? state.copyNotice : null`
- **`copyKana(text)`**：`copyText(text)`（先 `lynx.setClipboardData`，后 `navigator.clipboard.writeText`，都失败返回 `false`）→ 成功 `已复制到剪贴板`，失败 `当前环境无剪贴板权限，假名如下，请手动复制`，两种都把 `fallbackText` 设为该 text
- **`clearNotice()`**：清除 `notice` + `copyNotice`（Study 页换卡时调用）
- **订阅方式**：`useSyncExternalStore(ttsController.subscribe, getState, getState)`（class 内 `getState`/`subscribe` 为箭头函数稳定引用）
- **零静默失败红线**：任何失败都必须有明确文案 + 假名兜底

### 7.5 数据依赖

| 来源 | 取用 |
|---|---|
| props | `text`（恒为 `word.kana`）、`settings`（`rate/pitch`）、`label?`（默认 `再听一次`）、`variant?: 'solid'\|'ghost'`（默认 `solid`） |
| service | `ttsController`（`subscribe/getState/speak/copyKana`）、`copyText`（`services/clipboard.ts`） |
| 引擎 | `ttsPort`（HTTP 合成+播放 → 原生 TTS → Web speechSynthesis → 明确失败） |

### 7.6 Lynx 特有写法 → Web 改写

| # | Lynx | Web |
|---|---|---|
| 1 | **全内联 style**（`style={{...}}` 对象） | 迁移为 CSS 类 + CSS 变量；`background` 的值仍是三态分支 → 建议 `data-speaking` / `data-variant` 属性选择器或 `className` 修饰类 |
| 2 | `catchtap={stopBubble}`（空函数只为止冒泡） | `onClick={e => e.stopPropagation()}` |
| 3 | `import { useSyncExternalStore } from '@lynx-js/react'` | `from 'react'`（API 完全一致） |
| 4 | `lynx.setClipboardData` 优先 | Web 端直接用 `navigator.clipboard.writeText`（**必须 https 或 localhost**；Wails WebView 需注意：wails 使用自定义 scheme 时 `navigator.clipboard` 可能不可用 → 建议补 Go 侧剪贴板 binding 作为第三级兜底） |
| 5 | `ttsPort.prime()` 手势内解锁 | Web 端**必需**：`<audio>` 播静音 data URI 解锁自动播放（`SILENT_AUDIO_DATA_URI`）。在 Wails WebView 下同样应保留；若 Wails 无自动播放限制可 no-op |
| 6 | `COLORS/SPACING/FONT/RADIUS` JS 常量 | 直接换 CSS 变量，删 JS 常量 |

---

## 8. `src/components/ProgressRing/index.tsx`（今日目标进度环）

⚠️ **同样没有配套 CSS 文件**。`.ProgressRing` / `.ProgressRing-svg` / `.ProgressRing-label` 均无样式规则（`.ProgressRing-label` 只继承 `text { color }`）。

### 8.1 结构

```
<view className="ProgressRing">
├─ <svg className="ProgressRing-svg" content={svg字符串} style={{width:`${size}rpx`, height:`${size}rpx`}} />
└─ <text className="ProgressRing-label">{label}</text>
```

### 8.2 SVG 生成（`buildRingSvg`，纯字符串）

```ts
size = props.size ?? 160        // rpx
stroke = props.stroke ?? 14     // rpx
radius = Math.max((size - stroke) / 2, 1)     // = 73
circumference = 2πr                            // ≈ 458.67
dash = circumference * progress
center = size / 2                              // = 80
轨道： <circle r=73 fill=none stroke=#1d2540 (surfaceAlt) stroke-width=14 />
进度弧：<circle ... stroke=#5b8cff (primary) stroke-linecap=round
         stroke-dasharray="{dash} {circumference - dash}"
         transform="rotate(-90 80 80)" />      ← 从 12 点方向起画
<svg width=160 height=160 viewBox="0 0 160 160" xmlns=...>…</svg>
```
- `progress = clamp01(value)`：NaN → 0，其余 min/max 收敛到 [0,1]
- `label = props.label ?? `${Math.round(progress*100)}%``（Home 页传的是 `${newCount}/${DAILY_NEW_GOAL}`）

### 8.3 视觉参数汇总

| 项 | 值 |
|---|---|
| 直径 | 160rpx（宽高均由内联 style 指定） |
| 环宽 | 14rpx |
| 半径 | 73rpx |
| 轨道色 | `--color-surface-alt` `#1d2540` |
| 进度色 | `--color-primary` `#5b8cff` |
| 端点 | `stroke-linecap: round` |
| 起始角 | -90°（12 点） |
| label | 无样式（继承 `--color-text`，默认字号） |

### 8.4 交互 / 数据

- 纯展示，无交互、无动画（`progress` 变化时**整个 SVG 字符串重建重绘**，非 CSS transition）
- 数据：仅 `props`（`value` / `size?` / `stroke?` / `label?`）

### 8.5 Lynx 特有写法 → Web 改写（★重点）

| # | Lynx | Web |
|---|---|---|
| 1 | `<svg content={string}>`（Lynx 特有：把整段 SVG **字符串**静态渲染，不依赖 DOM） | **直接内联 JSX SVG**：`<svg viewBox="0 0 160 160"><circle …/><circle …/></svg>`。这是本次迁移收益最大的一处：Web 下可直接用 React 渲染 `<circle>`，无需拼字符串 |
| 2 | 进度变化重建字符串触发重绘 | Web 下用 `stroke-dasharray = ${dash} ${c-dash}` 直接绑定；**可选**加 `transition: stroke-dasharray .3s` 做补间（原实现无过渡，加了属体验增强/偏差） |
| 3 | `style={{width:`${size}rpx`, height:`${size}rpx`}}` | CSS `width/height: calc(var(--rpx) * 160)` |
| 4 | `COLORS.primary` / `COLORS.surfaceAlt` JS 常量 | `stroke="var(--color-primary)"`（内联 SVG 属性支持 CSS 变量） |
| 5 | `.ProgressRing-label` 无样式 | Web 端需补：建议 `text-align:center; font-size: var(--font-sm); margin-top: var(--space-xs)` 以匹配 Lynx 默认堆叠观感（原实现未定义，请先截图/实测确认再定） |

---

## 9. `src/components/DetailSheet/index.tsx` + `index.css`（C2 半屏详解浮层）

### 9.1 布局结构

```
.Sheet                      position:fixed; left/top/right/bottom: 0;
│                           flex column; justify-content: flex-end
├─ .Sheet-mask              position:fixed; inset 0; background: rgba(0,0,0,0.55)
│                           ★ catchtap = onDismiss（点遮罩 = 忽略，且阻止穿透到下层卡片热区）
└─ .Sheet-panel             position:relative; flex column; width:100%;
                            padding: 32rpx; background: var(--color-surface);
                            border-top-left-radius: 24rpx; border-top-right-radius: 24rpx;
                            border-top: 1rpx solid var(--color-border)
   ├─ .Sheet-title          36rpx / 700
   ├─ .Sheet-body           24rpx / muted / margin-top 8rpx
   ├─ .Sheet-word           column, align-items:center, margin-top 32rpx,
   │  │                     padding 24rpx, bg --color-surface-alt, radius 16rpx
   │  ├─ .Sheet-wordKana      word.kana   56rpx / 700
   │  ├─ .Sheet-wordKanji     kanji===''?kana:kanji   28rpx / muted / margin-top 8rpx
   │  └─ .Sheet-wordMeaning   word.meaning  28rpx / margin-top 16rpx
   └─ .Sheet-actions        row, center, space-between, gap 24rpx, margin-top 32rpx
      ├─ .Sheet-dismiss     flex:1, row center, padding 24rpx 0,
      │  │                  bg --color-surface-alt, radius pill
      │  └─ .Sheet-dismissLabel 「忽略，继续」  28rpx / --color-text-muted
      └─ .Sheet-confirm     flex:1, row center, padding 24rpx 0,
         │                  bg --color-primary, radius pill
         └─ .Sheet-confirmLabel 「查看详解」  28rpx / 700 / --color-bg
```

⚠️ 注意：`.Sheet-panel` 的 `border-top-left-radius` / `border-top-right-radius` 是**分开写的两个属性**（Lynx 不支持 `border-radius: 24rpx 24rpx 0 0` 简写？原文如此）——Web 端可保留分写或改简写，视觉等价。

### 9.2 文案原文（完整）

```ts
STRINGS.detailSheet = {
  autoTitle:    '第一次遇到这个词',
  autoBody:     '要不要看看它的详解？',
  promptTitle:  '连续答错了',
  promptBody:   '建议先看详解，再继续学习。',
  confirm:      '查看详解',
  dismiss:      '忽略，继续',
}
```
模式判定：`isAuto = props.mode !== 'prompt'` → **`auto` 是默认分支**（`mode` 为 `null`/`undefined` 时也走 auto 文案）

### 9.3 交互行为

| 触发 | 行为 |
|---|---|
| 点遮罩 `.Sheet-mask` | `onDismiss`（`stopPropagation` 语义，Lynx `catchtap` 阻止穿透到下层卡片热区） |
| 「忽略，继续」 | `onDismiss` → Study 页 `closeDetailSheet()` + `advance(1)` |
| 「查看详解」 | `onConfirm(word.id)` → Study 页 `closeDetailSheet()` + `nav.goVocab(wordId)` |
| 渲染门控 | `!props.visible \|\| props.word === undefined` → **返回 `null`**（不渲染任何 DOM） |

- **无入场/出场动画**（原实现 `position:fixed` 直接出现）。若要「体验级复刻」应保持无动画；若增强，建议 mask `opacity` + panel `translateY(100%)→0` 过渡，属偏差需标注。
- 无 loading / 错误态。

### 9.4 数据依赖

| 来源 | 取用 |
|---|---|
| props | `visible`、`mode: 'auto'\|'prompt'\|null`、`word: Word\|undefined`、`settings`（**本组件未使用，仅透传**）、`onConfirm`、`onDismiss` |
| 上层 | Study 页传 `state.runtime.detailSheet.{visible, mode}` + 当前 `word` |
| Word 字段 | `id / kana / kanji / meaning` |

### 9.5 Lynx 特有写法 → Web 改写

| # | Lynx | Web |
|---|---|---|
| 1 | `position: fixed` + `inset:0` | 完全一致；Web 端建议补 `z-index`（Lynx 靠文档顺序，Web 需显式层级，如 `z-index: 100`） |
| 2 | `catchtap` 防穿透 | `onClick` + `e.stopPropagation()`；另外 Web 端建议**锁背景滚动**（`overflow:hidden`）以匹配移动端浮层观感 |
| 3 | `border-top-left-radius` / `border-top-right-radius` 分写 | 可改 `border-radius: 24rpx 24rpx 0 0` |
| 4 | 返回 `null` 门控 | 保持（Web 端同样不渲染 DOM，无残留） |
| 5 | 无 CSS `display` 声明于 `.Sheet-dismiss/.Sheet-confirm`（只有 `flex:1`） | Web 端 `div` 需显式 `display:flex`（否则 `align-items/justify-content` 不生效）⚠️ |

---

## 10. 支撑 Services（UI 依赖说明）

### 10.1 `src/services/studySession.ts` —— 学习会话编排（页面 ↔ store 的薄层）

**UI 依赖它做什么**：Study 页所有写操作的唯一通道；VocabDetail 用它做 scene 评估。

| API | UI 调用点 | 作用 |
|---|---|---|
| `beginStudy(moduleId)` | Study `useEffect([moduleId])` | `startStudy` action → 读 `session.lastWordIndex` 断点定位起始序号、清零 `sessionWrongCount`、关浮层 |
| `presentCurrentCard(now?)` | Study `useEffect([word?.id])` | **展示即转态**：`未学 → 学习中`（幂等，非「未学」态为空操作）。这是「学习中」的**唯一入口** |
| `stepIndex(delta)` | Study `advance(±1)` | `setCurrentIndex(current+delta)`，返回**夹取后**的下标 |
| `goToIndex(index)` | — | 同上，绝对定位 |
| `applySelfEvaluation(wordId, selfEval, now?)` | Study `onSelfEval` | 走 `submitSelfEval` → SRS 推进 + 会话计数 + 跳转评估；返回 `{decisions, effect}` |
| `skipCurrentWord(wordId, now?)` | Study `onSkip` | `skipWord` → `学习中 → 未学`，不计分 |
| `evaluateSceneEffect(word)` | Study（卡片可见）、VocabDetail | scene 触发的 J3/J4/J5/J6 评估（**不评估 J1/J2**，二者只由 selfEval 触发） |
| `emptyStudyEffect()` | 两页初值 | 全 false 的 effect |
| `currentWord()` / `getModuleWords(id)` | 备用 | 直接读 vanilla store |

**红线**：只调用 action，不自行改状态；不引入 React 绑定（可在 Node 端到端测试）。
**迁移建议**：该文件**几乎可原样搬**（只依赖 zustand vanilla + repository），是本次迁移成本最低的模块。

### 10.2 `src/services/quiz.ts` —— 出题（纯函数）

**UI 依赖**：Quiz 页 `buildQuizQuestions(words, mode, 8)` 生成题目 + `isAnswerCorrect(q, i)` 判定。
**关键约束**（影响 UI）：
- **确定性无随机** → 同输入恒同输出（单测可覆盖）。迁移时**不要**改成 shuffle。
- 池 `< 2` → `[]` → 触发 `.Quiz-empty`「暂无可出题的词条」
- 每题 ≤4 选项；`answerIndex` 由 `questions.length % (distractors.length+1)` 决定 → **正确答案位置固定且可预测**（第 1 题通常在 index 0）
- `question.answer`：listen 模式下是**假名**（作为 TTS 朗读文本与「正确答案」展示文本共用）
- `promptFor`：`ja-zh` → `kanji || kana`；`zh-ja` → `meaning`；`listen` → `''`（UI 据此改渲染 TtsButton）
**迁移建议**：原样搬，零改动。

### 10.3 `src/services/ttsController.ts` —— C1 语音单例（UI 状态源）

**UI 依赖**：`TtsButton` 通过 `useSyncExternalStore` 订阅其状态；Study 页直接调 `speak` / `clearNotice`。

状态快照（`TtsControllerState`，不可变）：
`speakingText | lastText | capability | notice | fallbackText | copyNotice`

**UI 可观察到的 4 种视觉态**：
1. **空闲**：`speakingText !== text` → 按钮 `primarySoft` 底 + `primary` 字
2. **朗读中**：`speakingText === text` → 按钮 `primary` 底 + `bg` 字（深字），持续 `clamp(len*150, 500, 1800)ms`
3. **失败/降级**：`notice !== null` → 按钮下方展开提示块（警告色文案 + 复制假名按钮 + `假名：xxx`）
4. **已复制反馈**：`copyNotice !== null` → 提示块底部追加一行（成功绿？不 —— 是 `textMuted` 色）

**迁移注意**：
- `capability` 初值在构造时同步探测（`ttsPort.getCapability()`），Web 下 `speechSynthesis` 存在即 `supported`
- `stop()` 存在但**当前 UI 未调用**（无停止按钮）
- `HOLD_MIN_MS=500` / `HOLD_MAX_MS=1800` / `HOLD_PER_CHAR_MS=150` 三个常量决定高亮时长，必须复刻以保证「点击有反馈」的手感
- **Wails 特殊**：WebView 里 `speechSynthesis` 通常可用；HTTP TTS 服务（`TTS_BASE_URL` 默认 `http://127.0.0.1:8000`）可由 Go 侧内置或外置。若 Wails 走 `wails://` scheme，`fetch` 到 `http://127.0.0.1` 会有 **CORS / mixed-content** 问题 → 建议改为**走 Go binding 代理 TTS 请求**（在 `ttsPort` 层替换 source，UI 层零改动）。

### 10.4 `src/services/ttsPrefetch.ts` —— 预取编排（纯优化）

**UI 依赖**：Study 页预取「下一个词的假名」；VocabDetail 预取「前 2 条例句」。
**UI 可见性**：**零可见**——失败静默（唯一静默例外，设计 §12.5），不写 notice、不走降级链、无文案、无 loading。
**机制**：队列 + 并发上限 `TTS_PREFETCH_MAX_CONCURRENCY = 2`；`ttsPort.prefetch` 为 fire-and-forget，用「每 tick 释放槽位」（`setTimeout(...,0)`）近似节流；空文本直接 return；`clear()` 切模块/卸载时调用（**当前两页均未调用 `clear()`**）。
**迁移建议**：原样搬；Wails 下浏览器原生并发更可控，可改为 `Promise` 池，但 UI 表现不变。

### 10.5 `src/services/pagerSeek.ts` —— 程序化翻页（★Lynx 特有，Web 端整层删除）

**UI 依赖**：Study 页用它把容器定位到 `safeIndex`，并据此触发三级降级。
- `PAGER_ID = 'study-pager'`，`PAGER_SELECTOR = '#study-pager'`
- `seekPager({mode, index, onUnsupported, onFail})`：`lynx.createSelectorQuery().select('#study-pager').invoke({method: mode==='viewpager' ? 'selectTab' : 'scrollTo', params:{index, smooth:true}, fail}).exec()`
- **无 SelectorQuery** → `onUnsupported()`（能力缺失，仅重建重试，**不**判容器坏）
- **有 SelectorQuery 但 invoke fail** → `onUnsupported()` + `onFail()`（容器 UI 未创建的强信号 → 累计 2 次永久降级单卡片）

**迁移结论**：Web 端**删除整个文件**。改为 `containerRef.current.scrollTo({left: safeIndex * width, behavior:'smooth'})`，同步可靠、无失败分支 → `pagerFailCount` / `pagerToken` / `containerBroken` / `.Study-fallback` 的降级逻辑全部可简化（但 `.Study-fallback` 文案是否保留需你决策，见 §2.6 #7）。

### 10.6 `src/services/swipe.ts` —— 手势判定（★当前死代码）

- 唯一导出 `classifySwipe(dx, dy, threshold): 'left'|'right'|'none'`
- 规则：`!isFinite(dx)||!isFinite(dy)` → `none`；`|dy| >= |dx| * 1 && |dy| > 0` → `none`（纵向优先，防误触）；`|dx| < threshold` → `none`；否则 `dx<0 ? 'left' : 'right'`
- **全仓库只有单测引用它**，`src/pages/Study` 已按 Ruling 2 / N3 改为「保留容器原生手势翻页，不再把左滑绑成跳过」

**迁移结论**：**不要**把它接回 UI（会与原生横向滚动冲突、且语义已废弃）。若希望保留「左滑跳过」作为增强，需另行设计（如垂直卡片内手势区），属**偏差**。建议：迁移时**连同单测一起删除**，或保留文件但不接线（避免误导）。

### 10.7 相关 service（非清单指定，但与上述链路耦合）

| 文件 | 作用 |
|---|---|
| `services/jumpService.ts` | `toStudyEffect(decisions)` 把 J1–J6 决策翻成 `{autoDetail, promptDetail, highlightGrammarIds, promptGraph, showConjugation, showRelated}`；`detailSheetModeFor(effect)` J1 优先于 J2 |
| `services/platform.ts` | `detectSlideMode()` → 当前**恒返回 `'scroll'`**（`viewpagerEnabled=false`）。Web 端删除 |
| `services/highlight.ts` | `buildSegments`（越界/非整数/`end<=start` 区间忽略，词与语法可重叠）+ `buildSentenceHighlight`（缺偏移语法 → `missingGrammarIds`） |
| `services/clipboard.ts` | `copyText`：先 `lynx.setClipboardData` 后 `navigator.clipboard.writeText`，失败返回 `false` |
| `engine/conjugation.ts` | `buildConjugationTable(word)`：非动词返回 `[]`；一段/サ変/カ変/五段，含 `行く→いって`、`ある→ない` 两个例外 |

---

## 11. Lynx → Web 改写总清单（Checklist）

### 11.1 标签映射

| Lynx | Web |
|---|---|
| `<view>` | `<div>` |
| `<text>` | `<span>`（若该节点是父 flex 容器唯一子节点且需 block 行为 → 用 `<div>`/`<p>`；**不要无脑全换 span**，会破坏 `margin-top` 等 block 间距与 `text-align`） |
| `<viewpager>` / `<viewpager-item>` | CSS Scroll Snap 容器 / 子项 |
| `<scroll-view scroll-orientation="horizontal">` | `overflow-x:auto` + `scroll-snap-type: x mandatory` |
| `<svg content={string}>` | 内联 JSX `<svg>`（或直接 `<img src={dataUri}>`，但推荐 JSX 以便绑变量） |

### 11.2 属性 / 事件映射

| Lynx | Web |
|---|---|
| `bindtap` | `onClick`（冒泡） |
| `catchtap` | `onClick` + `e.stopPropagation()` |
| `flatten={false}` | 删除 |
| `initial-select-index` / `initial-scroll-to-index` | 挂载后 `scrollTo` |
| `bindchange` (`event.detail.index`) | `scrollend` / `IntersectionObserver` |
| `className="a b"` | 同 |
| `style={{ camelCase }}` | CSS 类 + CSS 变量（保留少量动态值内联） |

### 11.3 单位

- 全部 `Nrpx` → `calc(var(--rpx) * N)`，或构建期转换
- `1rpx` 边框：`border: 1rpx solid` → `calc(var(--rpx) * 1)`（桌面固定窗口下可能 <1px 被舍入，建议 `max(1px, calc(var(--rpx)))`）
- `999rpx` pill → 直接 `9999px` 或 `999rpx`

### 11.4 必须删除 / 替换的 Lynx 专有模块

1. `services/pagerSeek.ts`（SelectorQuery / invoke）
2. `services/platform.ts`（`SystemInfo.platform` / viewpager 开关）
3. `services/swipe.ts`（死代码）
4. `ProgressRing` 的 SVG 字符串拼接 → JSX SVG
5. `@lynx-js/react` 的 `useEffect/useMemo/useRef/useState/useSyncExternalStore` → `react`
6. `root.render`（`src/index.tsx`）→ `createRoot(...).render(...)`
7. `MemoryRouter` → Web 下可换 `BrowserRouter`/`HashRouter`（**Wails 建议保留 `MemoryRouter`**：无地址栏，且避免 `wails://` scheme 下的路由问题）
8. `lynx.setClipboardData` → `navigator.clipboard`（+ Go binding 兜底）
9. 内联 style 中的 `COLORS/SPACING/FONT/RADIUS` JS 常量 → CSS 变量

### 11.5 必须**新增**的 Web 侧补偿（Lynx 不需要）

| 项 | 说明 |
|---|---|
| `z-index` | `.Sheet`（浮层）、`.TabBar` 需显式层级，Lynx 靠文档顺序 |
| `overflow-y: auto` | `.Vocab` / `.Review` / `.Study` 页面在 Lynx 下不可滚动，内容超高会被裁切；Web 端必须补滚动（这是**体验修复**，非偏差） |
| `cursor: pointer` | 所有可点区块（Lynx 无光标概念，Web 端不给会显得不可点） |
| `user-select: none` | 卡片/按钮长按会选中文本，破坏「整卡热区发音」手感 |
| 背景滚动锁 | `.Sheet` 打开时锁 body 滚动 |
| `scroll-behavior` / `-webkit-overflow-scrolling` | 页面滚动惯性（贴近移动端手感） |
| 滚动条隐藏 | `scroll-snap` 容器的横向滚动条（`scrollbar-width:none; ::-webkit-scrollbar{display:none}`） |
| 字体 | Lynx 用宿主系统字体；Web 端需显式 `font-family`（含日文字形，避免中文优先渲染导致日文假名字形不符） |
| CORS / scheme | `fetch` 到 `http://127.0.0.1:8000` 的 TTS 服务在 `wails://` 下会失败 → 改走 Go binding 代理 |

### 11.6 已知「原实现即如此」的细节（复刻时勿「顺手修好」）

1. `Home` 主按钮 `newRatio` **未夹取**（>1 由 ProgressRing 收敛）
2. `Home` 阶段百分比 `completion < 0` 显示 `0%`（冲刺期单独走 `冲刺期` 文案）
3. `Study` 的 `safeIndex` 夹取（NaN → 0）
4. `Quiz` 切题型后 `resetRound` 但 `questions` 是 `useMemo([words, mode])` → 同模式重测题目不变
5. `Quiz` 选项点击后**不可改答**（`picked !== null` 早 return）
6. `Quiz` 的 `--correct` 会高亮**正确答案**（即使未点中）
7. `Review` 的开始复习按钮是**视觉禁用**（`opacity:0.5`），点击仍绑定但内部短路
8. `TtsButton` 的 `ghost` variant 背景 `rgba(91,140,255,0.10)` **硬编码无 token**
9. `TtsButton` / `ProgressRing` / `NodeStateBadge` **无 CSS 文件**，样式全在内联 style
10. `WordCard` 的 `nodeState` prop 在 Study 页**从不传** → 徽章恒不显示（渲染 1rpx spacer）
11. `DetailSheet` 的 `settings` prop **未被组件使用**
12. `swipe.ts` 是死代码；Study 页翻页不与「跳过」耦合
13. `VocabDetail` / `Review` 页面在原实现下**不可滚动**（内容超高被裁切）
14. `ttsController.stop()` 已实现但 UI 无入口

---

## 12. 附：路由与导航（供前端骨架参考）

```ts
ROUTES = {
  home:'/', stages:'/stages', grammar:'/grammar', review:'/review', me:'/me',
  study:'/study/:moduleId', vocab:'/vocab/:wordId',
  grammarDetail:'/grammar/:grammarId', graph:'/graph', quiz:'/quiz',
}
studyPath(moduleId, 'review') → `/study/:moduleId?mode=review`
vocabPath(wordId)             → `/vocab/:wordId`
```
TabBar 显隐判定：`TAB_PATHS.includes(location.pathname)`（二级页不显示 TabBar）。
导航统一走 `useNavigation()`（语义方法：`goHome/goStages/goGrammarList/goReview/goMe/goStudy/goVocab/goGrammarDetail/goGraph/goQuiz/back`），**不用 `<Link>`**。Web 端可保留该 hooks 层（内部 `useNavigate`），UI 无差异。
