# nijapl

JLPT N3 日语词汇学习应用（桌面端）。基于 **Wails v3**（Go + 系统 WebView）+ **React 18** + TypeScript。

> 本项目由原 **Lynx / ReactLynx** 工程迁移而来，UI/UX 与原实现逐处对齐。
> 迁移规划、规格与保真决策见 [`docs/migration/`](docs/migration/)。

## 功能

- **词汇学习**：内置 JLPT N3 词表与语法点，卡片式学习，自评驱动 SRS 排程
- **发音（TTS）**：HTTP 合成 → 系统语音 → 明确降级提示，三级链路**零静默失败**
- **知识图谱**：阶段 / 模块 / 词条 / 语法四层关系可视化，支持缩放与拖拽
- **学习统计**：今日目标进度环、薄弱词条预警、连续打卡
- **纯本地**：无账号、无云同步

## 环境要求

- Go 1.24+
- Node.js `^20.19.0 || >=22.12.0`
- Wails v3 CLI：`go install github.com/wailsapp/wails/v3/cmd/wails3@latest`
- （可选）本地 TTS 服务，默认 `http://127.0.0.1:8000`

## 开发

```bash
wails3 dev            # 启动桌面应用（前后端热重载）
```

仅调前端时也可单独起 Vite（`cd frontend && npm run dev`，端口 9245）。
此时 Wails 绑定不可用：存储回退到 `localStorage`，TTS 走前端 `fetch`（会受 CORS 限制，见下文）。

## 构建

```bash
wails3 build          # 产出 bin/nijapl
```

## 测试与检查

```bash
cd frontend
npm run typecheck     # tsc -b
npm run check         # biome check --write（lint + 格式化）
npm test              # vitest run（单元 + QA）
npm run test:audit    # P0 行为审计（4 组 35 例，行为未漂移的硬证据）
```

```bash
go test ./internal/... .    # Go 侧测试（含真实 TTS 集成用例，服务不可达时自动跳过）
```

## TTS 服务

桌面 WebView（WKWebView / WebView2）同样执行同源策略，前端**无法**直连
`http://127.0.0.1:8000`（已实测被 CORS 拦截：无 `Access-Control-Allow-Origin`）。
因此合成请求统一**下沉到 Go 侧**（`internal/services/tts.go`），由 Go 负责
超时 / 重试 / LRU 缓存 / 在途去重 / 取消。

服务地址可用环境变量覆盖：

```bash
NIJAPL_TTS_BASE_URL=http://127.0.0.1:9000 wails3 dev
```

与服务端契约：

- `POST {base}/v1/tts/synthesize`，JSON body：`text` / `lang` / `rate` / `volume` / `pitch` / `format` / `voice`
- 2xx → `{ audio(base64), content_type?, voice?, cached? }`
- 非 2xx → `{ reason }`；400 → `bad-request`（不重试）、503 → `unavailable`（去掉 `voice` 重试一次）

## 目录结构

```
main.go                     应用入口（Wails 装配 + 窗口选项）
internal/config/            地址与数据目录
internal/services/          Go 服务：KVStore / TTS / System
frontend/src/engine/        平台能力端口（storage / tts，六边形架构）
frontend/src/pages/         P0–P9 页面
frontend/src/components/    共享组件
frontend/bindings/          wails3 生成的类型安全绑定（不入库）
docs/migration/             迁移规划、逐文件规格与保真记录
```

## 数据落盘

```
~/Library/Application Support/nijapl/store.json     # macOS（os.UserConfigDir()/nijapl）
```

## 已知限制

- 仅在 macOS 上验证；Windows / Linux 未做冒烟
- **P8 自测（Quiz）页面已实现但无入口** —— 与原实现一致，未"顺手修好"
- 学习进度为纯本地单机，无多设备同步
