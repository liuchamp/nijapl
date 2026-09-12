# AGENTS.md — frontend/src/constants

唯一真相源（single source of truth）：魔法数字 / 文案 / 路径 / TTS 参数只在此定义，
业务代码**只 import、不复述**。无路径别名（`tsconfig` 无 `paths`），相对导入一律带 `.js` 后缀。

## WHERE TO LOOK

- `routes.ts`：`ROUTES` / `TABS` / `TAB_PATHS` + 构造器（`studyPath` / `vocabPath` /
  `grammarDetailPath` / `graphPath` / `kanaStudyPath` / `kanaQuizPath`）与解析器
  （`readKanaQuizGroup` / `readKanaStudyMode`）。路由字符串不得散落各处。
- `strings.ts`：`STRINGS.*`——中文 UI 文案唯一来源，页面 / 组件禁止硬编码中文。
- `tts.ts`：`TTS_BASE_URL`（仅浏览器回退路径用；Wails 宿主地址由 Go 侧持有）+
  `TTS_LANG='ja-JP'` / `TTS_VOLUME='+0%'` / 超时 / 重试 / 缓存上限 / 预取并发（=2）。
  业务代码禁止出现 IP / 域名字面量。
- `kana.ts`：`kanaProgressKey`（`kana:` 前缀唯一构造器，RK1）+ `romajiAliases` 变体表。
- `theme.ts`：设计 token；JS 尺寸必须写 `'calc(N * var(--rpx))'`（不经 PostCSS，
  写 `'Nrpx'` 是无效值）。
- `pos.ts`：词性显式枚举（禁止单字匹配）；`srs.ts`：SRS 间隔序列；
  `jumpRules.ts`：J1–J6 阈值。

## ANTI-PATTERNS

- 在业务代码里手写 `'kana:' + id`、路径字符串、IP 地址、中文文案。
- 用罗马音前缀反推假名行（`shi/chi/tsu/fu/ji/wo` 不规则，会错）；横轴只用 `Kana.row`。
- 给 `theme.ts` 写 `'Nrpx'`；给 TTS 传非 `'ja-JP'` 的 `lang`。
