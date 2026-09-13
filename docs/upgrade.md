# Nijapl 多平台升级规划（移动端优先）

> 状态：**v1.1（T01–T05 实施完成，待验收）**（规划 v1.0 于 2026-09-13 拍板，实施记录见 §9）
> 范围：一套代码，覆盖桌面（macOS / Windows / Linux）+ 移动端（iOS / Android），**移动端优先**。
> 技术基线：React 18 + TypeScript + Vite + **Tailwind CSS 4.x** + Wails v3（Go + WebView）。

## ★ 已拍板决策（2026-09-13）

| # | 决策项 | 结论 |
|---|---|---|
| 1 | Tailwind 迁移范围 | **全量迁移**（存量 `.css`/`rpx` 全部迁到 Tailwind，方便维护） |
| 2 | 移动端分享/截图保护/生物识别 | **暂缓**（不进本轮） |
| 3 | TTS 移动端通道 | **原生 `Mobile.Speak` 优先**（规避真机依赖局域网 IP） |
| 4 | iOS 验收 | **模拟器验收**（不做真机签名上架） |
| 5 | 响应式 | **PC / Mobile 差异化 UI/UX**（非单一竖屏假设） |
| 6 | 开发参考 | **Kitchen Sink 示例**，注重前端代码布局与优化 |

---

## 0. 目标与背景

### 0.1 目标

用**一套代码**构建可同时交付桌面子与移动端的日语词汇学习应用，通过**打包参数**决定目标平台，UI/UX **移动端优先**。

三条硬性要求（来自需求）：

1. **基于 React + TS**（已满足，保持不变）。
2. **引入 Tailwind CSS 4.x**（当前为纯手写 className + CSS 变量 + `rpx` 单位，需规划迁移策略）。
3. **打包时通过参数确定平台**（当前已有 `GOOS` / build tags 雏形，需统一、固化、补齐移动端）。

### 0.2 现状盘点（关键结论）

| 维度 | 现状 | 结论 |
|---|---|---|
| 桌面 | Wails v3 `beta.20`，`main.go` 单窗口 420×860（竖屏比例） | ✅ 已可用 |
| 移动端构建编排 | `build/ios/Taskfile.yml`、`build/android/Taskfile.yml` **已存在且完整**（`compile:go:shared` / `package` / `run` / `deploy` 齐全） | ✅ 骨架已就位，主要缺 UI 适配与平台差异化 |
| 前端平台检测 | `engine/wails.ts` 已有 `hasWailsRuntime()` / `isAndroid()` | ⚠️ 仅两枚函数，缺 iOS、缺系统化 platform 抽象 |
| 平台端口 | 存储 / TTS 已六边形隔离（`*.wails.ts` / `*.web.ts` / `*.ts` 三通道） | ✅ 架构良好，可平滑扩展 |
| 样式体系 | `rpx` 单位 + PostCSS 插件改写 + `constants/theme.ts` 设计令牌，**无 Tailwind** | ⚠️ 需规划 Tailwind 引入与 rpx 共存方案 |
| Go 侧平台能力 | `internal/services/system.go` 只有 `Platform()`（返回 `runtime.GOOS`）+ 剪贴板 | ⚠️ 缺 `application.Mobile` 能力接入 |

### 0.3 核心判断

Wails v3 官方已给出明确的「一套代码多平台」范式，本项目**骨架已满足 80%**，本次升级的本质是：

> **补齐前端 platform 抽象 + 引入 Tailwind 4.x 重构移动端优先样式 + 固化构建参数 + 接入移动端原生能力。**

---

## 1. Wails v3 多平台范式（官方规范，作为本规划的锚点）

### 1.1 同一 `main.go` + 同一前端

Wails v3 移动端**不是独立工程**：Go 后端以 `GOOS=ios` / `GOOS=android` 编译，前端（HTML/JS/CSS）原样复用，由原生 WebView 承载（iOS=WKWebView，Android=WebView+`WebViewAssetLoader`），资源从 Go 内存内联提供（`wails://` scheme，无端口）。

### 1.2 构建参数区分平台（关键）

