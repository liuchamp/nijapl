# nijapl · Lynx → Wails v3 迁移 UI/UX 规格清单（应用外壳 / StageMap / Graph / 语法 / Me / 通用组件）

> 参考源：`/Users/champliu/WorkBuddy/Worktrees/nijapl/tts-ref`（分支 `feat/tts`，commit `74e1595`）
> 目标栈：Wails v3 + WebView（标准浏览器环境）+ React + Vite
> 本文件为**只读调研产物**，未修改任何参考文件（`tts-ref` 目录保持只读）。
> 姊妹篇：`docs/migration/spec-ui-core.md` —— 核心学习链路（Home / Study / VocabDetail / Quiz / Review / WordCard / TtsButton / ProgressRing / DetailSheet）；本文件覆盖其**未覆盖**的外壳、路由、P1 阶段地图、P4/P5 语法、P6 图谱、P9 我的与通用组件。
>
> **单位约定**：Lynx `rpx` 为「按 750rpx 设计宽度的响应式单位」，即 `1rpx = 视口宽 / 750`。
> 迁移时建议直接换算为 `1rpx = (100vw / 750)`，或统一定义 `--rpx: calc(100vw / 750)` 后用 `calc(var(--rpx) * N)`。
> 若目标是固定桌面窗口（Wails 常见），也可按「设计宽度 375px → 1rpx = 0.5px」固定换算（750rpx = 375px）。
> 下文所有尺寸均**原样保留 rpx 数值**，换算策略由你统一决定。
>
> **设计令牌**见姊妹篇 §0（`src/App.css` `:root` + `src/constants/theme.ts`），本文不再重复；本文只标注**硬编码色值**（不在令牌表内的颜色）。

---

## 1. 应用外壳（App / 路由 / 导航）

### 1.1 组件树与文件职责

| 文件 | 职责 |
|---|---|
| `src/index.tsx` | 挂载入口：`root.render(<App />)`（Lynx 自有 API）+ `import.meta.webpackHot` HMR |
| `src/App.tsx` | hydration 门控：未恢复完成 → 启动态；完成 → `<AppRouter />` |
| `src/router/index.tsx` | `MemoryRouter` + 外壳（`Shell-content` 路由出口 + 条件 TabBar） |
| `src/router/routes.tsx` | 路由表（5 Tab + 5 二级 + `*` 兜底占位页） |
| `src/router/navigation.ts` | `useNavigation()` 语义化导航助手（**唯一**跳转出口） |
| `src/constants/routes.ts` | 路径常量 / Tab 定义 / 路径构造器（**唯一**路径来源） |

```tsx
// src/index.tsx —— 迁移时整段替换
import '@lynx-js/preact-devtools'
import '@lynx-js/react/debug'
import { root } from '@lynx-js/react'
import { App } from './App.js'

root.render(<App />)

if (import.meta.webpackHot) {
  import.meta.webpackHot.accept()
}
```

**Web 端对应实现**：
```tsx
import { createRoot } from 'react-dom/client'
import { App } from './App'

createRoot(document.getElementById('root')!).render(<App />)

if (import.meta.hot) {
  import.meta.hot.accept()
}
```

### 1.2 结构（自上而下）

```
.App                 flex column, width 100%, min-height 100vh, bg --color-bg
└─ ① 未 hydration：.Splash
   ├─ .Splash-title   「JLPT N3 単語」
   └─ .Splash-hint    「正在恢复学习进度…」
└─ ② 已 hydration：AppRouter
   └─ MemoryRouter(initialEntries=['/'])
      └─ .Shell            flex:1, flex column, width 100%
         ├─ .Shell-content   flex:1, flex column, width 100%   ← <Routes/>
         └─ .TabBar          （仅当 isTabPath(location.pathname)）
```

```css
/* src/App.css —— 外壳相关片段，原样迁移 */
.App {
  display: flex;
  flex-direction: column;
  width: 100%;
  min-height: 100vh;
  background-color: var(--color-bg);
}

.Splash {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}
.Splash-title {
  font-size: var(--font-xl);
  font-weight: 700;
  margin-bottom: var(--space-md);
}
.Splash-hint {
  font-size: var(--font-sm);
  color: var(--color-text-muted);
}

.Shell {
  flex: 1;
  display: flex;
  flex-direction: column;
  width: 100%;
}
.Shell-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  width: 100%;
}
```

### 1.3 启动态（hydration 门控）行为

- `useHydrated()` 为 `false` 时只渲染 `.Splash`，**不挂载任何路由**（避免默认态闪一帧）。
- store 侧有 **2500ms 看门狗**兜底强制 `hydrated = true`（`src/store/index.ts:110-116`），永不卡启动态：

```ts
const HYDRATION_WATCHDOG_MS = 2500
setTimeout(() => {
  if (!appStore.getState().runtime.hydrated) {
    appStore.getState().setHydrated(true)
  }
}, HYDRATION_WATCHDOG_MS)
```

- **Wails 侧建议**：Go 启动时读取本地 JSON → 通过 Wails binding 注入，或仍用 `localStorage`；看门狗逻辑原样保留（Wails 下 `localStorage` 可用，但窗口首帧可能更慢，看门狗更重要）。

### 1.4 路由表（`src/router/routes.tsx`）

| # | 页面 | 路径常量 | 值 | Tab | 组件 |
|---|---|---|---|---|---|
| P0 | 首页 | `ROUTES.home` | `/` | ✅ | `HomePage` |
| P1 | 阶段地图 | `ROUTES.stages` | `/stages` | ✅ | `StageMapPage` |
| P4 | 语法列表 | `ROUTES.grammar` | `/grammar` | ✅ | `GrammarListPage` |
| P7 | 复习 | `ROUTES.review` | `/review` | ✅ | `ReviewPage` |
| P9 | 我的 | `ROUTES.me` | `/me` | ✅ | `MePage` |
| P2 | 词汇学习 | `ROUTES.study` | `/study/:moduleId` | — | `StudyPage` |
| P3 | 词汇详解 | `ROUTES.vocab` | `/vocab/:wordId` | — | `VocabDetailPage` |
| P5 | 语法详解 | `ROUTES.grammarDetail` | `/grammar/:grammarId` | — | `GrammarDetailPage` |
| P6 | 知识图谱 | `ROUTES.graph` | `/graph` | — | `GraphPage` |
| P8 | 自测 | `ROUTES.quiz` | `/quiz` | — | `QuizPage` |
| — | 兜底 | `*` | — | — | `PagePlaceholder` |

> ⚠️ 注意路径冲突：`ROUTES.grammar = '/grammar'`（列表）与 `ROUTES.grammarDetail = '/grammar/:grammarId'`（详解）是**同一前缀的两级路由**，靠 React Router 的精确匹配区分。迁移时**不要**改成 `/grammars`，否则所有 `grammarDetailPath()` 产出的链接失效。

兜底占位页结构（未匹配路由）：

```
.Page            flex column, align-items:center, justify-content:center, padding --space-lg
├─ .Page-title   「页面不存在」   font-lg / 700 / mb --space-sm
├─ .Page-path    location.pathname  font-sm / color --color-primary / mb --space-xs
└─ .Page-note    「未匹配到路由，请返回首页」  font-xs / color --color-text-muted
```

```css
.Page {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--space-lg);
}
.Page-title { font-size: var(--font-lg); font-weight: 700; margin-bottom: var(--space-sm); }
.Page-path  { font-size: var(--font-sm); color: var(--color-primary); margin-bottom: var(--space-xs); }
.Page-note  { font-size: var(--font-xs); color: var(--color-text-muted); }
```

### 1.5 路径构造器（`src/constants/routes.ts`）

```ts
export const ROUTES = {
  home: '/',
  stages: '/stages',
  grammar: '/grammar',
  review: '/review',
  me: '/me',
  study: '/study/:moduleId',
  vocab: '/vocab/:wordId',
  grammarDetail: '/grammar/:grammarId',
  graph: '/graph',
  quiz: '/quiz',
} as const

export const TABS: TabDefinition[] = [
  { path: ROUTES.home,    label: '首页' },
  { path: ROUTES.stages,  label: '阶段' },
  { path: ROUTES.grammar, label: '语法' },
  { path: ROUTES.review,  label: '复习' },
  { path: ROUTES.me,      label: '我的' },
]
export const TAB_PATHS: string[] = TABS.map((tab) => tab.path)

export function isTabPath(pathname: string): boolean {
  return TAB_PATHS.includes(pathname)
}

export function studyPath(moduleId: string, mode?: 'learn' | 'review'): string {
  const base = `${ROUTES.study.replace(':moduleId', encodeURIComponent(moduleId))}`
  return mode === 'review' ? `${base}?mode=review` : base
}
export function vocabPath(wordId: string): string {
  return ROUTES.vocab.replace(':wordId', encodeURIComponent(wordId))
}
export function grammarDetailPath(grammarId: string): string {
  return ROUTES.grammarDetail.replace(':grammarId', encodeURIComponent(grammarId))
}
export function graphPath(options?: { view?: GraphMode; focus?: string }): string {
  const params: string[] = []
  if (options?.view !== undefined) params.push(`view=${encodeURIComponent(options.view)}`)
  if (options?.focus !== undefined) params.push(`focus=${encodeURIComponent(options.focus)}`)
  return params.length === 0 ? ROUTES.graph : `${ROUTES.graph}?${params.join('&')}`
}
```

### 1.6 导航助手（`src/router/navigation.ts`）

```ts
export interface Navigation {
  goHome(): void
  goStages(): void
  goGrammarList(): void
  goReview(): void
  goMe(): void
  goStudy(moduleId: string, options?: { mode?: 'learn' | 'review' }): void
  goVocab(wordId: string): void
  goGrammarDetail(grammarId: string): void
  goGraph(options?: { view?: GraphMode; focus?: string }): void
  goQuiz(): void
  back(): void          // navigate(-1)
}
```

- 全应用**不用** `<Link>` / `<NavLink>`（Lynx 无此组件），一律 `useNavigate()`。
- `useNavigation()` 内部 `useMemo(..., [navigate])`，返回稳定对象。
- `useMemo` 从 `@lynx-js/react` 导入 → Web 端改从 `react` 导入。

### 1.7 Lynx 特有写法 → Web 改写（外壳）

| Lynx | Web |
|---|---|
| `root.render(<App />)`（`src/index.tsx`） | `createRoot(el).render(<App />)` |
| `import '@lynx-js/preact-devtools'` / `'@lynx-js/react/debug'` | 删除（或换 React DevTools） |
| `import.meta.webpackHot` | `import.meta.hot`（Vite） |
| `MemoryRouter`（Lynx 无 history API） | **Wails 下建议保留 `MemoryRouter`**：无地址栏，避免 `wails://` scheme 下的路径解析问题 |
| `min-height: 100vh` | 桌面窗口下 `100vh` 可用；Wails 建议改用 `height: 100%` + `html,body,#root{height:100%}` |
| `useMemo` from `@lynx-js/react` | from `react` |
| 路由表 `*` 兜底 | 同 |

---

## 2. `src/components/TabBar/index.tsx`（底部 5 Tab）

### 2.1 结构

```
.TabBar                      flex row, height 110rpx, bg --color-surface, border-top 1rpx
└─ .TabBar-item ×5           flex:1, 居中, height 100%
   └─ .TabBar-label          文案（首页/阶段/语法/复习/我的）
```

```tsx
export function TabBar() {
  const navigate = useNavigate()
  const location = useLocation()
  return (
    <view className="TabBar">
      {TABS.map((tab) => {
        const active = location.pathname === tab.path
        return (
          <view
            key={tab.path}
            className={active ? 'TabBar-item TabBar-item--active' : 'TabBar-item'}
            bindtap={() => { navigate(tab.path) }}
          >
            <text className="TabBar-label">{tab.label}</text>
          </view>
        )
      })}
    </view>
  )
}
```

### 2.2 视觉样式（完整）

```css
.TabBar {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-around;
  width: 100%;
  height: 110rpx;
  background-color: var(--color-surface);
  border-top: 1rpx solid var(--color-border);
}
.TabBar-item {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
}
.TabBar-item--active {
  background-color: var(--color-primary-soft);
}
.TabBar-label {
  font-size: var(--font-sm);
  color: var(--color-text-muted);
}
.TabBar-item--active .TabBar-label {
  color: var(--color-primary);
  font-weight: 700;
}
```

### 2.3 文案原文（完整）

`首页` / `阶段` / `语法` / `复习` / `我的`（`src/constants/routes.ts` `TABS`）

### 2.4 交互行为

1. 高亮判定为**路径全等**：`location.pathname === tab.path`。二级页（`/study/...`、`/vocab/...`、`/graph`、`/quiz`、`/grammar/:id`）**无高亮项**，但 TabBar 只在 Tab 路径渲染，故不会出现「无高亮」状态。
2. 点击 → `navigate(tab.path)`（**入栈**，不是 replace）→ 连续点 Tab 会堆积历史，`back()` 会逐级回退。
3. **无图标**：TabBar 是纯文字。`src/assets/icons/` 下的 18 个图标**完全未被引用**（见 §13）。
4. `bindtap` 冒泡（非 `catchtap`），但父级无处理函数，实际等价。

### 2.5 数据依赖

无 store / 无 repository 依赖；仅 `useLocation()` + `TABS` 常量。

