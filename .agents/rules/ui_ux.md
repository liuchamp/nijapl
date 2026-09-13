# UI/UX 设计规则（本项目：Wails v3 多平台 + React 18 + Tailwind v4）

> 用途：代码助手的项目级指令，约束其在做 UI/UX 设计与前端实现时的行为。
> 适用范围：本仓库（Wails v3 多平台应用：桌面 + iOS / Android，`frontend/` 下 React 18 + Vite + Tailwind v4 + Biome 工具链；尺寸走 rpx 语义）。

---

## 0. 红线优先（最高约束，本文件任何条款与之冲突时以红线为准）

- **1:1 复刻优先**：`docs/migration/PLAN.md` §9“别顺手修好”清单、`docs/migration/PORTING-NOTES.md` §4 有意不修项优先于本文件所有审美与规范条款。**不得**借“去模板味 / 可访问性 / 三态 / 暗色 / 响应式”之名修复以下保留项：Quiz 无入口（P8）、Graph 暗色下白圈边线、TTS 降级时 `.WordCard-reveal` 被压窄、`GrammarDetail` 末尾按钮仍带 `margin-right:16rpx`、`StatTimeline` 末行仍带 `margin-bottom`。
  - 注：**响应式本身**（§1 的 768px 侧栏）是用户明确要求的新增能力，**不**属于「借响应式之名修保留项」；`<768px` 仍是原移动端布局的零改动复刻。
  - **已推翻的旧保留项**：早期「18 个 SVG 图标不接入」已作废——`components/Icon` 在 T01 首次接入这 18 个品牌图标（保持 `viewBox="0 0 24 24"` / `fill="none"` / `stroke="currentColor"` 原始契约），`TabBar` / `Sidebar` 与各页面均已使用。
- **固定契约优先**：中文文案唯一源 `frontend/src/constants/strings.ts`（`STRINGS.*`）、尺寸常量 `frontend/src/constants/theme.ts`、TTS 地址 `frontend/src/constants/tts.ts`、K 域 `kana:` 前缀隔离（`store/__tests__/kana-isolation.test.ts` 回归保护）。本文件 §5/§1 不得诱导手写文案、裸 `rpx`、IP/域名面量。
- **工具链以现状为准**：lint/format 用 Biome（`cd frontend && npm run check`），不引入 `prettier-plugin-tailwindcss`；不新增 `cva` / 双主题等依赖与机制。**断点是唯一例外**：T05 已引入单一 768px 断点（PC 侧栏，见 §1），**不得再加第二套**。

---

## 1. 视口与尺寸（多平台：移动端优先，桌面宽屏出侧栏）

- **窗口**：桌面默认 **1180×800**、最小 **900×640**（`main.go` 的 `WebviewWindowOptions`）；移动端由系统决定尺寸，这两组值不生效。
- **断点只有一条 768px，且判定走 JS、不走 Tailwind 变体**：
  - `<768px` → 原移动端单列 + 底部 TabBar（保真布局，**零改动**）；
  - `≥768px` → 左侧 `Sidebar`（`w-[220px]`）+ 居中限宽内容区（`max-w-[calc(480*var(--rpx))]`；宽屏下 `--rpx` 冻结为 1px，即 480px），**不渲染** TabBar。
  - 判定在 `frontend/src/router/useIsWide.ts`（`matchMedia('(min-width: 768px)')`），外壳在 `router/index.tsx` 的 `NarrowShell` / `WideShell`。
  - **禁止**用 `sm: / md: / lg: / xl: / 2xl:` 变体做布局分支（会让「判定」与「渲染」分家），**禁止**新增第二套断点。确需新断点时必须由用户明确要求，并在代码处注释理由。
- **唯一由断点驱动的 CSS**：`frontend/src/styles/index.css` 末段的 `@media (min-width: 768px) { :root { --rpx: 1px } }` —— 不冻结的话 `100vw / 750` 会把宽窗口下的整站等比放大到不可用。同文件里 `<320px` 退化为 `0.5px` 是原 Lynx 就有的不可读保护。
- **构建目标要显式声明**：`vite.config.ts` 的 `build.cssTarget: 'safari14'` 是必需的，不可删——Tailwind v4 内部用 Lightning CSS，默认会把 `@media (min-width: 768px)` 输出成 Media Queries L4 的 `@media (width>=768px)`，而 Ubuntu 22.04 LTS 自带的 WebKitGTK 2.36（≈Safari 15.4）不支持该语法，会导致 `--rpx` 冻结静默失效。
- **尺寸一律走 rpx 语义**：Tailwind 的 `--spacing` 基准即 `calc(1 * var(--rpx))`（见 `styles/index.css` 的 `@theme`），故数字工具类 `p-24` ≡ 24rpx、`gap-8` ≡ 8rpx，**任意整数 rpx 可 1:1 无损迁移**；非整数 / 组合值写任意值 `[calc(N*var(--rpx))]`。原 PostCSS `rpxPlugin` 已随 T05 的全量 Tailwind 迁移**从 `vite.config.ts` 移除**，**不要再写 `rpx` 原文**。
  - **`constants/theme.ts` 的 JS 尺寸常量**必须写 `'calc(N * var(--rpx))'`（JS 侧不经任何构建期改写，裸 `'Nrpx'` 在浏览器里是无效值）。
  - 禁止用固定 `px` 代替 rpx；禁止用 `clamp()` 流体式代替 rpx 倍数。
  - **例外**：`components/Sidebar` 是纯 PC 组件，刻意用 px 任意值（`w-[220px]` / `text-[15px]` / `gap-[10px]`），避免被宽窗口下的 `--rpx` 基准策略牵连。
  - **`components/Icon` 的 `size` 传字符串时只认 `"Nrpx"` 形式**（会转成 `calc(N * var(--rpx))`），其余字符串原样透传（如 `"18px"`）；传数字等价于 rpx。