- **编译目标**由 `GOOS` 决定：`darwin` / `windows` / `linux` / `ios` / `android`。
- **条件编译**用 build tags：`//go:build ios` / `//go:build android` / `//go:build darwin` 等。
- 本项目 Taskfile 已用 build tags 区分：`-tags production,ios` / `-tags production,android`（见 `build/ios/Taskfile.yml`、`build/android/Taskfile.yml`）。

### 1.3 两条 build tag 铁律（官方）

- **`ios` 蕴含 `darwin`**：打 `//go:build darwin` 的文件也会在 iOS 编译。只针对 macOS 时写 `//go:build darwin && !ios`。
- **`android` 蕴含 `linux`**：打 `//go:build linux` 的文件也会在 Android 编译。只针对桌面 Linux 时写 `//go:build linux && !android`。
- 运行期 `runtime.GOOS` 分别返回 `"ios"` / `"android"`。

### 1.4 运行期平台检测（共享代码内分支用这个，而非 build tags）

Go 侧（`application.System`，所有构建都可用，无需 build tag）：

```go
import "github.com/wailsapp/wails/v3/pkg/application"

if application.System.IsMobile() { /* iOS/Android */ }
if application.System.IsDesktop() { /* mac/win/linux */ }
if application.System.IsPlatform(application.PlatformIOS) { /* 仅 iOS */ }
// IsMobile / IsDesktop / IsServer / IsPlatform(PlatformMacOS|Windows|Linux|IOS|Android|Server)
```

前端侧（`@wailsio/runtime`，已有该依赖）：

```ts
import { System } from '@wailsio/runtime'
if (System.IsMobile()) { /* ... */ }
if (System.IsIOS()) { /* ... */ }   // 另有 IsAndroid / IsMac / IsWindows / IsLinux / IsDesktop
```

### 1.5 移动端原生能力入口（`application.Mobile`）

一个**编译守卫的跨平台 manager**，桌面构建下所有方法为 no-op、查询返回零值，因此**共享 Go 代码可无条件调用**：

```go
dbDir := application.Mobile.StoragePath() // 桌面返回 ""，真机返回应用私有目录
```

能力清单（iOS/Android 签名一致）：`Share` / `OpenURL` / `SetKeepAwake` / `SetTorch` / `SafeAreaJSON` / `AppInfoJSON` / `SetOrientation` / `SetStatusBar` / `StoragePath` / `PowerJSON` / `NetworkJSON` / `BiometricAuthenticate` / `SecureGet/SecureDelete` / `GetLocation` / `Haptic` / `SetMotion` / `SetProximity` / `Speak/StopSpeak` / `SetKeyboardWatch` / `SetScreenProtect` / `CapturePhoto/CaptureVideo`。

**本规划的关键意义**：`Mobile.Speak(text)` / `Mobile.StopSpeak()` 可直接作为移动端 TTS 的**原生降级通道**，替代当前前端 `speechSynthesis`（iOS 上行为不可靠）。

---

## 2. 架构改造规划

### 2.1 新增「platform」抽象层（前端）

当前 `engine/wails.ts` 只有零散的两枚函数，规划收敛为**单一平台真相源**。

新增文件：`frontend/src/engine/platform/index.ts`（及 `types.ts`）

```ts
// types.ts
export type PlatformKind = 'macos' | 'windows' | 'linux' | 'ios' | 'android' | 'web'
export type FormFactor = 'mobile' | 'desktop'

// index.ts —— 探测优先级：Wails System（真实宿主）→ UA 兜底（Web 预览/单测）
export function detectPlatform(): PlatformKind
export function isMobile(): boolean      // ios | android
export function isDesktop(): boolean     // macos | windows | linux
export function isIOS(): boolean
export function isAndroid(): boolean
```

设计要点：
- **优先用 `@wailsio/runtime` 的 `System`**（宿主内最权威）；无宿主时回退到 `navigator.userAgent`（保持现有 `isAndroid()` 的守卫式、永不 throw 风格）。
- 现有 `hasWailsRuntime()` / `isAndroid()` 的调用方**迁移到新抽象**，旧函数保留为兼容别名或直接删除（见 §5 迁移清单）。
- **单一真相源**：页面 / store / service 一律经 `engine/platform` 判断，禁止散落 UA 判断（对齐「平台能力隔离」红线）。

