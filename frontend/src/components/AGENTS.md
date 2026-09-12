# AGENTS.md — frontend/src/components

OVERVIEW: 12 component dirs (C1/C2 + K domain), each index.tsx+index.css. Shared UI primitives for Wails v3 JLPT N3 app.

COMPONENTS (frontend/src/components/):
TabBar | WordCard | TtsButton | DetailSheet (C2) | ProgressRing | GraphCanvas | StatTimeline | NodeStateBadge | GrammarHighlightText | KanaTable | KanaCanvas | KanaConfusableCard

CONVENTIONS:
- flex-direction:column 补齐: ProgressRing, .TtsButton-notice, .WordCard-meaningBox (Lynx→Web blockify fix).
- GrammarHighlightText nested spans: 保持 inline flow，禁止 blockify（否则句子垂直堆叠）。
- WordCard .WordCard-reveal + TtsButton shell: 显式 event.stopPropagation()（否则双重 TTS 触发）。
- GraphCanvas: 背景 SVG via dangerouslySetInnerHTML (pure toSvg(), 仅数字+常量色，biome-ignore 合理)；前景绝对定位 div 承载点击（word→P3 / grammar→P5 / module→P2）；node onClick 必须 stopPropagation（否则冒泡到背景取消选中）；显示半径 scale 2.4 由 bg+fg 共享（仅 2px 蓝圈可见，故意保留）。
- TtsButton: 通过 useSyncExternalStore 读取 ttsController 快照；notice + fallbackText 驱动降级 UI。
- 18 个 SVG (frontend/src/assets/icons) 未被引用（0 import），必须保持未接入（保真红线）。

ANTI-PATTERNS:
- 不要给 GrammarHighlightText 子 span 加 display:block。
- 不要在 GraphCanvas 背景 SVG 上绑定点击（点击在前景 div）。
- 不要“顺手接入”未引用的 icons。
