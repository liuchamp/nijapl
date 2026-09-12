# AGENTS.md — frontend/tests

四层测试的契约层：`tests/audit`（P0 行为审计，防漂移证据）+ `tests/qa`（独立契约 /
对抗 / 真实集成）。单元测试就近放在各 `__tests__/`，不在这里。

## WHERE TO LOOK

- `audit/p0-*.audit.test.ts`（4 组）：PROBE（只观测、恒过、打印真实值）+
  VERDICT（行为断言）；覆盖今日配额、跨天滚动、持久化 merge 净化。只读 `src/`，不改。
- `qa/engine/*.qa.test.ts`：对照设计文档的独立契约校验（srs / progress /
  jumpRules / graph-view / layout / conjugation）。
- `qa/data/data-integrity.qa.test.ts`：种子构建产物完整性。
- `qa/tts/*.qa.test.ts`：真实 HTTP 集成 + 离线对抗（C1–C4 精确序列断言）。

## CONVENTIONS

- 配置分离：`vitest.config.ts`（`npm test`，含单元 + QA，**排除 audit**）；
  `vitest.audit.config.ts`（`npm run test:audit`，只跑 `tests/audit/**`）。
- 确定性：Quiz 出题零 shuffle，同输入必同输出；SRS / jumpRules 为纯函数断言。
- 服务不可达时**自动跳过并标注「未执行」**（`describe.skipIf` / Go 侧 `t.Skipf`），
  禁止用 mock 冒充真实 TTS。

## ANTI-PATTERNS

- 把 audit 用例并入默认 `npm test`（配置已排除，不要"顺手合回"）。
- 为过审编造数据绕过校验；删除失败用例冒充全绿。
- 在 K 域回归（`store/__tests__/kana-isolation.test.ts`）之外另建假名隔离断言——
  口径以该文件为准。