- **状态传达**：`hover:` 不能是唯一的状态/功能传达手段；`focus-visible` 为 WCAG AA 硬性（SC 2.4.7），必须提供可见焦点样式（禁 `outline-none` 后无替代）；`:active` 为推荐实践（确认点击已注册），非强制。
- **触控尺寸勘误**：WCAG 2.2 AA 硬性底线为 **24×24 CSS px**（SC 2.5.8）；44×44 为 AAA（SC 2.5.5）/ Apple HIG 舒适基线。本项目为桌面 WebView，以不破坏 Lynx 对齐为前提，44px 取舒适基线，不做硬性卡点。

## 2. 设计克制与“去 AI 味”（重要；§0 豁免项不适用本节清理）

以下是 AI 生成 UI 的常见“模板味”特征，**除非用户明确要求，否则禁止默认使用**：

- 禁止默认配色：暖米色背景（近 `#F4F1EA`）+ 衬线大标题 + 陶土色强调色（近 `#D97757`）
- 禁止默认配色二：纯黑背景 + 单一荧光绿/朱红强调色
- 禁止“SaaS 卡片套件”：所有内容不分层级地切成同款圆角卡片，统一 `shadow-md`/`rounded-xl`，靠渐变背景做装饰
- 禁止模板化文案装饰：
  - 标题上方加全大写的 tracking-wide "eyebrow" 标签
  - 用中点 `·` 拼接的元信息（"A · B · C"）
  - 链接/按钮文字后缀 `→`
  - 用等宽字体做小型数据标签（除非确实是代码/数据展示场景）
- 禁止无意义地给标题中的单个词加粗/斜体/变色
- 禁止无意义的编号标记（01 / 02 / 03），除非内容确实是流程/时间线
- 动效克制：一次交互只保留一个“高光时刻”，禁止给每张卡片都加 hover 上浮 + 每个 section 都加 fade-slide-in

**豁免**：凡属 §0 红线保留项（Graph 白圈、TTS 压窄、末尾间距等），**不得**以“模板味 / 多余视觉 / 反直觉”为由清理。

**要求**：每个新页面/组件在编码前，先用一两句话说明“这次的调色板 / 字体 / 布局为什么适合这个具体业务”，如果说不出区别于默认模板的理由，重新选择。

## 3. Tailwind v4 使用规范（以本项目实际配置为准）

- **token 唯一入口是 CSS `@theme`，不是 `tailwind.config.js`**：本项目无 `tailwind.config.js`（Tailwind v4 CSS 配置），语义化 token 维护在 `frontend/src/styles/index.css` 的 `@theme` 块；JS 侧镜像在 `frontend/src/constants/theme.ts`。业务代码禁止 `bg-[#3a7bd5]` 这类魔法值（一次性场景除外），一律走主题变量。
- **混合写法规范**：允许“自定义组件类 + Tailwind 工具类”共存（如 `className="Sheet fixed inset-0 flex flex-col justify-end"`）。class 顺序建议：布局（display/position）→ 尺寸（w/h）→ 间距（p/m）→ 排版（font/text）→ 视觉（bg/border/shadow）→ 交互态（hover/focus/active）。不接入 `prettier-plugin-tailwindcss`（工具链为 Biome），不靠人工/AI 主观排序做门禁。
- **内联 `style={{}}` 仅限动态值**：如按数据算出的宽度百分比、`GraphCanvas` 的 `transform` / 绝对定位等已决策保留项。静态样式一律走工具类。
  - **内联 `style` 里禁止写裸 `rpx`**：构建期改写已随 PostCSS 插件移除，`style={{ gap: '8rpx' }}` 会被浏览器**整条丢弃**（gap 静默变 0、图标尺寸失效）。需要 rpx 语义时用工具类（`gap-8`），或在 JS 常量里写 `'calc(8 * var(--rpx))'`。
