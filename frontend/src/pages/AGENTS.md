# AGENTS.md — frontend/src/pages

页面层：13 目录（P0–P9 + K0–K2），每页一目录 `index.tsx`（Tailwind 工具类，原 `index.css` 已删）；
只渲染 + dispatch `store/actions.ts`，不直调 Wails 绑定 / 浏览器 API。

## WHERE TO LOOK

- Home（P0）/ StageMap（P1）/ Study（P2）/ VocabDetail（P3）/ GrammarList（P4）/
  GrammarDetail（P5）/ Graph（P6）/ Review（P7）/ Quiz（P8，有路由**无入口**，有意保留）/
  Me（P9）/ Kana（K0 音表）/ KanaStudy（K1 默写）/ KanaQuiz（K2 测验）。
- Study：卡片切换时经 `ttsPrefetch` 预取下一词 `kana`。
- VocabDetail：挂载调 `evaluateSceneEffect` + 预取前 2 例句 `sentence.ja`。
- KanaStudy：先调 `kanaWriteSession.enterKanaGroup(groupId,index)` 写 store 断点再跳；
  关内索引禁塞 query 参数；卸载必须调 `cancelKanaPeek()`（否则悬空计时器在离页后写状态）。

## CONVENTIONS

- 禁用 `<Link>` / `<NavLink>`；一律 `useNavigation()`，路径取 `constants/routes.ts`
 （`studyPath` / `vocabPath` / `grammarDetailPath` / `graphPath` / `kanaStudyPath` / `kanaQuizPath` / `isTabPath`）。
- Tab 仅 5 个（`/` / `/stages` / `/grammar` / `/review` / `/me`）；K 路由不是 Tab。
- 样式 Tailwind 工具类（数字 = rpx，`--spacing` 基准 `calc(1 * var(--rpx))`）；
  原语义类名保留作标记；body 14px 基线见 `styles/index.css`。

## ANTI-PATTERNS

- 给 Quiz 加入口；给 K 路由加 Tab。
- 直引端口实现文件（`*.wails.ts` / `*.web.ts` / `tts-client.ts` / `player*.ts`）。
- 在 selector 里构造新对象 / 数组（无限重渲染）。
- 假名索引走 URL 参数；K1 卸载漏调 `cancelKanaPeek`。