### 2.6 Lynx 特有写法 → Web 改写

| Lynx | Web |
|---|---|
| `<view>` | `<div>` |
| `<text>` | `<span>` |
| `bindtap` | `onClick` |
| `navigate(tab.path)` | 保留；也可换 `<Link>`（UI 表现一致，但会改变历史栈语义，建议**不动**） |
| `border-top: 1rpx` | `max(1px, calc(var(--rpx)))`（见 §14.3） |

**Web 侧新增补偿**：
- TabBar 需 `flex: 0 0 auto`（父级 `.Shell` 是 flex column，内容区 `flex:1` 会挤压 TabBar 高度）→ 原实现靠 Lynx 的 `height` 硬约束，Web 下必须显式 `flex-shrink: 0`。
- `cursor: pointer`（整块可点）。
- `user-select: none`。
- 桌面端建议 `position: sticky; bottom: 0` + `z-index`（若内容区改为可滚动，见 §14.5）。

---

## 3. `src/pages/StageMap/index.tsx` + `index.css`（P1 阶段地图）

### 3.1 布局结构（自上而下，纵向）

```
.StageMap                        flex column, flex:1, width 100%, padding --space-md
├─ .StageMap-title               「阶段地图」            font-lg / 700
├─ .StageMap-subtitle            「按顺序解锁：上一含词阶段完成度达标后开放」  font-xs / muted / mt --space-xs
├─ .StageMap-rule                （可点，整行 toggle 解锁规则）
│  ├─ .StageMap-ruleText         规则说明文案（flex:1）  font-xs / muted
│  └─ .StageMap-ruleToggle       「解锁规则·已开启/已关闭」 font-xs / primary / ml --space-sm
└─ .StageMap-stage × N           （每个 stage 一张卡）
   ├─ .StageMap-stageHead        flex row, space-between
   │  ├─ .StageMap-stageLeft
   │  │  ├─ .StageMap-stageName   stage.name        font-md / 700
   │  │  └─ .StageMap-stageMeta   「备考周 1-4」      font-xs / muted / mt --space-xs
   │  └─ NodeStateBadge           五态徽章
   └─ 二选一：
      ├─ hasContent=true → .StageMap-modules
      │  └─ .StageMap-module × M   （可点 → P2）
      │     ├─ .StageMap-moduleLeft
      │     │  ├─ .StageMap-moduleName  module.name      font-sm
      │     │  └─ .StageMap-moduleMeta  「6/20词」         font-xs / muted
      │     └─ NodeStateBadge
      └─ hasContent=false → .StageMap-sprint  冲刺期说明文案  font-xs / muted
```

### 3.2 视觉样式（完整）

```css
/* StageMap：P1 阶段地图 */
.StageMap {
  display: flex;
  flex-direction: column;
  flex: 1;
  width: 100%;
  padding: var(--space-md);
}
.StageMap-title {
  font-size: var(--font-lg);
  font-weight: 700;
}
.StageMap-subtitle {
  margin-top: var(--space-xs);
  font-size: var(--font-xs);
  color: var(--color-text-muted);
}
.StageMap-rule {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  margin-top: var(--space-md);
  padding: var(--space-sm);
  background-color: var(--color-surface-alt);
  border-radius: var(--radius-md);
}
.StageMap-ruleText {
  flex: 1;
  font-size: var(--font-xs);
  color: var(--color-text-muted);
}
.StageMap-ruleToggle {
  margin-left: var(--space-sm);
  font-size: var(--font-xs);
  color: var(--color-primary);
}
.StageMap-stage {
  display: flex;
  flex-direction: column;
  width: 100%;
  margin-top: var(--space-md);
  padding: var(--space-md);
  background-color: var(--color-surface);
  border-radius: var(--radius-lg);
}
.StageMap-stageHead {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}
.StageMap-stageLeft {
  display: flex;
  flex-direction: column;
}
.StageMap-stageName {
  font-size: var(--font-md);
  font-weight: 700;
}
.StageMap-stageMeta {
  margin-top: var(--space-xs);
  font-size: var(--font-xs);
  color: var(--color-text-muted);
}
.StageMap-modules {
  display: flex;
  flex-direction: column;
  width: 100%;
  margin-top: var(--space-sm);
}
.StageMap-module {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: var(--space-sm);
  margin-top: var(--space-xs);
  background-color: var(--color-surface-alt);
  border-radius: var(--radius-md);
}
.StageMap-module--locked {
  opacity: 0.5;
}
.StageMap-moduleLeft {
  display: flex;
  flex-direction: column;
}
.StageMap-moduleName {
  font-size: var(--font-sm);
}
.StageMap-moduleMeta {
  margin-top: var(--space-xs);
  font-size: var(--font-xs);
  color: var(--color-text-muted);
}
.StageMap-sprint {
  margin-top: var(--space-sm);
  font-size: var(--font-xs);
  color: var(--color-text-muted);
}
```

### 3.3 文案原文（完整，`src/constants/strings.ts` `STRINGS.stage`）

| 键 | 原文 |
|---|---|
| `title` | 阶段地图 |
| `subtitle` | 按顺序解锁：上一含词阶段完成度达标后开放 |
| `module` | 模块 |
| `wordCount` | 词 |
| `wordCountUnit` | 词 |
| `lockedHint` | 需上一含词阶段完成度 ≥ 80% |
| `sprintTitle` | 冲刺期 |
| `sprintBody` | 本阶段无词条内容，完成度不参与计算（冲刺期以复习与自测为主）。 |
| `unlockRuleOff` | 解锁规则已在设置中关闭 |
| `ruleLabel` | 解锁规则 |
| `ruleToggleOn` | 已开启 |
| `ruleToggleOff` | 已关闭 |
| `weekLabel` | 备考周 |

拼装出的运行时文案：
- 规则行左：`unlockRuleEnabled ? lockedHint : unlockRuleOff`
- 规则行右：`` `${ruleLabel}·${unlockRuleEnabled ? ruleToggleOn : ruleToggleOff}` `` → `解锁规则·已开启`
- 阶段副标题：`` `${weekLabel} ${stage.weekRange.start}-${stage.weekRange.end}` `` → `备考周 1-4`
- 模块副标题：`` `${summary.learned}/${summary.total}${wordCountUnit}` `` → `6/20词`

### 3.4 交互行为

1. **规则行**（`.StageMap-rule`，`catchtap`）：点击 → `appActions.toggleUnlockRule()`（全局开关，同时影响首页与阶段解锁判定）。
2. **模块行**（`.StageMap-module`，`catchtap`）：
   ```ts
   catchtap={() => { if (unlocked) { nav.goStudy(module.id) } }}
   ```
   ⚠️ 未解锁时是**视觉禁用 + 逻辑短路**（`opacity:0.5` + 内部 `if`），事件仍绑定 —— 复刻时不要改成 `disabled` / `pointer-events:none` 之外的行为差异（视觉一致即可）。
3. **阶段卡本身不可点**（无 `catchtap`），只有模块行可点。
4. 冲刺期（`hasContent === false`）阶段**不渲染模块列表**，只显示 `sprintBody` 说明；`sprintTitle` 在本页**未使用**（保留在 STRINGS 中）。

### 3.5 数据依赖

| 来源 | 调用 |
|---|---|
| `repository` | `getStages()`、`getModules(stageId)` |
| store | `useAppStore(s => s)`（整份 state）、`state.settings.unlockRuleEnabled`、`state.progress` |
| selectors | `selectStageNodeState(state, stage.id)`、`selectStageUnlocked(state, stage.id)`、`selectModuleProgress(state, module.id)`、`selectModuleNodeState(state, module.id)` |
| actions | `appActions.toggleUnlockRule` |

**解锁规则**（`selectStageUnlocked`，`src/store/selectors.ts:242-268`）：
- `settings.unlockRuleEnabled === false` → 全部解锁；
- 无「上一含词阶段」（首个阶段）→ 解锁；
- 上一含词阶段完成度 === `NO_CONTENT`（`-1`，冲刺期哨兵）→ **视为解锁**（避免死角）；
- 否则 `score >= STAGE_UNLOCK_RATIO`（`0.8`）。

**节点态聚合**（`aggregateNodeState`，`src/store/selectors.ts:200-221`）：
任一「需强化」→ 需强化；全部「已掌握」→ 已掌握；否则只要出现过（学习中/模糊/已掌握）→ 学习中；否则未学。空数组 → 未学。

### 3.6 Lynx 特有写法 → Web 改写

| Lynx | Web |
|---|---|
| `<view>` / `<text>` | `<div>` / `<span>`（`.StageMap-moduleMeta` 等需 block 间距的用 `<div>`/`<p>`） |
| `catchtap` | `onClick` + `e.stopPropagation()` |
| 无滚动容器 | **Web 需补 `overflow-y: auto`**：4 阶段 × 多模块在原实现下内容超高被裁切（见 §14.5） |

---

## 4. `src/pages/Graph/index.tsx` + `index.css`（P6 知识图谱）

### 4.1 布局结构

```
.Graph                       flex column, flex:1, width 100%, padding --space-md
├─ .Graph-head               flex row, align center, mb --space-sm
│  ├─ .Graph-back            （pill 按钮，catchtap → nav.back）
│  │  └─ .Graph-backLabel    「返回」
│  └─ .Graph-title           「知识图谱」  flex:1, text-align center, font-lg / 700
├─ .Graph-tabs               flex row, mb --space-sm
│  └─ .Graph-tab ×3          flex:1, pill, mr --space-xs（选中 → --on）
│     └─ .Graph-tabLabel     「全景」/「词条」/「语法」
├─ .Graph-hint               「点击节点聚焦，再次点击进入；点空白取消聚焦」
├─ .Graph-legend             flex row, wrap, mb --space-sm
│  └─ .Graph-legendItem ×4
│     ├─ .Graph-legendDot    18rpx 圆点，backgroundColor 内联
│     └─ .Graph-legendLabel  「阶段」/「模块」/「词条」/「语法」
├─ 二选一：
│  ├─ nodes.length === 0 → .Graph-empty 「暂无图谱数据」
│  └─ <GraphCanvas view layout focusId onNodeTap onBackgroundTap />
└─ （selected !== null 时）.Graph-detail        flex row, space-between, mt --space-sm
   ├─ .Graph-detailLabel      selected.label        font-md / 700
   └─ （canEnter 时）.Graph-detailBtn              pill, bg --color-primary
      └─ .Graph-detailBtnLabel 「进入详情」         font-sm / 700 / color --color-bg
```

### 4.2 视觉样式（完整）

```css
/* Graph：P6 知识图谱 */
.Graph {
  display: flex;
  flex-direction: column;
  flex: 1;
  width: 100%;
  padding: var(--space-md);
}
.Graph-head {
  display: flex;
  flex-direction: row;
  align-items: center;
  width: 100%;
  margin-bottom: var(--space-sm);
}
.Graph-back {
  padding-left: var(--space-md);
  padding-right: var(--space-md);
  padding-top: var(--space-xs);
  padding-bottom: var(--space-xs);
  background-color: var(--color-surface-alt);
  border-radius: var(--radius-pill);
}
.Graph-backLabel {
  font-size: var(--font-sm);
  color: var(--color-text);
}
.Graph-title {
  flex: 1;
  text-align: center;
  font-size: var(--font-lg);
  font-weight: 700;
}
.Graph-tabs {
  display: flex;
  flex-direction: row;
  align-items: center;
  width: 100%;
  margin-bottom: var(--space-sm);
}
.Graph-tab {
  flex: 1;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  padding-top: var(--space-xs);
  padding-bottom: var(--space-xs);
  margin-right: var(--space-xs);
  background-color: var(--color-surface-alt);
  border-radius: var(--radius-pill);
}
.Graph-tab--on {
  background-color: var(--color-primary);
}
.Graph-tabLabel {
  font-size: var(--font-sm);
  color: var(--color-text);
}
.Graph-hint {
  font-size: var(--font-xs);
  color: var(--color-text-muted);
  margin-bottom: var(--space-xs);
}
.Graph-legend {
  display: flex;
  flex-direction: row;
  align-items: center;
  flex-wrap: wrap;
  width: 100%;
  margin-bottom: var(--space-sm);
}
.Graph-legendItem {
  display: flex;
  flex-direction: row;
  align-items: center;
  margin-right: var(--space-md);
}
.Graph-legendDot {
  width: 18rpx;
  height: 18rpx;
  border-radius: var(--radius-pill);
  margin-right: var(--space-xs);
}
.Graph-legendLabel {
  font-size: var(--font-xs);
  color: var(--color-text-muted);
}
.Graph-empty {
  font-size: var(--font-md);
  color: var(--color-text-muted);
  margin-top: var(--space-lg);
}
.Graph-detail {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: var(--space-md);
  margin-top: var(--space-sm);
  background-color: var(--color-surface);
  border-radius: var(--radius-md);
}
.Graph-detailLabel {
  font-size: var(--font-md);
  font-weight: 700;
  color: var(--color-text);
}
.Graph-detailBtn {
  padding-left: var(--space-md);
  padding-right: var(--space-md);
  padding-top: var(--space-xs);
  padding-bottom: var(--space-xs);
  background-color: var(--color-primary);
  border-radius: var(--radius-pill);
}
.Graph-detailBtnLabel {
  font-size: var(--font-sm);
  color: var(--color-bg);
  font-weight: 700;
}
```

