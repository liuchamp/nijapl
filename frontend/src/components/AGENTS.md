# AGENTS.md — frontend/src/components

OVERVIEW: 13 component dirs (C1/C2 + K domain + Icon), each index.tsx+index.css. Shared UI primitives for Wails v3 JLPT N3 app.

COMPONENTS (frontend/src/components/):
TabBar | WordCard | TtsButton | DetailSheet (C2) | ProgressRing | GraphCanvas | StatTimeline | NodeStateBadge | GrammarHighlightText | KanaTable | KanaCanvas | KanaConfusableCard | Icon

CONVENTIONS:
- flex-direction:column 补齐: ProgressRing, .TtsButton-notice, .WordCard-meaningBox (Lynx→Web blockify fix).
- GrammarHighlightText nested spans: 保持 inline flow，禁止 blockify（否则句子垂直堆叠）。
- WordCard .WordCard-reveal + TtsButton shell: 显式 event.stopPropagation()（否则双重 TTS 触发）。
- GraphCanvas: 背景 SVG via dangerouslySetInnerHTML (pure toSvg(), 仅数字+常量色，biome-ignore 合理)；前景绝对定位 div 承载点击（word→P3 / grammar→P5 / module→P2）；node onClick 必须 stopPropagation（否则冒泡到背景取消选中）；显示半径 scale 2.4 由 bg+fg 共享（仅 2px 蓝圈可见，故意保留）。
- TtsButton: 通过 useSyncExternalStore 读取 ttsController 快照；notice + fallbackText 驱动降级 UI；主按钮内嵌 Icon(audio)。
- Icon (components/Icon): 品牌 18 图标唯一入口（`?raw` 内联 SVG，`currentColor`；`check`→Sage `#8FB89B`、`flame`→Sakura `#F5A8BC` 语义色默认）；`size` 数字走 `calc(N*var(--rpx))`；`dangerouslySetInnerHTML` 带 biome-ignore（静态资产非用户输入，与 GraphCanvas 同理）。

ANTI-PATTERNS:
- 不要给 GrammarHighlightText 子 span 加 display:block。
- 不要在 GraphCanvas 背景 SVG 上绑定点击（点击在前景 div）。
- 图标一律走 Icon 组件（禁止页面直引 `assets/icons/*.svg`）；新增图标沿用 24 网格/2px round/currentColor。
