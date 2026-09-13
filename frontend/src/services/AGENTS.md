# AGENTS.md — frontend/src/services

编排层：页面事件 ↔ store 写操作的薄翻译层；计时器只放这里；仅 `clipboard.ts` 可直连绑定。

## WHERE TO LOOK

- `studySession.ts`：`beginStudy` / `applySelfEvaluation` / `evaluateSceneEffect`（卡片首次可见必须调 `presentCurrentCard`，五态「学习中」唯一入口）。
- `jumpService.ts`：`JumpDecision` → `StudyEffect` 翻译。
- `ttsController.ts`：C1 单例；`speak()` 同步先置视觉反馈（≤100ms）；`describeTtsFailure` 失败文案；`copyKana` 假名兜底。
- `quiz.ts`：确定性出题，禁止 shuffle；`grammarView.ts`：`filterGrammars`（P4 列表过滤）。
- `graphNav.ts`：`graphNodeTarget` / `parseGraphQuery`（P6 节点→页面映射）。
- `highlight.ts`：`buildSegments` / `buildSentenceHighlight`（P3 偏移渲染）。
- `kanaWriteSession.ts`：`revealKanaPeek` / `cancelKanaPeek` / `enterKanaGroup`（`KANA_PEEK_MS=2000`，任一时刻至多一个待触发计时器）。
- `ttsPrefetch.ts`：预取队列，并发 2（`TTS_PREFETCH_MAX_CONCURRENCY`）；失败静默（全仓库唯一允许的静默）。
- `clipboard.ts`：`navigator.clipboard` → `System.SetClipboard`，返回 bool；P9 导出兜底。
- `__tests__/`：5 个文件。

## CONVENTIONS

- 写操作收敛到 `store/actions.ts`；service 永不直接改状态。
- `setTimeout` 只放这里，`actions.ts` 只做同步纯状态变更；K1 卸载必须调 `cancelKanaPeek()`。
- 仅依赖 zustand **vanilla** store（`store/index.ts`），不引入 React 绑定（可在 Node 做冒烟测试）。
- 预取：Study 页预取下一词 `kana`；VocabDetail 预取前 2 个例句 `sentence.ja`。

## ANTI-PATTERNS

- 在 `store/actions.ts` 里放 `setTimeout`。
- `clipboard.ts` 之外 import `frontend/bindings/`。
- `quiz.ts` 里 shuffle；端口层 throw（见根 AGENTS.md）。