> ⚠️ `.Graph-detailBtnLabel` 与 `.Me-exportLabel`、`.GraphCanvas-nodeLabel` 都是 **深色文字（`--color-bg`）配主色底** —— 这是原实现刻意的反色处理，不要改成白色。

### 4.3 硬编码色值（不在令牌表内）

| 位置 | 值 | 用途 |
|---|---|---|
| `LEGEND[0]` | `#f0b44a` | 阶段（= `--color-warning`） |
| `LEGEND[1]` | `#5b8cff` | 模块（= `--color-primary`） |
| `LEGEND[2]` | `#39c47a` | 词条（= `--color-success`） |
| `LEGEND[3]` | `#ff5f6d` | 语法（= `--color-danger`） |

这 4 个色与令牌同值但**硬编码在 TS 里**（内联 style 用），迁移建议改为 `var(--color-*)`。

### 4.4 文案原文（完整，`STRINGS.graph`）

| 键 | 原文 |
|---|---|
| `title` | 知识图谱 |
| `viewOverview` | 全景 |
| `viewWord` | 词条 |
| `viewGrammar` | 语法 |
| `reset` | 重置 |
| `zoomIn` | 放大 |
| `zoomOut` | 缩小 |
| `focusHint` | 点击节点聚焦，再次点击进入；点空白取消聚焦 |
| `empty` | 暂无图谱数据 |
| `enter` | 进入详情 |
| `legendStage` | 阶段 |
| `legendModule` | 模块 |
| `legendWord` | 词条 |
| `legendGrammar` | 语法 |
| `common.back` | 返回 |

### 4.5 交互行为

1. **返回**：`.Graph-back` → `nav.back()`（`navigate(-1)`）。
2. **三视图切换**：点击 `.Graph-tab` → `nav.goGraph({ view: mode })` → 走路由 `?view=...`（**注意：不带 `focus`**，故切视图后 `query.focus === null`）。
3. **视图解析**（`resolveView`）：
   - `view=word`：`focus` 命中 `source.words` 则用该词，否则**回落 `source.words[0]`**；`words` 为空 → 回落 `buildOverview`。
   - `view=grammar`：同上，回落 `source.grammars[0]`。
   - 其余（含 `view` 非法值）→ `buildOverview`。
4. **节点两段式交互**（`onNodeTap`）：
   ```ts
   function onNodeTap(node: GraphNode): void {
     if (focusId === node.id) { enterNode(node); return }   // 第二次点 → 进入
     setFocusId(node.id); setSelected(node)                 // 第一次点 → 聚焦
   }
   ```
5. **点空白**（`.GraphCanvas-outer` 的 `bindtap`）→ `setFocusId(null)` + `setSelected(null)`。
6. **进入目标**（`enterNode` → `graphNodeTarget`）：
   | 节点 kind | 跳转 |
   |---|---|
   | `word` | `nav.goVocab(id)` → P3 |
   | `grammar` | `nav.goGrammarDetail(id)` → P5 |
   | `module` | `nav.goStudy(id)` → P2 |
   | `stage` / `none` | **不可进入** |
7. **`canEnter`** = `kind !== 'none' && kind !== 'stage'` → 阶段节点与未知 kind 不显示「进入详情」按钮（但仍可聚焦，仍显示 `.Graph-detail` 条）。
8. `focusId` 初值取自路由 `query.focus`（`useState(query.focus)`），**不随路由变化同步**（组件不重挂载时切视图不会重置 `focusId`）。

### 4.6 数据依赖

| 来源 | 调用 |
|---|---|
| `repository`（经 selector） | `selectGraphSource()` → `getStages()` / `getAllModules()` / `getAllWords()` / `getAllGrammars()` / `getAllSentences()` |
| engine | `layout(view, { width: 640, height: 640, baseRadius: 230 })` |
| engine | `buildOverview` / `buildWordView` / `buildGrammarView` |
| services | `parseGraphQuery(location.search)`、`graphNodeTarget(node)` |
| 常量 | `GRAPH_WIDTH = 640`、`GRAPH_HEIGHT = 640`、`VIEW_ORDER = ['overview','word','grammar']` |

```ts
const source = useMemo(() => selectGraphSource(), [])   // 依赖数组为空 → 全页生命周期只算一次
```

### 4.7 Lynx 特有写法 → Web 改写

| Lynx | Web |
|---|---|
| `<view>` / `<text>` | `<div>` / `<span>` |
| `catchtap` | `onClick` + `e.stopPropagation()` |
| 无滚动 | **Web 需补 `overflow-y: auto`**（头部 + 图例 + 760rpx 画布 + 详情条，桌面窗口必然超高） |
| `useMemo`/`useState` from `@lynx-js/react` | from `react` |

---

## 5. `src/components/GraphCanvas/index.tsx` + `index.css`（P6 图谱画布）

### 5.1 渲染策略（务必按此分层复刻）

```
.GraphCanvas                        flex column, width 100%
├─ .GraphCanvas-toolbar             flex row, mb --space-sm
│  └─ .GraphCanvas-tool ×3          pill, mr --space-sm
│     └─ .GraphCanvas-toolLabel     「缩小」/「放大」/「重置」
└─ .GraphCanvas-viewport            position relative, height 760rpx, overflow hidden,
   │                                bg --color-surface, radius --radius-lg
   └─ .GraphCanvas-outer            position relative
      │  style: width/height = layout.width/height rpx
      │         transform: scale(zoom) translate(panX rpx, panY rpx)   ← 按钮驱动（React state）
      │  bindtap = onBackgroundTap（冒泡）
      └─ .GraphCanvas-content       position relative
         │  style: width/height 同上；初始 transform: scale(1) translate(0rpx,0rpx)
         │  ← 手势直接改这个元素的 transform（不经过 React）
         ├─ <svg content={svg} />   position absolute, left0/top0（背景：边 + 底圈）
         └─ .GraphCanvas-node ×N    position absolute（前景：可点标签圆）
            └─ .GraphCanvas-nodeLabel   inline fontSize = FONT.xs
```

**关键点**：背景是**静态 SVG 字符串**（`toSvg`），前景是**绝对定位的 DOM 节点**；两者共用同一份放大后的坐标。

### 5.2 视觉样式（完整）

```css
/* GraphCanvas：P6 图谱画布（背景 SVG + 绝对定位节点） */
.GraphCanvas {
  display: flex;
  flex-direction: column;
  width: 100%;
}
.GraphCanvas-toolbar {
  display: flex;
  flex-direction: row;
  align-items: center;
  width: 100%;
  margin-bottom: var(--space-sm);
}
.GraphCanvas-tool {
  padding-left: var(--space-sm);
  padding-right: var(--space-sm);
  padding-top: var(--space-xs);
  padding-bottom: var(--space-xs);
  margin-right: var(--space-sm);
  background-color: var(--color-surface-alt);
  border-radius: var(--radius-pill);
}
.GraphCanvas-toolLabel {
  font-size: var(--font-sm);
  color: var(--color-text);
}
.GraphCanvas-viewport {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 760rpx;
  overflow: hidden;
  background-color: var(--color-surface);
  border-radius: var(--radius-lg);
}
.GraphCanvas-outer {
  position: relative;
}
.GraphCanvas-content {
  position: relative;
}
.GraphCanvas-svg {
  position: absolute;
  left: 0;
  top: 0;
}
.GraphCanvas-node {
  position: absolute;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-pill);
}
.GraphCanvas-nodeLabel {
  color: var(--color-bg);
  font-weight: 700;
}
```

### 5.3 内联 style（动态值，需保留）

```tsx
// .GraphCanvas-outer
{
  width: `${layout.width}rpx`,              // 640rpx
  height: `${layout.height}rpx`,            // 640rpx
  transform: `scale(${zoom}) translate(${panX}rpx, ${panY}rpx)`,
}

// .GraphCanvas-content
{
  width: `${layout.width}rpx`,
  height: `${layout.height}rpx`,
  transform: 'scale(1) translate(0rpx, 0rpx)',   // 之后由手势改写
}

// <svg>
{ width: `${layout.width}rpx`, height: `${layout.height}rpx` }

// .GraphCanvas-node（每个节点）
{
  left: `${node.x - node.r}rpx`,
  top: `${node.y - node.r}rpx`,
  width: `${node.r * 2}rpx`,
  height: `${node.r * 2}rpx`,
  backgroundColor: NODE_COLOR[node.kind],
  opacity: focusId === null || focusId === node.id ? 1 : 0.35,
}

// .GraphCanvas-nodeLabel
{ fontSize: FONT.xs }        // '20rpx'
```

### 5.4 常量与纯函数

```ts
const DISPLAY_RADIUS_SCALE = 2.4    // 设计半径偏小（14/14/18/22），放大 2.4 倍以便标签可读
const MIN_ZOOM = 0.5
const MAX_ZOOM = 3
const ZOOM_STEP = 1.25

const NODE_COLOR: Record<GraphNodeKind, string> = {
  stage:   COLORS.warning,   // #f0b44a
  module:  COLORS.primary,   // #5b8cff
  word:    COLORS.success,   // #39c47a
  grammar: COLORS.danger,    // #ff5f6d
}

function clampZoom(value: number): number {
  if (Number.isNaN(value)) { return 1 }
  return Math.min(Math.max(value, MIN_ZOOM), MAX_ZOOM)
}

// 显示半径：位置 x/y 不变，仅放大 r；背景 SVG 与前景 view 共用同一份
const displayNodes = layout.nodes.map((node) => ({ ...node, r: Math.round(node.r * radiusScale) }))
```

`radiusScale` 为可选 prop，缺省 `2.4`。

### 5.5 交互行为

1. **缩放按钮**：
   - 缩小 → `setZoom(c => clampZoom(c / 1.25))`
   - 放大 → `setZoom(c => clampZoom(c * 1.25))`
   - 重置 → `setZoom(1); setPanX(0); setPanY(0)`
2. **拖拽**：`panX/panY` 除「重置」外**从不 setState**（无拖拽按钮），实际位移只来自手势层直接改 style。
3. **手势（Lynx 主线程）**：
   - `main-thread:bindtouchstart`：记录 `data-gesture-span`（双指距离，单指为 0）、`data-gesture-scale`（取 `data-cur-scale`，缺省 1）、`data-gesture-x/y`（首指坐标）。
   - `main-thread:bindtouchmove`：`nextScale = startScale * (span / startSpan)`（仅当 `startSpan>0 && span>0`），夹取 `[0.5, 3]`；`panDx/panDy = 首指位移`；写回 `data-cur-scale` 并 `el.setStyleProperty('transform', scale(...) translate(...rpx, ...rpx))`。
   - `main-thread:bindtouchend`：清 `data-gesture-span`，把 `data-cur-scale` 固化到 `data-gesture-scale`。
   - 全程**只操作 DOM，不触发 React 重渲染**。
4. **节点点击**（`catchtap`）→ `props.onNodeTap(node)`（见 §4.5 两段式）。
5. **空白点击**（`.GraphCanvas-outer` 的 `bindtap`，冒泡）→ `props.onBackgroundTap()`。
6. `props.radiusScale` 未被 Graph 页传入（用默认 2.4）。

### 5.6 数据依赖

| 来源 | 内容 |
|---|---|
| props | `view`、`layout`、`focusId`、`radiusScale?`、`onNodeTap`、`onBackgroundTap` |
| engine | `toSvg(view, displayLayout, focusId ?? undefined)` |
| 常量 | `COLORS`、`FONT`（`src/constants/theme.ts`） |
| STRINGS | `graph.zoomOut` / `zoomIn` / `reset` |

### 5.7 Lynx 特有写法 → Web 改写（★本文件最大改动点）

| Lynx | Web |
|---|---|
| `<svg content={string}>` | 内联 JSX `<svg dangerouslySetInnerHTML>` **或**改写成真正的 JSX `<svg><line/><circle/></svg>`（推荐后者，便于绑变量、避免 `dangerouslySetInnerHTML`） |
| `main-thread:bindtouchstart/move/end` + `'main thread'` 指令 | 删除指令与属性名前缀；改用 `onPointerDown/onPointerMove/onPointerUp`（`setPointerCapture`）+ `onWheel`（桌面滚轮缩放） |
| `event.touches[0].clientX/clientY` | `PointerEvent.clientX/clientY`；双指用 `TouchEvent.touches` 或两个活跃 pointer 的距离 |
| `el.getAttribute('data-*')` / `el.setAttribute(...)` | 改用 `useRef` 保存 gesture 起点的普通对象（不要再用 DOM 属性当状态容器） |
| `el.setStyleProperty('transform', ...)` | `ref.current.style.transform = ...`（同样绕过 React 以避免手势掉帧） |
| `transform: scale(k) translate(Xrpx, Yrpx)` | `translate` 中的 `rpx` 需换算；且 **CSS transform 顺序**：`scale()` 在前会同时缩放 `translate` 的位移量 —— 若要保持与原实现一致的观感，保留 `scale(k) translate(...)` 顺序；若要精确位移，改为 `translate(...) scale(k)`（**这是行为差异，需显式决策**） |
| `overflow: hidden` | 同（Web 下同样生效） |
| `catchtap` | `onClick` + `e.stopPropagation()` |
| `bindtap`（冒泡到 outer） | `onClick`（Web 天然冒泡；注意前景节点 `stopPropagation` 后不会触发背景点击 —— 与原实现一致） |

