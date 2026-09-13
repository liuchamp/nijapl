# AGENTS.md — frontend/src/components

共享 UI 原语：14 目录（C1/C2 + K 域 + Icon + Sidebar），每组件一目录 `index.tsx`
（Tailwind 工具类，原 `index.css` 已删）。

## WHERE TO LOOK

- TabBar | WordCard | TtsButton | DetailSheet（C2）| ProgressRing | GraphCanvas |
  StatTimeline | NodeStateBadge | GrammarHighlightText | KanaTable | KanaCanvas |
  KanaConfusableCard | Icon | Sidebar。
- TtsButton：经 `useSyncExternalStore` 读 `ttsController` 快照；`notice` + `fallbackText` 驱动降级 UI；主按钮内嵌 `Icon(audio)`。
- Icon（`components/Icon`）：品牌 18 图标唯一入口（`?raw` 内联 SVG，`currentColor`；
  `check`→Sage `#8FB89B`、`flame`→Sakura `#F5A8BC` 语义色默认）。

## CONVENTIONS

- `flex-direction:column` 补齐：ProgressRing、`.TtsButton-notice`、`.WordCard-meaningBox`
  （Lynx→Web blockify 修复）。
- GrammarHighlightText 嵌套 span 保持 inline flow，禁止 blockify（否则句子垂直堆叠）。
- WordCard `.WordCard-reveal` + TtsButton 外壳显式 `event.stopPropagation()`（否则双重 TTS）。
- GraphCanvas：背景 SVG 经 `dangerouslySetInnerHTML` 渲染纯 `toSvg()`（仅数字 + 常量色，
  biome-ignore 合理）；前景绝对定位 div 承载点击（word→P3 / grammar→P5 / module→P2）；
  节点 onClick 必须 stopPropagation（否则冒泡到背景取消选中）；显示半径 scale 2.4 由
  bg + fg 共享（仅 2px 蓝圈可见，故意保留）。
- Icon `size`：数字或 `"Nrpx"` 字符串走 `calc(N*var(--rpx))`（浏览器不认 `rpx`，透传整条失效）；
  其它字符串（如 `"18px"`）原样透传；`dangerouslySetInnerHTML` 带 biome-ignore
  （静态资产非用户输入，与 GraphCanvas 同理）。
- Sidebar：**仅 PC 宽屏**（`≥768px`）左侧导航；尺寸一律 px 任意值（`w-[220px]`、`text-[15px]`），
  **不用 rpx 令牌**（否则被 `--rpx: 100vw/750` 在宽窗放大）；导航走 `useNavigation()`，
  P2/K1 复用首页「断点续学」选择器，避免死链。

## ANTI-PATTERNS

- 给 GrammarHighlightText 子 span 加 `display:block`。
- 在 GraphCanvas 背景 SVG 上绑点击（点击只在前景 div）。
- 页面直引 `assets/icons/*.svg`；新增图标不沿 24 网格 / 2px round / currentColor。