### 2.2 Go 侧平台能力扩展

`internal/services/system.go` 当前 `Platform()` 返回 `runtime.GOOS`。规划：

- **保留** `Platform()` 兼容（前端已有绑定）。
- **新增**移动端能力服务 `internal/services/mobile.go`，暴露本项目需要的子集（按需，见 §4 优先级）：

```go
type Mobile struct{}
func (m *Mobile) SafeArea() string    // Mobile.SafeAreaJSON()
func (m *Mobile) KeepAwake(on bool)   // 学习会话保持常亮
func (m *Mobile) Haptic(kind string)  // 自评/翻页触觉反馈
func (m *Mobile) Share(text string)   // 分享（P9 导出）【后续】
```

- **TTS 原生降级**：在 `internal/services/tts.go` 增加移动端路径，HTTP 失败时调用 `application.Mobile.Speak(text)` / `StopSpeak()`（原生 `AVSpeechSynthesizer` / `TextToSpeech`），补齐当前桌面三级链路在移动端缺失的「原生实时合成」一级。

### 2.3 前端端口扩展（TTS / 存储）

- **TTS**：`engine/tts/index.ts` 的 `detectRealtimePort()` 目前在移动端会落到 Web `speechSynthesis`。规划改为：移动端优先走 Go 绑定的 `Mobile.Speak`（经新的 mobile service 绑定），Web `speechSynthesis` 降级仅在桌面浏览器保留。
- **存储**：`engine/storage/index.ts` 探测链 `Wails → Web(localStorage) → 内存` 在移动端天然正确（APK 内 `hasWailsRuntime()` 为真，走 Go `KVStore`）。**无需改动**，仅需确认 `KVStore` 在移动端落盘路径正确（见 §5 验证项）。

---

## 3. Tailwind CSS 4.x 引入规划

### 3.1 目标与边界

- **引入 Tailwind v4**（当前最新 4.x，用 Vite 插件 `@tailwindcss/vite`，无需 `tailwind.config.js`，主题走 CSS-first 的 `@theme`）。
- **不强制一次性重写全部样式**。现有 2311 个前端文件里 CSS 是「className + `.css` 文件 + `rpx` 单位」体系，全部推到 Tailwind 成本高、风险大（且违反「不要顺手修好 / 保真」红线）。

### 3.2 全量迁移策略（已拍板）

老板决策：**全部迁移到 Tailwind**（方便维护），不走双轨并行。因此：

| 层 | 策略 |
|---|---|
| **设计令牌** | 把 `App.css` 的 `:root` 变量 + `constants/theme.ts` 的 `COLORS/SPACING/FONT/RADIUS` 映射为 Tailwind `@theme`（`--color-*`、`--spacing-*` 等），让 Tailwind 工具类与现有令牌**共享同一套值** |
| **存量页面/组件** | **全部迁移**：`.css` 文件内容 → Tailwind 工具类（className），删除迁移后的 `.css` 文件与 `rpx` PostCSS 插件 |
| **rpx 单位** | **废除**：迁移完成后移除 `vite.config.ts` 的 `rpxPlugin`；尺寸统一由 Tailwind spacing 体系表达（`@theme` 的 `--spacing-*`） |
| **JS 尺寸常量** | `constants/theme.ts` 的 `SPACING/FONT/RADIUS`（`'calc(N * var(--rpx))'`）同步改造为 Tailwind 令牌或纯 px，消除 `var(--rpx)` 依赖 |

> ⚠️ 迁移规模大（2311 前端文件，其中 `.css` 遍布 `pages/*` / `components/*`），且受「保真红线」约束（视觉/字号/行为不得漂移）。**必须按 §6 分阶段、逐页迁移，每阶段跑 `test:audit` + 视觉比对作为门禁**，禁止一次性重写。

### 3.3 `@theme` 映射草案（`frontend/src/styles/tokens.css` 或直接内联于入口 css）

