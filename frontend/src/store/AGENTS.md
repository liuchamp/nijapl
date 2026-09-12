# AGENTS.md — frontend/src/store

全局状态：zustand v4 **vanilla** `createStore` + `persist`。四片：`progress` / `session` /
`settings`（持久化）+ `runtime`（**不落盘**）。

## OVERVIEW

- `actions.ts`：**唯一写入口**（W 域 14 个 + K 域 7 个：`startKanaGroup` / `setKanaIndex` /
  `setKanaScript` / `toggleKanaMemory` / `setKanaPeekVisible` / `toggleKanaGate` /
  `resetKanaProgress`）。页面 / service 只 dispatch，不自行计算新状态。
  **action 只做同步纯状态变更**；`setTimeout` 等计时副作用收敛到 `services/`（如 `kanaWriteSession`）。
- `selectors.ts`：纯派生 `(state,…) => 值`；**必须返回稳定引用 / 原始值**。
- `hooks.ts`：React 绑定；`appActions` 为稳定引用，可放入依赖数组 / 事件回调。
- `persistence.ts`：`portableStorage` 适配 `StoragePort`；`partialize` 只存 progress/session/settings。
- `index.ts`：装配 + `persist` + hydration 看门狗（2.5s 兜底置 `hydrated=true`）。

## 分片职责

- `progress`：`Record<targetId, Progress>`（五态 / `intervalLevel` / `nextReview` / `history`；
  K 域 key 一律 `kana:<romaji>`，构造只用 `constants/kana.ts` 的 `kanaProgressKey`）。
- `session`：`stageId` / `moduleId` / `lastWordIndex` / 今日配额 / `streakDays`（+ K 域断点
  `kanaGroupId` / `lastKanaIndex`）。
- `settings`：发音参数 + `unlockRuleEnabled`（+ K 域门控 `kanaGateEnabled`）。
- `runtime`（**不落盘**）：`currentModuleId` / `currentIndex` / `sessionWrongCount` /
  `detailSheet` / `lastDecisions`（+ K 域 `currentKanaGroupId` / `kanaIndex` / `kanaScript` /
  `kanaMemoryMode` / `kanaPeekVisible`）。

## 红线

- 写操作只能在 `actions.ts`；纯计算放 `engine/`；派生查询放 `selectors.ts`。
- **净化必须加在 `merge`**：zustand 版本一致时 `migrate` 不执行，只补 `readProgress` 无效。
- 校验字段用 `Array.isArray`，禁止只判真值（`history: 'oops'` 时 `.length === 4` 会静默误判）。
- 禁止 `existing.history!.length` 等 `!` 断言绕过类型（运行时可能 `undefined`）。
- selector 内不要构造新对象 / 数组 / 正则，否则 `useStore` 每次重渲染。
- 「首次评估」判据用 `history.length === 0`，**不要**用 `seen`（`markPresented` 后即 `true`，会恒不计数）。

## 测试

- `store/__tests__/actions.test.ts`、`selectors.test.ts`；P0 回归在 `frontend/tests/audit/`。