**Web 侧新增补偿**：
- `touch-action: none`（否则移动端手势被浏览器滚动吞掉）。
- `cursor: grab` / `cursor: grabbing`（拖拽反馈）；节点 `cursor: pointer`。
- 桌面端建议补「滚轮缩放 + 按住拖拽」，`wheel` 需 `passive: false` + `preventDefault`（阻止页面滚动）。
- `user-select: none`（拖拽会选中文本）。
- 节点为圆形（`border-radius: 999rpx`），但标签可能溢出圆外 → 原实现不裁切（`overflow` 未设），Web 下保持一致；如需裁切需显式决策。

---

## 6. 图谱引擎支撑（layout / svg / view / graphNav）

> 这 4 个文件是**纯函数 / 引擎层**，在 Lynx → Web 迁移中**几乎零改动**（不依赖 DOM、不依赖 Lynx API），但要理解其输出契约才能正确复刻 UI。

### 6.1 `src/engine/graph/layout.ts` —— 径向确定性布局

```ts
export function layout(view: GraphView, ctx: LayoutConfig): LayoutResult
// DEFAULT_PADDING = 40；DEFAULT_RADIUS = 16
```

- 画布中心为圆心，**径向**摆放：`angle = (2π * index / count) - π/2`（从正上方开始，顺时针）。
- 确定性：相同输入恒产出相同坐标（无随机数、不依赖 DOM / 时间）。
- `count === 0` → `{ nodes: [], edges, width, height }`（空图，页面据此渲染 `Graph-empty`）。
- `count === 1` → 单节点置于正中。
- `radius = ctx.baseRadius ?? (min(width, height)/2 - padding)`。
- 坐标 `Math.round`；`r = node.r > 0 ? node.r : 16`。

### 6.2 `src/engine/graph/svg.ts` —— 背景 SVG 字符串

```ts
export function toSvg(view: GraphView, layout: LayoutResult, focusId?: string): string
```

| 常量 | 值 | 用途 |
|---|---|---|
| `COLOR_EDGE` | `#c8ccd4` | 普通边 |
| `COLOR_EDGE_FOCUS` | `#4c6ef5` | 聚焦边（**注意：与 `--color-primary #5b8cff` 不同**） |
| `COLOR_NODE_FILL` | `#ffffff` | 节点底圈填充（白色） |
| `COLOR_NODE_STROKE` | `#4c6ef5` | 节点底圈描边 |
| `FOCUS_DIM_OPACITY` | `0.35` | 非聚焦节点底圈不透明度 |

输出结构：
```svg
<svg width="640" height="640" viewBox="0 0 640 640" xmlns="http://www.w3.org/2000/svg">
  <line x1 y1 x2 y2 stroke="#c8ccd4|#4c6ef5" stroke-width="2" />   ← 每条边
  <circle cx cy r fill="#ffffff" stroke="#4c6ef5|#4c6ef5" stroke-width="2" opacity="1|0.35" />
</svg>
```
- 边：`focusId` 与任一端点相同 → 高亮色；两端节点缺失则跳过该边。
- 节点：`focusId` 未定义 → 全部 opacity 1；已定义 → 聚焦者 1，其余 0.35。
- 空图 → 返回仅含 `<svg>` 开闭标签的空串。

> ⚠️ **SVG 内部坐标是纯数字（640×640 用户单位）**，与外层 `rpx` 尺寸靠 `viewBox` 拉伸对齐；前景 DOM 节点用的是 `rpx` 坐标。**两者必须换算一致**，否则节点与底圈错位。迁移时建议统一：`svg` 的 width/height 用 `calc(var(--rpx)*640)`、`viewBox="0 0 640 640"`，前景节点 `left/top` 也用 `calc(var(--rpx) * (x-r))`。

### 6.3 `src/engine/graph/view.ts` —— 三视图构造

| 常量 | 值 |
|---|---|
| `WORD_RADIUS` | 14 |
| `GRAMMAR_RADIUS` | 14 |
| `MODULE_RADIUS` | 18 |
| `STAGE_RADIUS` | 22 |

节点 id 约定：`stage:<id>` / `module:<id>` / `word:<id>` / `grammar:<id>`。

**`buildOverview(data)`**：按 `order` 升序的阶段节点 + 全部模块节点 + `contains` 边（stage→module）。

**`buildWordView(word, data)`**：
- 中心 = `word:<id>`，label = `word.kanji || word.kana`；
- 关联词（**含反向关联**、去重）→ 边 type 取 `rel.type`；
- 该词出现过的例句所涉及的语法 → 边 type = `relatedGrammar`。

**`buildGrammarView(grammar, data)`**：
- 中心 = `grammar:<id>`，label = `grammar.pattern`；
- `grammar.related` 正向 → 边 `centerId → target`（type = rel.type）；
- 其他语法指向本语法的**反向** → 边 `other → centerId`（type = rel.type）；
- 含该语法的例句所涉及的词 → 边 type = `relatedWord`。

查表优化：`data.wordById` / `data.grammarById`（由 `selectGraphSource()` 预建）优先，缺省回退 O(n) `find`。

### 6.4 `src/services/graphNav.ts` —— 导航解析（纯函数）

```ts
export type GraphNavKind = 'word' | 'grammar' | 'module' | 'stage' | 'none'
export interface GraphNavTarget { kind: GraphNavKind; id: string }

export function graphNodeEntityId(nodeId: string): string   // 去 `kind:` 前缀
export function graphNodeKind(nodeId: string): string       // 取 `kind:` 前缀
export function graphNodeTarget(node: GraphNode): GraphNavTarget

export interface GraphQuery { view: GraphMode; focus: string | null }
export function parseGraphQuery(search: string): GraphQuery
```

- `parseGraphQuery` **宽松解析**：`view` 非 `word`/`grammar` 一律回落 `overview`；`focus` 为空串 → `null`；手动 `split('&')` / `indexOf('=')` / `decodeURIComponent`（不依赖 `URLSearchParams`）。
- `graphNodeTarget` 对未知前缀返回 `{ kind: 'none', id: '' }`。

### 6.5 `src/types/graph.ts` —— 数据契约

```ts
export type GraphNodeKind = 'stage' | 'module' | 'word' | 'grammar'
export type GraphMode = 'overview' | 'word' | 'grammar'
export interface GraphNode { id: string; kind: GraphNodeKind; label: string; x: number; y: number; r: number }
export interface GraphEdge { fromId: string; toId: string; type: string }
export interface GraphView { mode: GraphMode; nodes: GraphNode[]; edges: GraphEdge[] }
export interface LayoutConfig { width: number; height: number; padding?: number; baseRadius?: number }
export interface LayoutResult { nodes: GraphNode[]; edges: GraphEdge[]; width: number; height: number }
export type GraphSourceData = BuildData & { wordById?: Map<...>; grammarById?: Map<...> }
```

### 6.6 Lynx 特有写法 → Web 改写（引擎层）

**无 Lynx 依赖，原样搬运即可。** 唯一需要注意的是 `toSvg` 的产物：
- Lynx 用 `<svg content={string}>`；
- Web 建议**废弃 `toSvg` 的字符串拼接**，改为直接由 `view` + `layout` 渲染 JSX `<svg>`（保留同样的颜色常量与聚焦规则）。若坚持用字符串，用 `dangerouslySetInnerHTML` 亦可，但失去绑变量能力。

---

## 7. `src/pages/GrammarList/index.tsx` + `index.css`（P4 语法列表）

### 7.1 布局结构

```
.GrammarList                     flex column, flex:1, width 100%, padding --space-md
├─ .GrammarList-title            「语法列表」  font-lg / 700 / mb --space-md
├─ .GrammarList-filter（周次）
│  ├─ .GrammarList-filterLabel   「周次」  width 120rpx / font-sm / muted
│  └─ .GrammarList-chips         flex row, wrap, flex:1
│     └─ .GrammarList-chip ×(1+N)   首个是「全部」，其余是各周次
│        └─ .GrammarList-chipLabel  「全部」/「1周」…
├─ .GrammarList-filter（层级）
│  └─ （同结构，label 为「层级」，chip 文案为 level 原值）
├─ .GrammarList-count            「12条」  font-xs / muted / mb --space-sm
└─ 二选一：
   ├─ filtered.length === 0 → .GrammarList-empty 「暂无语法点」
   └─ <list className="GrammarList-list">
      └─ <list-item> ×N   （catchtap → nav.goGrammarDetail(id)）
         ├─ .GrammarList-pattern   grammar.pattern    font-md / 700
         └─ .GrammarList-meta      「1周 · N3 · 场景」  font-xs / muted / mt --space-xs
```

### 7.2 视觉样式（完整）

```css
/* GrammarList：P4 语法列表 */
.GrammarList {
  display: flex;
  flex-direction: column;
  flex: 1;
  width: 100%;
  padding: var(--space-md);
}
.GrammarList-title {
  font-size: var(--font-lg);
  font-weight: 700;
  margin-bottom: var(--space-md);
}
.GrammarList-filter {
  display: flex;
  flex-direction: row;
  align-items: center;
  width: 100%;
  margin-bottom: var(--space-sm);
}
.GrammarList-filterLabel {
  width: 120rpx;
  font-size: var(--font-sm);
  color: var(--color-text-muted);
}
.GrammarList-chips {
  display: flex;
  flex-direction: row;
  align-items: center;
  flex-wrap: wrap;
  flex: 1;
}
.GrammarList-chip {
  padding-left: var(--space-sm);
  padding-right: var(--space-sm);
  padding-top: var(--space-xs);
  padding-bottom: var(--space-xs);
  margin-right: var(--space-xs);
  margin-bottom: var(--space-xs);
  background-color: var(--color-surface-alt);
  border-radius: var(--radius-pill);
}
.GrammarList-chip--on {
  background-color: var(--color-primary);
}
.GrammarList-chipLabel {
  font-size: var(--font-xs);
  color: var(--color-text);
}
.GrammarList-count {
  font-size: var(--font-xs);
  color: var(--color-text-muted);
  margin-bottom: var(--space-sm);
}
.GrammarList-list {
  display: flex;
  flex-direction: column;
  flex: 1;
  width: 100%;
}
.GrammarList-item {
  display: flex;
  flex-direction: column;
  width: 100%;
  padding: var(--space-md);
  margin-bottom: var(--space-sm);
  background-color: var(--color-surface);
  border-radius: var(--radius-md);
}
.GrammarList-pattern {
  font-size: var(--font-md);
  font-weight: 700;
  color: var(--color-text);
}
.GrammarList-meta {
  font-size: var(--font-xs);
  color: var(--color-text-muted);
  margin-top: var(--space-xs);
}
.GrammarList-empty {
  font-size: var(--font-md);
  color: var(--color-text-muted);
  margin-top: var(--space-lg);
}
```

### 7.3 文案原文（完整，`STRINGS.grammarList`）

| 键 | 原文 |
|---|---|
| `title` | 语法列表 |
| `filterWeek` | 周次 |
| `filterLevel` | 层级 |
| `all` | 全部 |
| `empty` | 暂无语法点 |
| `weekLabel` | 周 |
| `countUnit` | 条 |

拼装：
- 周次 chip：`` `${option}${weekLabel}` `` → `1周`
- 条目 meta：`` `${grammar.week}${weekLabel} · ${grammar.level} · ${grammar.scene}` `` → `1周 · N3 · 日常会话`
- 计数：`` `${filtered.length}${countUnit}` `` → `12条`

### 7.4 交互行为

1. **筛选即时生效**：`week` / `level` 为 `number | null` / `string | null`，`null` = 全部。点击 → `setWeek/setLevel` → `useMemo` 重算 `filtered`。无异步、无防抖。
2. **「全部」chip**：两组筛选各有一个，`week === null` / `level === null` 时高亮（`chip--on`）。
3. **点周次 chip 是「选中」，不是「反选」**：再次点击已选中的周次**不会回到全部**（只能点「全部」）。
4. **条目点击** → `nav.goGrammarDetail(grammar.id)`（P5）。
5. **选项来源**：
   - `grammarWeekOptions(grammars)`：去重 + **数值升序**；
   - `grammarLevelOptions(grammars)`：去重 + **按首次出现顺序**（不排序，避免抖动）。
6. `filtered` 保持 `repository.getAllGrammars()` 的原始顺序。

### 7.5 数据依赖

| 来源 | 调用 |
|---|---|
| `repository` | `getAllGrammars()`（页面内 `useMemo(..., [])`） |
| `services/grammarView.ts` | `grammarWeekOptions` / `grammarLevelOptions` / `filterGrammars`（均为纯函数） |

### 7.6 Lynx 特有写法 → Web 改写（★`<list>` 是重点）

| Lynx | Web |
|---|---|
| `<list className="GrammarList-list">` | `<div>` + `overflow-y: auto`（**必须补滚动**，语法条目可达数十条） |
| `<list-item key item-key>` | `<div key>`；`item-key` 属性删除（Lynx 复用标识，Web 用 `key` 即可） |
| `catchtap` | `onClick` + `e.stopPropagation()` |
| 无滚动 | **Web 需补 `overflow-y: auto` 并给 `.GrammarList-list` 一个高度约束**（父 `flex:1` + 子 `min-height:0`） |

