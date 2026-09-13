# AGENTS.md — frontend/src/types

领域类型契约：W 域（词条 / 进度 / 图）+ K 域（假名）+ 端口（TTS / 存储）。

## WHERE TO LOOK

- `domain.ts`：`Word` / `Module` / `Stage` / `Grammar` / `Sentence` / `BuildData`
 （W 域契约冻结：K 域数据不并入 `BuildData`）。
- `progress.ts`：`Progress`（五态 / `intervalLevel` / `nextReview` / `history`）/ `Session` / `StudySettings` / `SelfEval` / `JumpDecision`。
- `kana.ts`：`Kana` / `KanaGroup`（`prerequisiteGroupIds` 显式解锁）/ `KanaScript`。
- `graph.ts`：图谱节点 / 边类型；`ports.ts`：`TtsPort` / `StoragePort`（永不 throw 契约的字面量）；
  `tts.ts`：TTS 参数类型。
- `index.ts`：桶文件（重导出 domain / graph / ports / progress）。

## CONVENTIONS

- 加字段走可选扩展，禁改现有字段语义（审计 / 持久化净化依赖它们）。
- 词性用 `constants/pos.ts` 显式枚举；K 域 key 构造只用 `kanaProgressKey`（见 `constants/kana.ts`）。
- 端口结果用判别联合（`TtsResult` 等），不用抛异常表达失败。

## ANTI-PATTERNS

- 往 `BuildData` 里塞假名；从罗马音前缀反推 `Kana.row`。
- 在类型文件里放运行时逻辑。