```css
@import "tailwindcss";

@theme {
  /* 颜色 —— 与 constants/theme.ts 的 COLORS 一一对应 */
  --color-bg: #0b1020;
  --color-surface: #151b30;
  --color-surface-alt: #1d2540;
  --color-text: #f5f7ff;
  --color-text-muted: #9aa4c4;
  --color-primary: #5b8cff;
  --color-primary-soft: rgba(91, 140, 255, 0.16);
  --color-success: #39c47a;
  --color-warning: #f0b44a;
  --color-danger: #ff5f6d;
  --color-border: rgba(255, 255, 255, 0.12);

  /* 间距 —— 保留 rpx 语义，Tailwind 工具类可直接用 --spacing-* */
  --spacing-xs: calc(8 * var(--rpx));
  --spacing-sm: calc(16 * var(--rpx));
  --spacing-md: calc(24 * var(--rpx));
  --spacing-lg: calc(32 * var(--rpx));
  --spacing-xl: calc(48 * var(--rpx));

  /* 字号 */
  --text-xs: calc(20 * var(--rpx));
  --text-sm: calc(24 * var(--rpx));
  --text-md: calc(28 * var(--rpx));
  --text-lg: calc(36 * var(--rpx));
  --text-xl: calc(56 * var(--rpx));
}
```

> 说明：Tailwind v4 的 `@theme` 变量会自动生成对应工具类（`bg-surface` / `text-muted` / `p-md` / `text-md` 等），**语义与现有令牌一致**，大幅降低迁移摩擦。

### 3.4 安装与接线（`frontend/`）

```bash
npm install -D tailwindcss @tailwindcss/vite
```

`vite.config.ts` 增加：

```ts
import tailwindcss from '@tailwindcss/vite'
export default defineConfig({
  plugins: [react(), tailwindcss(), wails('./bindings')],
})
```

入口 css（`src/main.tsx` 引入的全局样式）首行加 `@import "tailwindcss";` + `@theme` 块。

### 3.5 移动端优先的响应式断点

- Tailwind 默认 `sm/md/lg/xl/2xl` 是**移动优先**（`min-width`），与「移动端优先」目标天然契合。
- **默认即移动布局**，桌面端用 `md:` / `lg:` 前缀做增强（例如「桌面加宽内边距 / 双栏」）。
- 因本项目桌面窗口本身就是 420×860 竖屏（`main.go`），**桌面与移动的视觉差异很小**，这是本项目做「移动端优先 + 响应式」的天然优势：绝大多数样式无需断点，只在需要横屏 / 大屏时补 `lg:`。

---

## 4. 移动端优先的 UI/UX 规划

### 4.1 安全区（Safe Area）适配

iOS 刘海 / Android 挖孔屏需要安全区避让。规划：

- 全局 CSS 增加 `env(safe-area-inset-*)` 处理：`viewport-fit=cover` 已在 `index.html` 声明。
- `App.css` 的 `.App` / `.Shell` 预留安全区变量（`padding-top: env(safe-area-inset-top)` / `padding-bottom: env(safe-area-inset-bottom)`），TabBar 底部避让。
- 更精确的 insets 可从 `application.Mobile.SafeAreaJSON()`（Go 侧）经绑定下发，前端存为 `engine/platform` 的运行时值。

### 4.2 交互差异化

| 场景 | 移动端 | 桌面端 |
|---|---|---|
| 点击区域 | 遵循移动端最小 44px 触控目标 | 可更紧凑 |
| 长按 | 预留（如词条复制 / 发音菜单） | 右键 / hover |
| 触觉反馈 | `Mobile.Haptic('impact')` 用于自评 / 翻卡 | 无 |
| 常亮 | 学习会话 `SetKeepAwake(true)` | 无 |
| hover | 无 hover（触屏） | 保留 hover 态 |

- 用 `engine/platform` 的 `isMobile()` 做**行为分支**，用 Tailwind 的 `pointer-*` / `md:` 变体做**样式分支**。

### 4.3 视觉保真约束

- 项目红线要求「与原 Lynx 行为逐处一致」，**Tailwind 迁移不得改变视觉**。迁移任一页面时，必须以 `npm run test:audit`（P0 行为审计）与视觉比对为门禁。
- 设计令牌值（颜色 / 间距 / 字号）**保持原值不变**，只是换表达方式（CSS 变量 → Tailwind `@theme`），确保像素级一致。
- **Tailwind v4 preflight 需对齐**：preflight 会重置浏览器默认样式（含字号、盒模型、`display`），可能与「14px 基准」「`<div>` block」等既有约定冲突，迁移首件验证项即是对齐 preflight（见 §7.1 风险 1/4）。