> ⚠️ Lynx `<list>` 自带**虚拟滚动 / 复用**；Web 端若语法点数量很大（本期 N3 规模约数十条，无需虚拟化）可先不做虚拟列表，但**必须**让容器可滚动，否则内容被裁切。

---

## 8. `src/pages/GrammarDetail/index.tsx` + `index.css`（P5 语法详解）

### 8.1 布局结构（自上而下）

```
.GrammarDetail                    flex column, flex:1, width 100%, padding --space-md
├─ .GrammarDetail-head            flex row, align center, mb --space-md
│  ├─ .GrammarDetail-back         pill（catchtap → nav.back）
│  │  └─ .GrammarDetail-backLabel 「返回」
│  └─ .GrammarDetail-title        「语法详解」  flex:1, center, font-lg / 700
│
│  ── 未找到分支（grammar === undefined）──
│  └─ .GrammarDetail-notFound     「未找到该语法点」  → 到此结束
│
├─ .GrammarDetail-hero            column, center, pt/pb --space-lg
│  ├─ .GrammarDetail-pattern      grammar.pattern   font-xl / 700 / --color-primary
│  └─ .GrammarDetail-meta         「1周 · N3」       font-xs / muted / mt --space-xs
├─ .GrammarDetail-block「接续」
│  ├─ .GrammarDetail-blockTitle   「接续」   font-sm / muted / mb --space-xs
│  └─ .GrammarDetail-body         grammar.connection   font-md
├─ .GrammarDetail-block「场景」
│  ├─ .GrammarDetail-blockTitle   「场景」
│  └─ .GrammarDetail-chips
│     └─ .GrammarDetail-chip ×N   （纯展示，不可点）
│        └─ .GrammarDetail-chipLabel
├─ .GrammarDetail-block「例句」
│  ├─ .GrammarDetail-blockTitle   「例句」
│  └─ 空 → .GrammarDetail-empty「暂无例句」
│     非空 → .GrammarDetail-sentence ×N
│        ├─ .GrammarDetail-sentenceJa   sentence.ja    font-md
│        ├─ .GrammarDetail-sentenceZh   sentence.zh    font-sm / muted
│        └─ <TtsButton text={sentence.ja} settings label="再听一次" />
├─ .GrammarDetail-block「近义辨析」
│  ├─ .GrammarDetail-blockTitle   「近义辨析」
│  └─ 空 → .GrammarDetail-empty「暂无关联语法」
│     非空 → chips（`.GrammarDetail-chip--link`，可点 → P5 自身互跳）
├─ .GrammarDetail-block「涉及词汇」
│  ├─ .GrammarDetail-blockTitle   「涉及词汇」
│  └─ 空 → .GrammarDetail-empty「暂无涉及词汇」
│     非空 → chips（`--link`，可点 → P3）
└─ .GrammarDetail-block「掌握度自评」
   ├─ .GrammarDetail-blockHead    flex row, space-between
   │  ├─ .GrammarDetail-blockTitle 「掌握度自评」
   │  └─ NodeStateBadge             state = progress?.state ?? '未学'
   └─ .GrammarDetail-eval          flex row
      ├─ .GrammarDetail-evalBtn--unknown  「不认识」
      ├─ .GrammarDetail-evalBtn--vague    「模糊」
      └─ .GrammarDetail-evalBtn--known    「认识」
```

### 8.2 视觉样式（完整）

```css
/* GrammarDetail：P5 语法详解 */
.GrammarDetail {
  display: flex;
  flex-direction: column;
  flex: 1;
  width: 100%;
  padding: var(--space-md);
}
.GrammarDetail-head {
  display: flex;
  flex-direction: row;
  align-items: center;
  width: 100%;
  margin-bottom: var(--space-md);
}
.GrammarDetail-back {
  padding-left: var(--space-md);
  padding-right: var(--space-md);
  padding-top: var(--space-xs);
  padding-bottom: var(--space-xs);
  background-color: var(--color-surface-alt);
  border-radius: var(--radius-pill);
}
.GrammarDetail-backLabel {
  font-size: var(--font-sm);
  color: var(--color-text);
}
.GrammarDetail-title {
  flex: 1;
  text-align: center;
  font-size: var(--font-lg);
  font-weight: 700;
}
.GrammarDetail-hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  padding-top: var(--space-lg);
  padding-bottom: var(--space-lg);
}
.GrammarDetail-pattern {
  font-size: var(--font-xl);
  font-weight: 700;
  color: var(--color-primary);
}
.GrammarDetail-meta {
  font-size: var(--font-xs);
  color: var(--color-text-muted);
  margin-top: var(--space-xs);
}
.GrammarDetail-block {
  display: flex;
  flex-direction: column;
  width: 100%;
  padding: var(--space-md);
  margin-bottom: var(--space-sm);
  background-color: var(--color-surface);
  border-radius: var(--radius-md);
}
.GrammarDetail-blockHead {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}
.GrammarDetail-blockTitle {
  font-size: var(--font-sm);
  color: var(--color-text-muted);
  margin-bottom: var(--space-xs);
}
.GrammarDetail-body {
  font-size: var(--font-md);
  color: var(--color-text);
}
.GrammarDetail-chips {
  display: flex;
  flex-direction: row;
  align-items: center;
  flex-wrap: wrap;
  width: 100%;
}
.GrammarDetail-chip {
  padding-left: var(--space-sm);
  padding-right: var(--space-sm);
  padding-top: var(--space-xs);
  padding-bottom: var(--space-xs);
  margin-right: var(--space-xs);
  margin-bottom: var(--space-xs);
  background-color: var(--color-surface-alt);
  border-radius: var(--radius-pill);
}
.GrammarDetail-chip--link {
  border: 1rpx solid var(--color-primary);
}
.GrammarDetail-chipLabel {
  font-size: var(--font-xs);
  color: var(--color-text);
}
.GrammarDetail-sentence {
  display: flex;
  flex-direction: column;
  width: 100%;
  padding-top: var(--space-sm);
  padding-bottom: var(--space-sm);
  border-bottom: 1rpx solid var(--color-border);
}
.GrammarDetail-sentenceJa {
  font-size: var(--font-md);
  color: var(--color-text);
}
.GrammarDetail-sentenceZh {
  font-size: var(--font-sm);
  color: var(--color-text-muted);
  margin-top: var(--space-xs);
  margin-bottom: var(--space-xs);
}
.GrammarDetail-empty {
  font-size: var(--font-sm);
  color: var(--color-text-muted);
}
.GrammarDetail-eval {
  display: flex;
  flex-direction: row;
  align-items: center;
  width: 100%;
  margin-top: var(--space-sm);
}
.GrammarDetail-evalBtn {
  flex: 1;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  padding-top: var(--space-md);
  padding-bottom: var(--space-md);
  margin-right: var(--space-sm);
  border-radius: var(--radius-md);
  border: 1rpx solid var(--color-border);
}
.GrammarDetail-evalBtn--unknown {
  background-color: rgba(255, 95, 109, 0.16);
}
.GrammarDetail-evalBtn--vague {
  background-color: rgba(240, 180, 74, 0.16);
}
.GrammarDetail-evalBtn--known {
  background-color: rgba(57, 196, 122, 0.16);
}
.GrammarDetail-evalLabel {
  font-size: var(--font-md);
  font-weight: 700;
  color: var(--color-text);
}
.GrammarDetail-notFound {
  font-size: var(--font-md);
  color: var(--color-text-muted);
  margin-top: var(--space-lg);
}
```

**硬编码色值**（3 个自评按钮底色，无对应令牌）：
| 按钮 | 值 |
|---|---|
| `--unknown` | `rgba(255, 95, 109, 0.16)`（= danger @16%） |
| `--vague` | `rgba(240, 180, 74, 0.16)`（= warning @16%） |
| `--known` | `rgba(57, 196, 122, 0.16)`（= success @16%） |

### 8.3 文案原文（完整，`STRINGS.grammarDetail`）

| 键 | 原文 |
|---|---|
| `title` | 语法详解 |
| `connection` | 接续 |
| `scene` | 场景 |
| `examples` | 例句 |
| `related` | 近义辨析 |
| `words` | 涉及词汇 |
| `mastery` | 掌握度自评 |
| `notFound` | 未找到该语法点 |
| `emptyExamples` | 暂无例句 |
| `emptyRelated` | 暂无关联语法 |
| `emptyWords` | 暂无涉及词汇 |

跨组复用：
- `grammarList.weekLabel` = `周`（hero 副标题 `` `${week}${weekLabel} · ${level}` `` → `1周 · N3`）
- `study.selfEvalUnknown/Vague/Known` = `不认识` / `模糊` / `认识`
- `tts.replay` = `再听一次`（TtsButton label）
- `common.back` = `返回`

### 8.4 交互行为

1. **返回** → `nav.back()`。
2. **未找到**（`repository.getGrammarById(grammarId)` 返回 `undefined`）：只渲染 head + `notFound`，**页面其余部分全部不渲染**（早 return）。
3. **场景切分**：
   ```ts
   function splitScenes(scene: string): string[] {
     return scene.split(/[,、/|]/).map((p) => p.trim()).filter((p) => p !== '')
   }
   ```
   兼容中英标点（`,` `、` `/` `|`）。
4. **近义辨析 chip**：`catchtap` → 若 `target !== undefined` 则 `nav.goGrammarDetail(target.id)`（**P5 → P5 自跳**）；`target === undefined` 时 chip 仍渲染，文案退化为 `暂无关联语法`（即 `emptyRelated`），且**不可跳**。
5. **涉及词汇 chip** → `nav.goVocab(word.id)`（P5 → P3）；文案 `word.kanji === '' ? word.kana : word.kanji`。
6. **掌握度自评**（`catchtap`）：
   ```ts
   appActions.submitGrammarSelfEval(grammar.id, '不认识' | '模糊' | '认识')
   ```
   - 复用与词条**同一套 SRS 状态机**；
   - 自评后 `progress[grammar.id].state` 变化 → 右上角 `NodeStateBadge` 立即更新；
   - 同时累加今日语法配额（`todayGrammarCount`）。
   - 自评**可反复点击**（无禁用、无确认）。
7. **例句发音**：每个例句一个 `<TtsButton text={sentence.ja} settings={settings} label={STRINGS.tts.replay} />`（TtsButton 细节见姊妹篇 §7）。

### 8.5 数据依赖

| 来源 | 调用 |
|---|---|
| 路由 | `useParams<{ grammarId: string }>()`，`params.grammarId ?? ''` |
| `repository` | `getGrammarById`、`getSentencesByGrammar`、`getWordById` |
| store | `useAppStore(s => s)`、`useSettings()`、`state.progress[grammar.id]` |
| actions | `appActions.submitGrammarSelfEval` |
| 派生 | `relatedGrammars`（`(grammar.related ?? []).map`，key = `` `${toId}-${type}` ``）、`involvedWords`（从例句的 `sentence.words` 收集 `wordId` 去重） |

### 8.6 Lynx 特有写法 → Web 改写

| Lynx | Web |
|---|---|
| `<view>` / `<text>` | `<div>` / `<span>` |
| `catchtap` | `onClick` + `e.stopPropagation()` |
| 页面不可滚动 | **Web 需补 `overflow-y: auto`**（本页是**最长的页面之一**：hero + 5 个 block + 多例句，桌面窗口必然超高） |
| `border-bottom: 1rpx solid var(--color-border)` | 最后一条例句**也有**下边框（原实现未做 `:last-child` 处理），复刻时保持 |
| `useMemo` from `@lynx-js/react` | from `react` |

---

## 9. `src/pages/Me/index.tsx` + `index.css`（P9 我的 / 设置）

### 9.1 布局结构

```
.Me                        flex column, flex:1, width 100%, padding --space-md
├─ .Me-head                flex row, align center, mb --space-md
│  ├─ .Me-back             pill（catchtap → nav.back）
│  │  └─ .Me-backLabel     「返回」
│  └─ .Me-title            「我的」  flex:1, center, font-lg / 700
├─ .Me-block「发音设置」
│  ├─ .Me-blockTitle       「发音设置」     font-sm / muted / mb --space-sm
│  ├─ .Me-setting（语速）
│  │  ├─ .Me-settingLabel  「语速」         font-md
│  │  └─ .Me-stepper       flex row
│  │     ├─ .Me-stepBtn「−」 56×56rpx 圆
│  │     ├─ .Me-stepValue   rate.toFixed(1)   width 100rpx, center
│  │     └─ .Me-stepBtn「＋」
│  ├─ .Me-setting（音调）   同语速结构
│  ├─ .Me-setting（卡片出现即读，整行可点 → toggle）
│  │  ├─ .Me-settingLabel  「卡片出现即读」
│  │  └─ .Me-settingValue  「开」/「关」    font-md / primary / 700
│  └─ .Me-preview
│     └─ <TtsButton text="こんにちは" settings label="试听" />
├─ .Me-block「解锁规则」
│  ├─ .Me-blockTitle       「解锁规则」
│  └─ .Me-setting（整行可点 → appActions.toggleUnlockRule）
│     ├─ .Me-settingLabel  「阶段解锁限制」
│     └─ .Me-settingValue  「开」/「关」
├─ .Me-block「学习统计」
│  ├─ .Me-blockTitle       「学习统计」
│  └─ <StatTimeline rows={statRows} />      8 行
└─ .Me-block「数据管理」
   ├─ .Me-blockTitle       「数据管理」
   ├─ .Me-export（整行可点 → exportData）
   │  └─ .Me-exportLabel   「导出数据（JSON）」  bg --color-primary, color --color-bg, 700
   ├─ .Me-hint             「点击生成并复制学习数据 JSON」
   ├─ （条件）.Me-notice    「已复制到剪贴板」/「当前环境无法复制，文本见下方」  color --color-warning
   ├─ （条件）.Me-exportText  JSON 全文   font-xs / muted
   └─ .Me-reset（整行可点 → onReset，两段确认）
      └─ .Me-resetLabel    「清空学习进度」→「再次点击确认清空」  color --color-danger
```

