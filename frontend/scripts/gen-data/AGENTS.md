# AGENTS.md — frontend/scripts/gen-data

seed→JSON 管线：先构建 W 域（stages/modules/words/grammar/sentences），再构建 K 域（`kana.json`）→ `frontend/data/build/*.json`；校验失败 `exit 1`。入口 `npm run gen:data`（tsx）。

## WHERE TO LOOK

- `index.ts`：管线总装；`build-*.ts` / `build-kana.ts`（纯函数，确定性）；`validate.ts` / `validate-kana.ts`。
- `schema.ts` / `kana-schema.ts`：两套独立 schema（K 域不并入 `BuildData`，W 域契约冻结）。
- `source/seed/`（W 域：`words` / `modules` / `stages` / `sentences` / `grammar`）+
  `source/kana/`（K 域：`index` / `groups` / `kana`）；产物 `data/build/`。
- 消费侧：`frontend/src/data/repository.ts`（唯一数据入口）；页面 / 引擎禁直读 JSON。
- `__tests__/`：管线单测，随默认 `npm test` 跑（`vitest.config.ts` 已收录）。

## CONVENTIONS

- 假名 id 即 romaji；平 / 片按码点步长拆分（2 码点为拗音）；`strokePaths=[]` 为 v1 预留位。
- `confusable` 对称闭包；关内 `kanaIds` 取声明顺序；`build-kana` 两遍构建（先清行索引首音、拗音再经 `baseFromFirst` 回填 `baseKanaId`）；行错误抛 `'[build-kana]'`。

## ANTI-PATTERNS

- 手改 `data/build/`；为过校验编造缺失内容（缺例句即失败，不许 fake 兜底）。
- 把 `kana.json` 并入 `BuildData`。