### 4.4 PC / Mobile 差异化 UI/UX（老板补充要求）

当前 `main.go` 是固定 420×860 竖屏单窗口，**桌面端与移动端视觉几乎无差异**。老板要求「响应式布局，注意 PC/Mobile 的 UI/UX」，因此桌面端需要**真正的响应式**，而非单一竖屏：

| 维度 | Mobile（默认） | PC（`lg:` 及以上） |
|---|---|---|
| 布局 | 单列竖屏，全屏卡片 | 内容居中限宽（`max-w-*`），可多列 / 侧栏 |
| 窗口 | 全屏（iOS/Android） | 窗口可自由拉伸，`main.go` 增加桌面窗口默认尺寸与最小尺寸 |
| 导航 | 底部 TabBar（现状） | 可选侧边栏 / 顶栏（需产品定，见 §7） |
| 触控 vs 指针 | 44px 触控区、无 hover | 更紧凑、保留 hover / 右键 |
| 安全区 | `safe-area-inset` 避让 | 无安全区 |

- 用 Tailwind 移动优先断点：**默认写 Mobile 布局，`lg:` 前缀做 PC 增强**。
- 桌面窗口需在 `main.go` 增加默认尺寸（如 900×860 或更大）与 `MinWidth/MinHeight`，让响应式有「展开」的物理空间（否则 `lg:` 断点永远不触发）。

### 4.5 参考 Kitchen Sink 示例（老板补充要求）

Wails 官方 `v3/examples/mobile` 是「一套代码多端」的权威样板，重点借鉴其**前端代码布局与优化**：

1. **平台能力走 `engine/platform` 单例**：前端用 `System.IsMobile()/IsIOS()/IsAndroid()` 做行为分支（Kitchen Sink 的 Mobile/Hardware Tab 即用平台检查在桌面隐藏）。
2. **Go 侧用 build tag 隔离平台专属 handler**：移动端专属能力注册在 `//go:build ios/android` 文件，桌面不注册（对齐本项目「六边形隔离」红线）。
3. **`application.Mobile` 无条件调用**：跨平台共享能力（TTS/安全区/常亮/触觉）走 `Mobile.*`，桌面自动 no-op。
4. **前端代码布局**：以本项目现有 `engine/`（平台端口）→ `services/`（编排）→ `pages/`（视图）分层对齐 Kitchen Sink 的 `bindings/events/dialogs/system` 分 Tab 组织，**不引入新框架，只做能力接入**。
5. **构建**：`wails3 task ios:run` / `android:run` / `run`（桌面）三态一致，即本项目 Taskfile 已具备的形态。

---

## 5. 构建参数统一与固化

### 5.1 目标

把「打包参数确定平台」固化为**唯一的、可预期的入口**。现状 Taskfile 已按 `GOOS` 分派（`build` / `package` / `run` 三个顶层任务 → `{{.GOOS}}:*`），规划补齐并文档化。

### 5.2 顶层命令（期望形态）

| 平台 | 打包命令 |
|---|---|
| 桌面 macOS | `task package GOOS=darwin` |
| 桌面 Windows | `task package GOOS=windows` |
| 桌面 Linux | `task package GOOS=linux` |
| iOS 模拟器 | `task ios:package`（或 `task package GOOS=ios`） |
| iOS 真机 | `task ios:package IOS_PLATFORM=device CODESIGN_IDENTITY="..."` |
| Android | `task android:package`（`ARCH=arm64` 默认） |

### 5.3 前端构建注入平台信息

当前 `build/Taskfile.yml` 的 `build:frontend` 已用 `VITE_TTS_BASE_URL` 注入环境变量。规划增加**平台注入**：