### 9.2 视觉样式（完整）

```css
/* Me：P9 我的 / 设置 */
.Me {
  display: flex;
  flex-direction: column;
  flex: 1;
  width: 100%;
  padding: var(--space-md);
}
.Me-head {
  display: flex;
  flex-direction: row;
  align-items: center;
  width: 100%;
  margin-bottom: var(--space-md);
}
.Me-back {
  padding-left: var(--space-md);
  padding-right: var(--space-md);
  padding-top: var(--space-xs);
  padding-bottom: var(--space-xs);
  background-color: var(--color-surface-alt);
  border-radius: var(--radius-pill);
}
.Me-backLabel {
  font-size: var(--font-sm);
  color: var(--color-text);
}
.Me-title {
  flex: 1;
  text-align: center;
  font-size: var(--font-lg);
  font-weight: 700;
}
.Me-block {
  display: flex;
  flex-direction: column;
  width: 100%;
  padding: var(--space-md);
  margin-bottom: var(--space-sm);
  background-color: var(--color-surface);
  border-radius: var(--radius-md);
}
.Me-blockTitle {
  font-size: var(--font-sm);
  color: var(--color-text-muted);
  margin-bottom: var(--space-sm);
}
.Me-setting {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding-top: var(--space-xs);
  padding-bottom: var(--space-xs);
}
.Me-settingLabel {
  font-size: var(--font-md);
  color: var(--color-text);
}
.Me-settingValue {
  font-size: var(--font-md);
  color: var(--color-primary);
  font-weight: 700;
}
.Me-stepper {
  display: flex;
  flex-direction: row;
  align-items: center;
}
.Me-stepBtn {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  width: 56rpx;
  height: 56rpx;
  background-color: var(--color-surface-alt);
  border-radius: var(--radius-pill);
}
.Me-stepLabel {
  font-size: var(--font-md);
  color: var(--color-text);
}
.Me-stepValue {
  width: 100rpx;
  text-align: center;
  font-size: var(--font-md);
  color: var(--color-text);
}
.Me-preview {
  display: flex;
  flex-direction: row;
  width: 100%;
  margin-top: var(--space-sm);
}
.Me-export {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  width: 100%;
  padding-top: var(--space-sm);
  padding-bottom: var(--space-sm);
  background-color: var(--color-primary);
  border-radius: var(--radius-pill);
}
.Me-exportLabel {
  font-size: var(--font-md);
  font-weight: 700;
  color: var(--color-bg);
}
.Me-hint {
  font-size: var(--font-xs);
  color: var(--color-text-muted);
  margin-top: var(--space-xs);
}
.Me-notice {
  font-size: var(--font-sm);
  color: var(--color-warning);
  margin-top: var(--space-xs);
}
.Me-exportText {
  font-size: var(--font-xs);
  color: var(--color-text-muted);
  margin-top: var(--space-xs);
}
.Me-reset {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  width: 100%;
  padding-top: var(--space-sm);
  padding-bottom: var(--space-sm);
  margin-top: var(--space-md);
  background-color: var(--color-surface-alt);
  border-radius: var(--radius-pill);
  border: 1rpx solid var(--color-danger);
}
.Me-reset--armed {
  background-color: rgba(255, 95, 109, 0.2);
}
.Me-resetLabel {
  font-size: var(--font-md);
  color: var(--color-danger);
}
```

**硬编码色值**：`.Me-reset--armed` 背景 `rgba(255, 95, 109, 0.2)`（无对应令牌）。

### 9.3 文案原文（完整，`STRINGS.me`）

| 键 | 原文 |
|---|---|
| `title` | 我的 |
| `pronunciation` | 发音设置 |
| `rate` | 语速 |
| `pitch` | 音调 |
| `autoSpeak` | 卡片出现即读 |
| `preview` | 试听 |
| `previewText` | こんにちは |
| `on` / `off` | 开 / 关 |
| `unlockSection` | 解锁规则 |
| `unlockRule` | 阶段解锁限制 |
| `statsSection` | 学习统计 |
| `statTotalWords` | 词条总数 |
| `statSeen` | 已学 |
| `statMastered` | 已掌握 |
| `statWeak` | 需强化 |
| `statGrammar` | 语法点 |
| `todayNew` | 今日新学 |
| `todayReview` | 今日复习 |
| `todayGrammar` | 今日语法 |
| `dataSection` | 数据管理 |
| `exportData` | 导出数据（JSON） |
| `exportHint` | 点击生成并复制学习数据 JSON |
| `exported` | 已复制到剪贴板 |
| `exportFailed` | 当前环境无法复制，文本见下方 |
| `resetData` | 清空学习进度 |
| `resetConfirm` | 再次点击确认清空 |
| `resetDone` | 已清空 |

> ⚠️ `STRINGS.me.resetDone`（`已清空`）**在本页未被使用**（清空后无 toast / 无提示文案）。

步进按钮符号：`−`（U+2212 minus sign）/ `＋`（U+FF0B fullwidth plus）。

### 9.4 交互行为

1. **返回**（`.Me-back`）：Me 是 **Tab 页**，但有返回按钮 → `nav.back()`。若用户直接从 TabBar 进入（无历史），`navigate(-1)` 在 `MemoryRouter` 下**无效果**（栈底）。这是原实现行为，复刻时保持（或显式改为「隐藏」，但那属于体验改动，需决策）。
2. **语速 / 音调步进器**：
   ```ts
   const RATE_MIN = 0.5, RATE_MAX = 1.5, RATE_STEP = 0.1
   function adjustRate(delta) {
     appActions.updateSettings({ rate: round1(clampRange(settings.rate + delta, 0.5, 1.5)) })
   }
   ```
   - 夹取 `[0.5, 1.5]`；`round1` = `Math.round(v*10)/10`（消除浮点误差，如 `0.30000000000000004`）；
   - `pitch` 复用**同一组** `RATE_MIN/MAX/STEP` 常量；
   - 显示 `toFixed(1)`；
   - 改即生效（随 `settings` 分片持久化）。
3. **卡片出现即读**：整行 `.Me-setting` 可点 → `appActions.updateSettings({ autoSpeakOnCard: !settings.autoSpeakOnCard })`。
4. **试听**：`<TtsButton text={STRINGS.me.previewText} settings label={STRINGS.me.preview} />`（`こんにちは`）。
5. **解锁规则**：整行可点 → `appActions.toggleUnlockRule()`（与 StageMap 规则行同一 action，两处状态同步）。
6. **学习统计**：见 §10（8 行）。
7. **导出数据**：
   ```ts
   const payload = {
     version: 1,
     exportedAt: new Date().toISOString(),
     progress: state.progress,
     session: state.session,
     settings: state.settings,
   }
   const text = JSON.stringify(payload)
   const ok = copyText(text)
   setExportNotice(ok ? STRINGS.me.exported : STRINGS.me.exportFailed)
   setExportText(text)
   ```
   - `copyText`（`src/services/clipboard.ts`）：先 `lynx.setClipboardData`，后 `navigator.clipboard.writeText`，失败返回 `false`；
   - **零静默失败**：复制失败也要把 JSON 全文渲染出来（`.Me-exportText`）供手动复制；
   - 导出**不含** `runtime` 分片。
8. **清空进度（两段确认）**：
   ```ts
   function onReset() {
     if (!resetArmed) { setResetArmed(true); return }
     appActions.resetAllProgress()
     setResetArmed(false); setExportNotice(null); setExportText(null)
   }
   ```
   - 第一次点击 → `resetArmed = true`，文案变 `再次点击确认清空`，样式加 `.Me-reset--armed`；
   - 第二次点击 → 真正清空 + 复位所有导出态；
   - 无超时自动解除（保持 armed 直到清空）。

### 9.5 统计行数据（8 行，供 §10 StatTimeline）

```ts
const rows: StatRow[] = [
  { label: '词条总数', value: allWords.length,   display: `${allWords.length}`,              ratio: allWords.length === 0 ? 0 : 1 },
  { label: '已学',     value: seen,              display: `${seen}/${allWords.length}`,      ratio: allWords.length === 0 ? 0 : seen / allWords.length },
  { label: '已掌握',   value: mastered,          display: `${mastered}/${allWords.length}`,  ratio: allWords.length === 0 ? 0 : mastered / allWords.length },
  { label: '需强化',   value: weak,              display: `${weak}`,                         ratio: allWords.length === 0 ? 0 : weak / allWords.length },
  { label: '语法点',   value: grammarSeen,       display: `${grammarSeen}/${allGrammars.length}`, ratio: allGrammars.length === 0 ? 0 : grammarSeen / allGrammars.length },
  { label: '今日新学', value: stats.newCount,    display: `${stats.newCount}/${DAILY_NEW_GOAL}`,    ratio: stats.newCount / DAILY_NEW_GOAL },
  { label: '今日复习', value: stats.reviewCount, display: `${stats.reviewCount}/${DAILY_REVIEW_GOAL}`, ratio: stats.reviewCount / DAILY_REVIEW_GOAL },
  { label: '今日语法', value: stats.grammarCount,display: `${stats.grammarCount}/${DAILY_GRAMMAR_GOAL}`, ratio: stats.grammarCount / DAILY_GRAMMAR_GOAL },
]
```

常量：`DAILY_NEW_GOAL = 20`、`DAILY_REVIEW_GOAL = 35`、`DAILY_GRAMMAR_GOAL = 2`（`src/constants/srs.ts`）。

派生口径：
- `seen` = `progress[w.id]?.seen === true` 的词条数；
- `mastered` = `progress[w.id]?.state === '已掌握'` 的词条数；
- `weak` = `selectWeakWords(state).length`（`需强化`/`模糊` 且 `seen`，按 `wrongCount` 降序、id 升序）；
- `grammarSeen` = `progress[g.id]?.seen === true` 的语法数；
- 今日三项直接取 `state.session.todayNewCount / todayReviewCount / todayGrammarCount`。

> ⚠️ 今日三项的 `ratio` **未做 0 除保护**（`DAILY_*_GOAL` 恒 > 0，故安全），但可能 > 1（超额完成）→ 由 `StatTimeline` 的 `clamp01` 收敛到 1。

### 9.6 数据依赖

| 来源 | 调用 |
|---|---|
| store | `useAppStore(s => s)`、`useSettings()`、`state.progress`、`state.session`、`state.settings` |
| actions | `appActions.updateSettings`、`appActions.toggleUnlockRule`、`appActions.resetAllProgress` |
| `repository` | `getAllWords()`、`getAllGrammars()` |
| selectors | `selectTodayStats(state, Date.now())`、`selectWeakWords(state)` |
| services | `copyText`（`src/services/clipboard.ts`） |
| 常量 | `DAILY_NEW_GOAL` / `DAILY_REVIEW_GOAL` / `DAILY_GRAMMAR_GOAL` |

### 9.7 Lynx 特有写法 → Web 改写

| Lynx | Web |
|---|---|
| `<view>` / `<text>` | `<div>` / `<span>` |
| `catchtap` | `onClick` + `e.stopPropagation()` |
| `lynx.setClipboardData`（`services/clipboard.ts`） | `navigator.clipboard.writeText`（Web 原生可用）；失败时保留「渲染文本兜底」逻辑 |
| 页面不可滚动 | **Web 需补 `overflow-y: auto`**（本页内容最长：4 个 block + 8 行统计 + 可能很长的 JSON 文本） |
| `useMemo`/`useState` from `@lynx-js/react` | from `react` |

**Web 侧新增补偿**：
- `.Me-exportText` 需 `word-break: break-all` + `max-height` + `overflow:auto`（JSON 单行可能极长，原实现在 Lynx 下会被父容器裁切）。
- 步进器建议补 `aria-label` / `title`（桌面端无触摸热区概念）。
- `user-select: text`（**这一处例外**：导出文本需要可选中复制，不要全局 `user-select:none` 覆盖它）。

---

## 10. `src/components/StatTimeline/index.tsx` + `index.css`（学习统计横条）

### 10.1 结构

```
.StatTimeline                 flex column, width 100%
└─ .StatTimeline-row ×N       flex row, align center, width 100%, mb --space-sm
   ├─ .StatTimeline-label     row.label     width 160rpx, font-sm, muted
   ├─ .StatTimeline-track     flex:1, height 20rpx, bg --color-surface-alt, pill, overflow hidden
   │  └─ .StatTimeline-fill   height 20rpx, bg --color-primary, pill, width = ratio%
   └─ .StatTimeline-value     row.display   width 200rpx, right, font-sm
```

