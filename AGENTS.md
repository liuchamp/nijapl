# AGENTS.md

本仓库是 **Wails v3**（Go + 系统 WebView）桌面应用，前端为 **React 18 + TypeScript + Vite**。

## 先读文档

- Wails v3：<https://v3.wails.io/llms.txt>

## 常用命令

| 目的 | 命令 |
|---|---|
| 启动桌面应用（热重载） | `wails3 dev` |
| 构建 | `wails3 build` |
| 前端单独起服务 | `cd frontend && npm run dev` |
| 类型检查 | `cd frontend && npm run typecheck` |
| Lint + 格式化 | `cd frontend && npm run check` |
| 单元测试 | `cd frontend && npm test` |
| P0 行为审计 | `cd frontend && npm run test:audit` |
| 重新生成类型绑定 | `wails3 generate bindings -ts` |
| Go 测试 | `go test ./internal/... .` |

## 工程纪律

- **提交前**：`npm run typecheck` + `npm run check` + `npm test` 必须全绿；
  Go 侧改动还需 `go build ./... && go vet ./internal/... .`
- **样式单位**：CSS 中直接写 `rpx`，由 `frontend/vite.config.ts` 的 PostCSS 插件在构建期
  改写为 `calc(N * var(--rpx))`。**JS 中的尺寸常量**（`constants/theme.ts`）必须写成
  `'calc(N * var(--rpx))'` —— 它不经过 PostCSS，写 `'Nrpx'` 在浏览器里是无效值。
- **平台能力隔离**：存储 / TTS 等平台能力只能通过 `frontend/src/engine/` 下的端口访问。
  页面、store、service **不得**直接调用 Wails 绑定或浏览器原生 API（六边形架构红线）。
- **事件阻断**：原 Lynx 的 `catchtap`（绑定 + 阻断冒泡）迁到 Web 的 `onClick` 后
  **不会**自动阻断，必须显式 `event.stopPropagation()`。典型：`WordCard` 内的
  `.WordCard-reveal` 与 `TtsButton`（否则一次点击触发两次发音）。
- **文本/容器语义**：原 Lynx `<view>` 默认 `display:flex; flex-direction:column`（子元素
  被块级化），Web `<div>` 是 block。若容器内含多个相邻 `<span>` / `<svg>`，或子 `<span>`
  依赖 `width` / `text-align`，**必须显式补** `display:flex; flex-direction:column`。
- **默认字号**：Lynx 的 UA 默认字号是 **14px**（浏览器 16px）。已在 `frontend/src/App.css`
  的 `body` 上对齐；新增未显式设字号的元素时留意这一点。
- **不要"顺手修好"**：本项目要求与原 Lynx 实现行为逐处一致，包括一些反直觉之处。
  红线清单见 `docs/migration/PLAN.md` §9。

## 迁移背景

本项目由 Lynx / ReactLynx 工程迁移而来。系统性差异、排查手段与已修复项详见
[`docs/migration/PORTING-NOTES.md`](docs/migration/PORTING-NOTES.md)；
排查脚本在 `docs/migration/tools/`。