- 在 `build:frontend` 的 `env` 增加 `VITE_PLATFORM={{.GOOS}}`（或经 `TARGET_PLATFORM`），前端 `engine/platform` 可用它做**构建期**平台固化（构建期 vs 运行期双通道，见 §2.1）。
- **运行期检测仍是主要手段**（同一产物可运行在多端），构建期注入用于**裁剪 / 差异化打包**（如移动端不打桌面专属资源）。

### 5.4 需补齐的构建缺口

- **统一 iOS / Android 的 `TTS_BASE_URL` 烘入**：Android 已有 `-X nijapl/internal/config.buildTTSBaseURL`，确认 iOS `compile` 链路是否同样烘入（当前 iOS `BUILD_FLAGS` 未见该 ldflag，见 `build/ios/Taskfile.yml` line 57）——**规划补齐 iOS 的 TTS 地址烘入**。
- 移动端默认应优先走**原生 TTS**（`Mobile.Speak`），HTTP 服务地址仅作为可选覆盖，避免真机强依赖局域网 IP。

---

## 6. 实施阶段划分（建议顺序）

> 遵循「先分析后实施」：本规划评审通过后再按阶段落地，每阶段独立提交、独立验收。

| 阶段 | 内容 | 交付物 | 门禁 |
|---|---|---|---|
| **P1** | 前端 `platform` 抽象层 + Go `Mobile` 服务 + TTS 原生降级（`Mobile.Speak` 优先） | `engine/platform/*`、`internal/services/mobile.go`、`tts.go` 改动 | `typecheck + check + test` 全绿；桌面行为无回归 |
| **P2** | 引入 Tailwind 4.x（`@tailwindcss/vite` + `@theme` 令牌映射）+ **对齐 preflight**（14px 基准 / `<div>` block） | `vite.config.ts`、`styles/tokens.css` | `build` 通过；视觉与 P1 前一致 |
| **P3** | 安全区 + 移动端交互差异化（触觉 / 常亮 / 点击区）+ **桌面窗口默认尺寸与最小尺寸** | `App.css`、`platform` 分支、`mobile.go` 绑定、`main.go` 窗口选项 | iOS/Android 模拟器冒烟通过 |
| **P4** | **全量页面/组件 Tailwind 迁移**（逐页，删除 `.css` 与 `rpx` 插件） | 迁移后的全部页面/组件 | `test:audit` + 视觉比对通过；`rpxPlugin` 移除后 `build` 干净 |
| **P5** | 固化构建参数 + 补齐 iOS TTS 烘入 + 文档化 `task` 命令 | `Taskfile` 调整、README/本规划更新 | `task package` 各平台产物可运行 |
| **P6（可选）** | PC 导航形态（侧栏/顶栏）+ 移动端原生能力深化 | PC 布局 | 全量回归 |

> 注：因「全量迁移」+「PC/Mobile 差异化」，P4 由「挑 2 页样板」升级为「全量迁移」，工作量与风险显著上升，是本次最大的一环。P6 中「PC 导航形态」取决于 §7.3 产品确认。

---

## 7. 风险与待确认事项

### 7.1 风险

1. **Tailwind 与 `rpx` PostCSS 共存**：两者都是 CSS 处理链，需确认 `@tailwindcss/vite` 与现有 `rpxPlugin`（自定义 PostCSS 插件）的**执行顺序**，避免 `calc()` 嵌套或变量覆盖冲突。→ P2 首件验证项。
2. **移动端 `@wailsio/runtime` 的 `System` 可用性**：需在 iOS/Android 模拟器实测 `System.IsMobile()` / `System.IsIOS()` 返回是否准确（官方标注移动支持仍 `experimental`）。
3. **`Mobile.Speak` 在桌面 no-op**：需确认桌面构建下该路径正确短路，不影响现有 HTTP→native→web 三级链路。
4. **保真红线**：Tailwind 迁移若改变视觉/字号（Tailwind v4 preflight 会重置浏览器默认样式），可能与「14px 基准」「`<div>` block」等既有约定冲突，需显式关闭或对齐 preflight。

### 7.2 待确认事项

> 以下 4 项已在 2026-09-13 全部拍板（见文首「已拍板决策」表），此处保留作为决策留痕，不再阻塞。