```tsx
export interface StatRow {
  label: string       // 行标签（唯一，作为 key）
  value: number       // 原始数值（占比参考）
  display: string     // 展示文案（如 `12 / 20`）
  ratio: number       // 0..1（越界自动收敛）
}

function clamp01(value: number): number {
  if (Number.isNaN(value)) { return 0 }
  return Math.min(Math.max(value, 0), 1)
}

// 填充宽度：round(clamp01(ratio) * 100)%
style={{ width: `${Math.round(clamp01(row.ratio) * 100)}%` }}
```

### 10.2 视觉样式（完整）

```css
/* StatTimeline：P9 学习统计横条列表 */
.StatTimeline {
  display: flex;
  flex-direction: column;
  width: 100%;
}
.StatTimeline-row {
  display: flex;
  flex-direction: row;
  align-items: center;
  width: 100%;
  margin-bottom: var(--space-sm);
}
.StatTimeline-label {
  width: 160rpx;
  font-size: var(--font-sm);
  color: var(--color-text-muted);
}
.StatTimeline-track {
  flex: 1;
  height: 20rpx;
  background-color: var(--color-surface-alt);
  border-radius: var(--radius-pill);
  overflow: hidden;
}
.StatTimeline-fill {
  height: 20rpx;
  background-color: var(--color-primary);
  border-radius: var(--radius-pill);
}
.StatTimeline-value {
  width: 200rpx;
  text-align: right;
  font-size: var(--font-sm);
  color: var(--color-text);
}
```

### 10.3 交互 / 数据

- **纯展示组件**：无事件、无 store 依赖；数据全部由 `MePage` 派生后经 `rows` prop 传入。
- `key` 用 `row.label`（**8 行标签互不相同**，安全）。
- `value` 字段**在渲染中未被使用**（只用于数据结构语义），复刻时可保留（勿删，避免破坏 `StatRow` 契约）。
- 宽度取整：`Math.round(ratio * 100)` → 百分比整数（无小数）。

### 10.4 Lynx 特有写法 → Web 改写

| Lynx | Web |
|---|---|
| `<view>` / `<text>` | `<div>` / `<span>` |
| `style={{ width: 'xx%' }}` | 保留内联（动态值，合理）；或改 CSS 变量 `--w` |
| `overflow: hidden` | 同 |

**Web 侧注意**：`.StatTimeline-track` 的 `overflow:hidden` 与 `border-radius` 配合裁切 `.StatTimeline-fill` —— Web 下同样生效；但 `fill` 宽度很小时圆角会显示为「一个点」，与原实现一致。

---

## 11. `src/components/NodeStateBadge/index.tsx`（五态徽章）

### 11.1 结构（全部内联 style，**无 CSS 文件**）

```tsx
<view
  className="NodeStateBadge"
  style={{
    backgroundColor: style.background,
    borderRadius: RADIUS.pill,          // '999rpx'
    paddingLeft: SPACING.sm,            // '16rpx'
    paddingRight: SPACING.sm,
    paddingTop: SPACING.xs,             // '8rpx'
    paddingBottom: SPACING.xs,
  }}
>
  <text className="NodeStateBadge-label" style={{ color: style.color }}>
    {STRINGS.nodeState[props.state]}
  </text>
</view>
```

### 11.2 六态样式表（完整，含硬编码 rgba）

```ts
const STATE_STYLE: Record<NodeState, NodeStateStyle> = {
  locked:  { color: COLORS.textMuted, background: 'rgba(154, 164, 196, 0.14)' },  // #9aa4c4 @14%
  未学:    { color: COLORS.textMuted, background: 'rgba(154, 164, 196, 0.14)' },
  学习中:  { color: COLORS.warning,   background: 'rgba(240, 180, 74, 0.16)' },   // #f0b44a @16%
  模糊:    { color: COLORS.warning,   background: 'rgba(240, 180, 74, 0.12)' },   // #f0b44a @12%（注意：与「学习中」不同）
  已掌握:  { color: COLORS.success,   background: 'rgba(57, 196, 122, 0.16)' },   // #39c47a @16%
  需强化:  { color: COLORS.danger,    background: 'rgba(255, 95, 109, 0.16)' },   // #ff5f6d @16%
}
```

| 态 | 文字色 | 底色 |
|---|---|---|
| `locked` 未解锁 | `#9aa4c4` | `rgba(154,164,196,0.14)` |
| `未学` | `#9aa4c4` | `rgba(154,164,196,0.14)` |
| `学习中` | `#f0b44a` | `rgba(240,180,74,0.16)` |
| `模糊` | `#f0b44a` | `rgba(240,180,74,0.12)` |
| `已掌握` | `#39c47a` | `rgba(57,196,122,0.16)` |
| `需强化` | `#ff5f6d` | `rgba(255,95,109,0.16)` |

### 11.3 文案原文（完整，`STRINGS.nodeState`）

| 键 | 原文 |
|---|---|
| `locked` | 未解锁 |
| `未学` | 未学 |
| `学习中` | 学习中 |
| `模糊` | 模糊 |
| `已掌握` | 已掌握 |
| `需强化` | 需强化 |

### 11.4 使用点（3 处渲染 + 1 处恒不显示）

| 调用点 | 传入 |
|---|---|
| `pages/StageMap/index.tsx:63` | `selectStageNodeState(state, stage.id)` |
| `pages/StageMap/index.tsx:95` | `unlocked ? selectModuleNodeState(state, module.id) : 'locked'` |
| `pages/GrammarDetail/index.tsx:224` | `progress?.state ?? '未学'` |
| `pages/VocabDetail/index.tsx:126` | `progress?.state ?? '未学'` |
| `components/WordCard/index.tsx:39` | `props.nodeState`（Study 页**从不传** → 恒不显示） |

### 11.5 Lynx 特有写法 → Web 改写

| Lynx | Web |
|---|---|
| 无 `index.css`，样式全在内联 style | **推荐**：新建 `NodeStateBadge.css`，把 6 态改成 CSS 类（`.NodeStateBadge--locked` / `--未学` … 或用 `data-state` 属性选择器），色值提到 CSS 变量 |
| `className="NodeStateBadge"` / `"NodeStateBadge-label"` | 目前是**死 className**（无对应 CSS）；迁移时要么补 CSS，要么删除 |
| 内联 `COLORS/RADIUS/SPACING` JS 常量 | → `var(--color-*)` / `var(--radius-pill)` / `var(--space-*)` |
| `<view>` / `<text>` | `<div>` / `<span>` |

**注意**：`NodeStateBadge` 的 `state` 类型是 `NodeState = 'locked' | SrsState`（6 值），而 `progress.state` 是 `SrsState`（5 值），通过 `?? '未学'` 兜底 —— 语法 / 词条详解页**永远不会显示「未解锁」**。

---

## 12. `src/components/GrammarHighlightText/index.tsx` + `index.css`（例句高亮）

### 12.1 结构（嵌套 `<text>` 富文本）

```tsx
<text className="Ght">
  {segments.map((segment) => {
    const className = segment.grammar
      ? 'Ght-seg Ght-seg--grammar'
      : segment.word
        ? 'Ght-seg Ght-seg--word'
        : 'Ght-seg'
    const grammarId = segment.grammarId
    const tappable = segment.grammar && grammarId !== undefined && handler
    return (
      <text
        key={segment.key}
        className={className}
        catchtap={tappable ? () => { handler?.(grammarId as string) } : undefined}
      >
        {segment.text}
      </text>
    )
  })}
</text>
```

```ts
interface GrammarHighlightTextProps {
  text: string                                    // 例句原文（日文）
  ranges: HighlightRange[]                        // 高亮区间（词条 + 语法）
  onTapGrammar?: (grammarId: string) => void      // 点语法片段 → 跳 P5
}
```

### 12.2 视觉样式（完整）

```css
/* GrammarHighlightText：例句高亮（词条底色 / 语法下划线） */
.Ght {
  font-size: var(--font-md);
  line-height: 1.6;
}
.Ght-seg {
  font-size: var(--font-md);
}
/* 词条命中：柔和底色 */
.Ght-seg--word {
  background-color: var(--color-primary-soft);
  border-radius: var(--radius-sm);
}
/* 语法命中：主题色 + 下划线（可点击） */
.Ght-seg--grammar {
  color: var(--color-primary);
  text-decoration: underline;
}
```

### 12.3 切分规则（`src/services/highlight.ts`，纯函数）

- `HighlightRange { start, end, kind: 'word'|'grammar', id? }`，区间**左闭右开**，指向 `ja` 字符串下标。
- 被忽略的区间：非有限数（`NaN`/`Infinity`）、`Math.floor` 后 `end <= start`；越界部分自动夹取到 `[0, length]`。
- **词与语法可重叠**：重叠段同时带 `word` 与 `grammar` 标记，但渲染时 `className` 判定是**语法优先**（先判 `segment.grammar`）→ 重叠段显示为语法样式（主色 + 下划线），**词条底色被覆盖**。
- 片段切分按「(word, grammar, grammarId) 三元组是否变化」断句，`key = `${runStart}-${i}``。
- 空文本 → 返回 `[]`（渲染空 `<text>`）。

### 12.4 使用点

**仅 1 处**：`src/pages/VocabDetail/index.tsx:181`（P3 词汇详解的例句区）

```tsx
<GrammarHighlightText
  text={render.sentence.ja}
  ranges={render.ranges}
  onTapGrammar={(grammarId) => { nav.goGrammarDetail(grammarId) }}
/>
```

- `ranges` 由 `buildSentenceHighlight(sentence, wordId, grammarIdsToHighlight)` 产出；
- 缺偏移的语法点不进 `ranges`，改由 `missingGrammarIds` 退化为**文字列表**（`.Vocab-sentenceFallback`，以 ` / ` 连接 pattern）；
- ⚠️ **GrammarDetail 页的例句用的是普通 `<text>`，未用本组件**（P5 例句不高亮）。

### 12.5 Lynx 特有写法 → Web 改写

| Lynx | Web |
|---|---|
| 嵌套 `<text>`（Lynx 富文本） | 嵌套 `<span>`（**必须内联元素**，否则换行/行高不一致）；外层 `.Ght` 可用 `<p>`/`<div>` |
| `catchtap` on `<text>` | `onClick` + `e.stopPropagation()`；`<span>` 需 `cursor: pointer`（可点片段） |
| `line-height: 1.6`（无单位） | 同 |
| `text-decoration: underline` | 同 |

**Web 侧注意**：
- Lynx 的嵌套 `<text>` 是**行内**拼接；Web 下 `<span>` 数组之间若 JSX 产生多余空白/换行会引入可见空格 → 需保证片段数组无额外空白（本实现无空白，安全）。
- `border-radius` 作用于行内 `<span>` 在多行断行时会出现「断裂的圆角」→ 与原实现一致（Lynx 同样如此），若想修复需 `box-decoration-break: clone`（**属于体验改动，需显式决策**）。
- 语法片段可点 → 需 `role="button"` / 键盘可达性（Web 新增，原实现无）。

---

## 13. 图标资产（`src/assets/icons/*.svg`）

### 13.1 资产清单（18 个）

**统一规格**：`viewBox="0 0 24 24"`、`fill="none"`、`stroke="currentColor"`、`stroke-width="2"`、`stroke-linecap="round"`、`stroke-linejoin="round"`（Feather 风格线性图标）。

| 文件 | 语义 | 推测设计用途（**未在代码中引用**） |
|---|---|---|
| `audio.svg` | 圆形喇叭 + 播放三角 | 发音 / TTS 入口 |
| `book.svg` | 打开的书 | 词汇 / 词典 |
| `calendar.svg` | 日历 + 顶栏 + 两个挂耳 | 备考周 / 打卡 |
| `check.svg` | 对勾 | 已掌握 / 答对 |
| `chevron-left.svg` | 左尖括号 | 返回 / 上一张 |
| `chevron-right.svg` | 右尖括号 | 下一张 / 进入 |
| `close.svg` | ✕ | 关闭浮层（DetailSheet） |
| `flame.svg` | 火焰 | 连续打卡（streak） |
| `graph.svg` | 三点两线（三角图） | 知识图谱入口 |
| `home.svg` | 房子 | Tab 首页 |
| `plus.svg` | 十字 | 新增 |
| `review.svg` | 环形箭头 | Tab 复习 |
| `search.svg` | 放大镜 | 搜索 |
| `settings.svg` | 齿轮 | Tab 我的 / 设置 |
| `stages.svg` | 三点折线（斜向） | Tab 阶段 |
| `star.svg` | 五角星 | 收藏 / 重点 |
| `study.svg` | 两本叠放的书 | 学习入口 |
| `trophy.svg` | 奖杯 | 成就 / 完成 |

### 13.2 关键事实：**全部未被代码引用**

```
grep -rn "assets/icons" src/  →  0 命中
```

- 全应用**没有任何一处** import 这些 SVG；
- TabBar 是**纯文字**（§2.3）；
- 所有「按钮」都是 `view + text` 拼的 pill 形状，无图标；
- 即：这 18 个图标是**为后续迭代预留的资产**，当前 Lynx 实现中完全闲置。

### 13.3 迁移决策建议