- **复用通过目录级组件抽象**：出现 3 次以上相同的类组合，抽成 `pages/` / `components/` 下的目录级组件，而不是每处手写。目录内只有一个 `index.tsx` —— **样式已全量迁为 Tailwind 工具类，不再有配套 `index.css`**（全仓仅剩 `src/styles/index.css` 一个 CSS 文件）。不引入 `cva` / `class-variance-authority`。
- **主题：永久深色，不建双主题**：项目基线为深色（`bg #0b1020` / 文字 `#f5f7ff`），无浅色基线、无切换开关。**不写** `dark:` 变体，不新增主题切换机制。

## 4. React 组件设计原则（在 §0 红线内执行）

- **状态与展示分离**：UI 组件（如 `Button`、`Card`）不直接耦合业务请求逻辑，数据获取放在容器组件/hooks 中。
- **受控优先**：表单类组件默认受控（controlled），必须支持 `value` + `onChange`，避免只支持 `defaultValue` 导致外部无法同步状态。（注：`KanaQuiz` 罗马音输入是本仓库唯一 `<input>`，其显式 `font-size` / `color` / `background` / `border` 声明为既定红线，不得借本条重构出无意义 diff。）
- **可访问性按规范级别执行，且不得“修复”已关闭规则**：
  - 交互元素用正确语义标签（不用 `div` 模拟 `button`），按钮须有非空 accessible name（WCAG SC 4.1.2，A 级硬性）；图标走 `components/Icon` 统一入口。
  - 必须有可见的 `focus-visible` 样式（WCAG SC 2.4.7，AA 硬性；禁止 `outline-none` 后不提供替代）。
  - 对比度区分场景：**文本 ≥ 4.5:1**（SC 1.4.3，AA）；**非文本 UI 组件（图标/边框）≥ 3:1**（SC 1.4.11，AA）。不得笼统要求“所有元素 4.5:1”。
  - `prefers-reduced-motion` 为最佳实践（对应 SC 2.3.3，AAA 级）；AA 合规门禁是自动播放可暂停（SC 2.2.2）。动效提供退化方案，但不虚构“WCAG 强制”级别。
  - `docs/migration/PORTING-NOTES.md` §5 已关闭的 5 条 Biome 规则（`a11y/useKeyWithClickEvents`、`a11y/noStaticElementInteractions`、`a11y/noSvgWithoutTitle` 等）为既定决策，**不得**借本节重新“修复”。
- **加载/空/错误态按需设计，不搞 universal 强制**：有意省略处不补（如 Quiz 无入口页不补三态）；TTS / 端口失败走“零静默失败”降级文案（端口永不 throw，失败必给用户可见文案）。其余确需三态处：
  - Loading：骨架屏或明确的加载指示，不用页面级白屏
  - Empty：给出下一步行动建议，而不是“暂无数据”四个字
  - Error：说明发生了什么、如何恢复，不是泛泛的“出错了”

## 5. 文案与交互语言（落点一律 `STRINGS.*`）

- 按钮文案用主动动词描述真实结果：“保存修改” 而非 “提交”；操作前后术语一致（按钮写“发布”，提示就不能突然变成“已上线”）。
- 面向最终用户的语言，不暴露实现细节（用户看到的是“通知设置”，不是“webhook 配置”）。
- 错误提示：说明原因 + 可执行的下一步，禁止“系统繁忙请稍后再试”这类无信息量文案（除非确实无法给出更具体原因）。
- **落点约束**：以上中文文案改动必须落在 `frontend/src/constants/strings.ts`（`STRINGS.*` 唯一来源），页面/组件禁硬编码中文；TTS 地址只走 `frontend/src/constants/tts.ts`，业务代码禁出现 IP / 域名面量。

## 6. 提交前自检清单（AI 每次改动 UI 后必须过一遍；项目门禁版）

1. 是否破坏 §0 红线保留项（Quiz 无入口、Graph 暗色下白圈边线、TTS 降级时 `.WordCard-reveal` 被压窄、`GrammarDetail` 末尾按钮的 `margin-right`、`StatTimeline` 末行 `margin-bottom`）？有则直接打回。
2. 是否使用了第 2 节禁止的默认模板特征？如果用了，是否有明确业务理由（含 §0 豁免判断）？
3. 交互元素语义是否正确、有 `focus-visible`、对比度是否达标（文本 4.5:1 / 非文本 3:1）？
4. 确需三态处是否显式设计（有意省略处除外；TTS/端口失败是否有可见降级文案）？
5. 颜色/间距是否走 `@theme` / `theme.ts`，有无魔法值？JS 尺寸是否为 `calc(N * var(--rpx))`？
6. 复用是否已抽成目录级组件，而非重复粘贴一长串 className（不引入 `cva`）？
7. 尺寸是否走 rpx 语义（工具类数字 / 任意值；JS 常量写 `calc(N * var(--rpx))`）？内联 `style` 里有无裸 `rpx`？有无误引第二套断点 / `dark:` / 双主题？
8. 中文文案是否只改 `STRINGS.*`？有无页面硬编码中文或 IP/域名面量？
9. 项目门禁是否全绿：`cd frontend && npm run typecheck && npm run check && npm test`（另按需 `npm run test:audit`）？