- [x] **迁移范围**：全量迁移 Tailwind（✅ 决策 1）
- [x] **移动端扩展能力**：分享/截图保护/生物识别**暂缓**（✅ 决策 2）
- [x] **TTS 优先级**：移动端**原生 `Mobile.Speak` 优先**（✅ 决策 3）
- [x] **iOS 验收**：**模拟器验收**，不做真机签名（✅ 决策 4）

### 7.3 新增待确认（实施前需产品定）

- [x] **PC 导航形态**：**左侧边栏**（`components/Sidebar`，T05 落地）
  —— `<768px` 保持底部 TabBar 不动；`≥768px` 渲染侧栏 + 内容居中限宽，不再渲染 TabBar。
- [x] **PC 窗口默认尺寸**：**1180×800，最小 900×640**（T05 落地，见 §9-T05）
  —— 比原建议的 900×860 更宽，为 `≥768px` 断点留出足够余量。
- [x] **Tailwind 迁移的保真验收手段**：**构建产物反查 + 选择器全覆盖比对 + 门禁**
  —— 未引入组件渲染测试 / Playwright；**目视核对未执行**（无 GUI 环境），见 §9「未执行项」。

---

## 8. 参考

- Wails v3 移动端总览：<https://v3.wails.io/guides/mobile/>
- Mobile API（`application.Mobile`）：<https://v3.wails.io/guides/mobile/mobile-api/>
- Kitchen Sink 示例（一套代码多端）：<https://github.com/wailsapp/wails/tree/master/v3/examples/mobile>
- Tailwind CSS v4 + Vite：<https://tailwindcss.com/docs/installation/using-vite>

---

## 9. 实施记录（T01–T05）

> 与 §6 的阶段划分对应关系：T01=P2，T02=P1，T03/T04=P4，T05=P3+P5+P6。

### T01 — 基础设施 + Tailwind 4.x 接入

- 安装 `tailwindcss@4` / `@tailwindcss/vite`，`vite.config.ts` 加入 `@tailwindcss/vite`（与既有 `rpxPlugin` 并存）。
- 新建 `frontend/src/styles/index.css`：`@import "tailwindcss"` + `@theme` 设计令牌 + `:root` 迁移别名 + `@layer base` preflight 对齐。
- `main.tsx` 改引新入口；`App.css` 仅保留组件样式。
- **关键验证**：`@theme` 接受 `calc(N * var(--rpx))` 字面量（Tailwind 原样写入 `:root`，工具类只输出引用），故无需任何回退方案。

### T02 — platform 抽象 + Go Mobile + TTS 原生降级

- 新增 `frontend/src/engine/platform/{types,index}.ts`（单一真相源：`detectPlatform` / `isMobile` / `isDesktop` / `isIOS` / `isAndroid` / `getFormFactor` / `hasWailsRuntime`），删除 `engine/wails.ts`，3 处调用方迁移。
- 新增 `internal/services/mobile.go`（`Mobile`：**不加 build tag**，`application.Mobile` 在桌面是 no-op stub），`Speak` / `StopSpeak` / `SetKeepAwake` / `Haptic` / `SafeArea` / `Available`。
- 新增 `frontend/src/engine/tts/tts.mobile.ts`：`MobileTtsPort`。**`Speak` 是 void**，无法回传成功与否 → 采用**乐观返回** `{ ok: true, engine: 'native' }`（移动端无音频 URL，`player` 传 `null`）。
- `engine/tts/index.ts`：`detectRealtimePort()` 移动端优先探测原生 TTS。

### T03 / T04 — 全量 Tailwind 迁移（24 个 `.css`）

- 13 个页面 + 11 个组件的 `index.css` **全部**转为 Tailwind 工具类并删除；原语义类名保留作标记。
- `@theme` 补两处关键配置：
  - `--spacing: calc(1 * var(--rpx))` → 数字工具类 1:1 等于 rpx（`p-24` = 24rpx）；
  - `--text-{xs,sm,lg,xl}--line-height: normal` → 中和 Tailwind 默认字号自带的 line-height 伴生值，避免整体撑高。
- 条件类名统一走**互斥三元串**（`bg-primary` 与 `bg-surface-alt` 不同时出现），规避同优先级工具类的样式表排序不确定性。
- 后代选择器（`.X--on .Y`）无对应 Tailwind 工具类 → 下沉为子元素上的条件类，由父级状态驱动。

