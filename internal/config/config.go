// Package config 集中应用运行期配置。
//
// 原 Lynx 工程把 TTS 服务地址在构建期通过 `source.define` 注入（`__TTS_BASE_URL__`）；
// Wails 下改为运行期读取，既避免前端知道任何域名，也便于本地切换服务地址。
package config

import (
	"os"
	"path/filepath"
)

// DefaultTTSBaseURL 是自托管 TTS 服务的默认地址（与原 `TTS_BASE_URL` 默认值一致）。
const DefaultTTSBaseURL = "http://127.0.0.1:8000"

// EnvTTSBaseURL 可覆盖 TTS 服务地址的环境变量名。
const EnvTTSBaseURL = "NIJAPL_TTS_BASE_URL"

// buildTTSBaseURL 是构建期注入的 TTS 服务地址（`go build -ldflags
// "-X nijapl/internal/config.buildTTSBaseURL=..."`，见 build/android/Taskfile.yml
// 与 build/ios/Taskfile.yml）。真机跑在独立进程里读不到运行期环境变量，只能靠它
// 把 host 烘进包；注入为空时由 `TTSBaseURL()` 回退到 `DefaultTTSBaseURL`。
var buildTTSBaseURL string

// DataDir 返回应用数据目录（不存在时创建）。
//
// 落盘位置：`os.UserConfigDir()/nijapl`，即
// macOS ~/Library/Application Support/nijapl、Windows %AppData%\nijapl、Linux ~/.config/nijapl。
func DataDir() string {
	base, err := os.UserConfigDir()
	if err != nil || base == "" {
		base = os.TempDir()
	}
	dir := filepath.Join(base, "nijapl")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return os.TempDir()
	}
	return dir
}

// TTSBaseURL 返回 TTS 服务地址（去除尾部斜杠）。
// 优先级：运行期环境变量 > 构建期注入 > 默认值。
func TTSBaseURL() string {
	if v := os.Getenv(EnvTTSBaseURL); v != "" {
		return v
	}
	if buildTTSBaseURL != "" {
		return buildTTSBaseURL
	}
	return DefaultTTSBaseURL
}
