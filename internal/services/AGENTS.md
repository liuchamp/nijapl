# AGENTS.md — internal/services

Go 服务：`kvstore.go`（KVStore）/ `tts.go`（TTS）/ `system.go`（System）。错误永不过绑定边界。

## WHERE TO LOOK

- `kvstore.go`：`Get/Set/Remove/Flush`；内存 map + 250ms 防抖 + 临时文件原子 rename；加载失败置空。
- `tts.go`：`Synthesize` / `Prefetch` / `Cancel` + `ServeHTTP`（`/wails/tts`，仅 GET，不区分子路径，CORS 全开，包一层 `SynthesizeResult`）；
  超时 8s（用户）/ 15s（预取），300ms 后重试一次；LRU 64 + 字节上限；在途去重；400→`bad-request`（不重试）/
  503→`unavailable`（去 `voice` 重试一次）/ 504·408→超时；`repairPlusSign` 回补 Android 转发丢的 `+`。
- `system.go`：`Platform()` 返回 `runtime.GOOS`；`SetClipboard()`（darwin 经 `pbcopy`，其余返回 false）。
- `tts_test.go` / `tts_servehttp_test.go`：服务不可达时跳过并标注「未执行」，禁止 mock 冒充真实 TTS。
- 配置：`internal/config/config.go`（优先级 `NIJAPL_TTS_BASE_URL` > ldflags 烘入 > 默认值）；注册在 `main.go`。

## CONVENTIONS

- 方法返回 nil error / bool / 判别结果；前端端口永不 throw。
- 拼 query 用 `url.Values.Encode()`，禁止 `fmt.Sprintf`。

## ANTI-PATTERNS

- 把 Go error 传过绑定；测试里 mock TTS。

## COMMANDS

```bash
go build ./... && go vet ./internal/... .
go test ./internal/... .
```