### T05 — 外壳迁移 + PC 响应式 + 构建固化 + rpx 收尾

- **外壳**：`App.css` 17 条规则迁为工具类并删除 → 全仓仅剩 `src/styles/index.css`。
- **PC 响应式**：新增 `router/useIsWide.ts`（`matchMedia('(min-width: 768px)')`，守卫式、永不 throw）与 `components/Sidebar`（`w-[220px]`，px 任意值）；`router/index.tsx` 拆成 `NarrowShell` / `WideShell` 两套骨架；`constants/routes.ts` 导出 `SIDEBAR_GROUPS` + `matchSidebarAction`（**最长前缀匹配**）。
- **构建固化**：移除 `vite.config.ts` 的 `rpxPlugin` 与 `css.postcss`；删除 `:root` 里的 `--space-*` / `--font-*` 迁移别名；`main.go` 窗口 1180×800 / 最小 900×640；`build/ios/Taskfile.yml` 补齐 TTS ldflag（对齐 Android）；`build/Taskfile.yml` 注入 `VITE_PLATFORM`。

#### T05 关键偏离与补充（3 项，均可独立回退）

1. **【偏离】新增 `@media (min-width: 768px) { :root { --rpx: 1px } }`**（`styles/index.css`）
   **原因**：`--rpx: 100vw / 750` 会把整站按视口等比放大——1180px 窗口下 1rpx≈1.57px，正文 `--text-sm`(24rpx) 涨到 ~38px，PC 布局不可用；且内容列被 `max-w-[calc(480*var(--rpx))]` 限制后，文字相对列宽会再放大约 1.56 倍。冻结为 1px 后 `480rpx = 480px`，正好贴近原 420 手机列。**移动端（<768px）行为完全不变**。
   **回退**：删掉这一个 media query 即可。
2. **【补充】侧栏字号/间距用 px 任意值**（`text-[15px]` / `px-[12px]` 等），不走 rpx 令牌——侧栏是纯 PC 组件，用 px 才能与 `w-[220px]` 保持一致的观感，且不受上述 rpx 基准策略调整影响。
3. **【修复】裸 rpx（既有 bug，独立一步）**：`vite.config.ts` 的 `rpxPlugin` 只改写 CSS、**不改写 JS 内联 style**，故 `gap: '8rpx'` / `size="28rpx"` 在浏览器里是非法单位、整条声明被丢弃（gap 恒为 0、图标尺寸失效）。修法：
   - `Icon` 的 `size` 支持解析 `"Nrpx"` 字符串 → `calc(N * var(--rpx))`（与非数字外的字符串仍原样透传）；
   - 19 处内联 `style={{ display:'flex', alignItems:'center', gap:'8rpx' }}` → className 上的 `flex items-center gap-8`（3 处多行写法同步收敛，仅保留 `color` 等非三件套属性）。
   **可见变更**：这些地方 gap 由 0 变为 8rpx / 6rpx，图标尺寸由「失效」变为 28rpx / 24rpx —— 属**恢复原设计意图**。

#### 未执行项（诚实标注）

- **目视 / 交互验收：未执行**。项目无 `@testing-library/react` / jsdom / playwright 依赖，无 GUI 环境（Wails 桌面需手动 launch，iOS 模拟器需 `task` 且本轮已确认忽略 iOS）。响应式（窄窗 TabBar ↔ 宽窗侧栏）**未做真实拖拽验证**。
- **iOS 模拟器冒烟：未执行**（本轮确认忽略 iOS）。`build/ios/Taskfile.yml` 的 ldflag 改动**只做了静态编写**，未编译验证。
- **`VITE_PLATFORM` 仅有注入、无消费点**（前端暂不需要构建期平台分支），符合规划的「构建期注入用于裁剪」定位。
- **`constants/theme.ts` 的 JS 令牌仍以 `calc(N * var(--rpx))` 表达**（与 `@theme` 值等价），未改为纯 px——`GraphCanvas` / `TtsButton` 的内联 style 仍依赖它，改造面更大，建议独立任务。