| 方案 | 说明 | 建议 |
|---|---|---|
| A. 原样搬到 `src/assets/icons/`，Vite 用 `?react` / `?url` 引入 | 保留资产，等 UI 迭代时启用 | ✅ 推荐（零成本） |
| B. 打包为 SVG sprite（`vite-plugin-svg-icons`） | 运行时 `<use href="#icon-home">` | 可选（图标量大时更优） |
| C. 直接删除 | 减少仓库体积 | ❌ 不建议（品牌资产，且 `nijapl-brand_assets/` 另有品牌素材） |

### 13.4 Web 用法要点

- 图标内部用 `stroke="currentColor"` → 颜色由父级 `color` 继承，Web 下同样生效（**不要**改成硬编码 `stroke="#fff"`）。
- 尺寸：Lynx 侧无引用故无既定尺寸；Web 启用时建议 `width: 1em; height: 1em`（跟随字号）或 `calc(var(--rpx) * 40)`。
- 无 `fill` → 与线性品牌风格一致；若需实心版本需另出资产。
- 参考同仓品牌资产目录：`nijapl-brand_assets/`、`nijapl-brand.miora`（本次调研未展开）。

---

## 14. Lynx → Web 改写总表（本文件覆盖范围）

### 14.1 标签映射（本文新增部分）

| Lynx | Web | 出现位置 |
|---|---|---|
| `<view>` | `<div>` | 全文 |
| `<text>` | `<span>`（block 场景用 `<div>`/`<p>`） | 全文 |
| `<list className>` | `<div>` + `overflow-y:auto` | GrammarList |
| `<list-item item-key>` | `<div key>`（删 `item-key`） | GrammarList |
| `<svg content={string}>` | JSX `<svg>`（推荐）/ `dangerouslySetInnerHTML` | GraphCanvas |
| `main-thread:bindtouchstart/move/end` | `onPointerDown/Move/Up` + `onWheel` | GraphCanvas |

### 14.2 属性 / 事件映射

| Lynx | Web | 出现位置 |
|---|---|---|
| `catchtap` | `onClick` + `e.stopPropagation()` | 全文（StageMap / TabBar / Graph / GrammarList / GrammarDetail / Me / GraphCanvas） |
| `bindtap`（冒泡） | `onClick` | TabBar、GraphCanvas-outer |
| `'main thread'` 指令 | 删除 | GraphCanvas |
| `el.getAttribute/setAttribute('data-*')` | `useRef` 保存的普通对象 | GraphCanvas 手势 |
| `el.setStyleProperty(k, v)` | `ref.current.style[k] = v` | GraphCanvas 手势 |
| `style={{ camelCase }}` | CSS 类 + CSS 变量（保留少量动态值内联） | NodeStateBadge、GraphCanvas、StatTimeline |
| `useMemo/useState` from `@lynx-js/react` | from `react` | navigation.ts、Graph、GrammarList、Me、GraphCanvas |

### 14.3 单位

- 全部 `Nrpx` → `calc(var(--rpx) * N)`，或构建期转换。
- `1rpx` 边框 / 分隔线 → `max(1px, calc(var(--rpx)))`（桌面固定窗口下 <1px 会被舍入）：
  - `.TabBar` border-top、`.GrammarDetail-sentence` border-bottom、`.GrammarDetail-chip--link` border、`.GrammarDetail-evalBtn` border、`.Me-reset` border。
- `999rpx` pill → `9999px` 或保留 `999rpx`。
- 特殊固定尺寸（非令牌）：`110rpx`（TabBar 高）、`120rpx`（GrammarList-filterLabel）、`18rpx`（图例圆点）、`56rpx`（Me 步进按钮）、`100rpx`（Me 步进值）、`160rpx`（StatTimeline label）、`200rpx`（StatTimeline value）、`20rpx`（进度条高）、`760rpx`（画布视口高）、`640`（画布宽高，引擎内部纯数字）。

### 14.4 必须删除 / 替换的 Lynx 专有模块

| # | 项 | 位置 |
|---|---|---|
| 1 | `@lynx-js/react` 的 `root.render` | `src/index.tsx` |
| 2 | `import '@lynx-js/preact-devtools'` / `'@lynx-js/react/debug'` | `src/index.tsx` |
| 3 | `import.meta.webpackHot` | `src/index.tsx` |
| 4 | `main-thread:*` 事件 + `'main thread'` 指令 | `GraphCanvas/index.tsx` |
| 5 | `<svg content={string}>` | `GraphCanvas/index.tsx` |
| 6 | `<list>` / `<list-item>` / `item-key` | `GrammarList/index.tsx` |
| 7 | `lynx.setClipboardData` 分支 | `services/clipboard.ts`（Me 导出依赖） |
| 8 | 内联 style 中的 `COLORS/SPACING/FONT/RADIUS` JS 常量 | `NodeStateBadge`、`GraphCanvas` |
| 9 | `useMemo/useState` from `@lynx-js/react` | `navigation.ts`、Graph、GrammarList、Me、GraphCanvas |
| 10 | `MemoryRouter` 的 Lynx 动因（可保留实现） | `router/index.tsx`（**建议保留**，见 §1.7） |

### 14.5 必须**新增**的 Web 侧补偿（Lynx 不需要）

| 项 | 说明 | 涉及 |
|---|---|---|
| `overflow-y: auto` | **本文件 5 个页面在原实现下全部不可滚动**，内容超高被裁切。Web 端必须补滚动 —— 这是**体验修复**，非偏差 | StageMap / Graph / GrammarList / GrammarDetail / Me |
| `flex-shrink: 0` | `.TabBar` 在 flex column 父容器下会被内容区挤压 | TabBar |
| `min-height: 0` | flex 子项可滚动的前置条件（`flex:1` + `min-height:0`） | 各页面内容区 |
| `z-index` | `.TabBar`（sticky/fixed 时）、浮层需显式层级，Lynx 靠文档顺序 | TabBar |
| `cursor: pointer` | 所有可点区块：TabBar item、chip、stage module、graph tab/tool/node/enter、grammar item/chip、Me setting/stepper/export/reset、Ght 语法片段 | 全部 |
| `user-select: none` | 可点区块（**例外**：`.Me-exportText` 需 `user-select: text`） | 除导出文本外全部 |
| `touch-action: none` | 否则图谱手势被浏览器滚动吞掉 | GraphCanvas-content |
| `cursor: grab/grabbing` | 图谱拖拽反馈 | GraphCanvas |
| `wheel` + `preventDefault` | 桌面滚轮缩放（需 `passive:false`） | GraphCanvas |
| `word-break: break-all` + `max-height` | 导出 JSON 单行极长 | `.Me-exportText` |
| 滚动条隐藏 | 若保留 scroll-snap / 横向滚动容器 | 本文范围无横向滚动 |
| 字体 | Lynx 用宿主系统字体；Web 端需显式 `font-family`（含日文字形，避免中文优先渲染导致假名字形不符） | **全局**（尤其 `.GrammarDetail-sentenceJa`、`.GrammarDetail-pattern`、`.Ght`） |
| 键盘可达性 | `tabindex` / `role="button"` / 焦点环（原实现无） | 所有可点块 |

### 14.6 已知「原实现即如此」的细节（复刻时勿「顺手修好」）

| # | 细节 |
|---|---|
| 1 | `Me` 是 **Tab 页却有返回按钮**；栈底时 `nav.back()` 无效果 |
| 2 | `Me` 的 `STRINGS.me.resetDone`（`已清空`）**从未被使用** |
| 3 | `Me` 的音调步进复用语速的 `RATE_MIN/MAX/STEP` 常量（命名不精确但行为一致） |
| 4 | `Me` 导出 payload **不含 `runtime` 分片** |
| 5 | `Me` 的「今日三项」ratio 无 0 除保护（分母恒 > 0，安全），但可 > 1（由 `clamp01` 收敛） |
| 6 | `Me` 清空进度的 armed 状态**无超时自动解除** |
| 7 | `StageMap` 未解锁模块是**视觉禁用 + 逻辑短路**（事件仍绑定），非真禁用 |
| 8 | `StageMap` 的 `STRINGS.stage.sprintTitle`（`冲刺期`）**未被使用** |
| 9 | `StageMap` 切换解锁规则后，**已渲染的阶段卡立即重算**（无动画/无提示） |
| 10 | `Graph` 的 `focusId` 初值取自路由，**不随路由变化同步**（切视图不重置 focus） |
| 11 | `Graph` 切视图时**不带 `focus`** → word/grammar 视图回落各自列表的**第 0 项** |
| 12 | `Graph` 的 LEGEND 4 色**硬编码在 TS**（与令牌同值但重复定义） |
| 13 | `Graph` 的 `.Graph-detailBtnLabel` / `Me-exportLabel` / `GraphCanvas-nodeLabel` 是**深色字配主色/节点色底**（`color: var(--color-bg)`） |
| 14 | `GraphCanvas` 的 `panX/panY` state **除重置外从不改变**（无拖拽按钮），位移只来自手势直改 style |
| 15 | `GraphCanvas` 手势层绕过 React 直改 DOM，`data-cur-scale` 是唯一的跨手势状态载体 |
| 16 | `GraphCanvas` 的 `transform` 顺序是 `scale(k) translate(...)`（位移量会被 scale 放大） |
| 17 | `GraphCanvas` 的 `props.radiusScale` 从未被 Graph 页传入（恒用 2.4） |
| 18 | `svg.ts` 的聚焦色 `#4c6ef5` 与 `--color-primary #5b8cff` **不同**（两套蓝） |
| 19 | `svg.ts` 节点底圈是**白色填充** `#ffffff`，前景 DOM 圆是**主题色实底** —— 视觉上是「白圈 + 彩圆叠放」 |
| 20 | `GrammarList` 点已选中的周次**不会取消选中**（只能点「全部」） |
| 21 | `GrammarList` 的层级选项按**首次出现顺序**不排序；周次按**数值升序** |
| 22 | `GrammarDetail` 的 `relatedGrammars` 中 `target === undefined` 时 chip 仍渲染，文案退化为 `暂无关联语法` |
| 23 | `GrammarDetail` 的最后一条例句**也有** `border-bottom`（无 `:last-child` 处理） |
| 24 | `GrammarDetail` 的自评按钮**可反复点击**，无确认、无禁用 |
| 25 | `GrammarDetail` 例句**未使用** `GrammarHighlightText`（P5 例句不高亮） |
| 26 | `NodeStateBadge` **无 CSS 文件**，`className` 是死类名 |
| 27 | `NodeStateBadge` 的 `模糊` 底色 `@12%` 与 `学习中` 的 `@16%` **不同**（刻意区分） |
| 28 | `NodeStateBadge` 在语法/词条详解页**永远不显示「未解锁」**（`?? '未学'` 兜底） |
| 29 | `StatTimeline` 的 `StatRow.value` 字段**在渲染中未被使用** |
| 30 | `GrammarHighlightText` 中**语法样式优先于词条样式**（重叠段不显示词条底色） |
| 31 | 18 个图标资产**全部未被引用** |
| 32 | 路由 `/grammar`（列表）与 `/grammar/:grammarId`（详解）**同前缀**，靠精确匹配区分 |
| 33 | 兜底占位页 `PagePlaceholder` 的 `title`/`note` 是**硬编码字面量**（`页面不存在` / `未匹配到路由，请返回首页`），未进 `STRINGS` |

---

## 15. 附：本文涉及文件清单（迁移工作量参考）

| 文件 | 行数级别 | 改动量 |
|---|---|---|
| `src/index.tsx` | 12 | 小（入口替换） |
| `src/App.tsx` | 33 | 小（标签替换） |
| `src/App.css` | 153 | 小（单位 + `text{}` 基线） |
| `src/router/index.tsx` | 36 | 小 |
| `src/router/routes.tsx` | 62 | 小 |
| `src/router/navigation.ts` | 87 | 小（import 换源） |
| `src/constants/routes.ts` | 95 | **零**（纯逻辑） |
| `src/components/TabBar/index.tsx` | 36 | 小 |
| `src/pages/StageMap/index.tsx` + `.css` | 111 + 123 | 中（+滚动） |
| `src/pages/Graph/index.tsx` + `.css` | 211 + 142 | 中（+滚动） |
| `src/components/GraphCanvas/index.tsx` + `.css` | 247 + 71 | **大**（SVG + 手势重写） |
| `src/engine/graph/layout.ts` | 57 | **零** |
| `src/engine/graph/svg.ts` | 60 | 小（改 JSX 可选） |
| `src/engine/graph/view.ts` | 225 | **零** |
| `src/services/graphNav.ts` | 79 | **零** |
| `src/types/graph.ts` | 60 | **零** |
| `src/pages/GrammarList/index.tsx` + `.css` | 130 + 99 | 中（`<list>` → div + 滚动） |
| `src/pages/GrammarDetail/index.tsx` + `.css` | 262 + 188 | 中（+滚动） |
| `src/pages/Me/index.tsx` + `.css` | 273 + 171 | 中（+滚动 + 剪贴板） |
| `src/components/StatTimeline/index.tsx` + `.css` | 52 + 43 | 小 |
| `src/components/NodeStateBadge/index.tsx` | 51 | 中（内联 → CSS 类） |
| `src/components/GrammarHighlightText/index.tsx` + `.css` | 53 + 23 | 小（嵌套 text → span） |
| `src/services/grammarView.ts` | 61 | **零** |
| `src/services/highlight.ts` | 144 | **零** |
| `src/assets/icons/*.svg` × 18 | — | **零**（原样搬运） |
