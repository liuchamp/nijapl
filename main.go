package main

import (
	"embed"
	"log"

	"nijapl/internal/services"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// frontend/dist 下的前端产物会被 embed 进二进制，由 AssetServer 提供。
//
//go:embed all:frontend/dist
var assets embed.FS

// main 是应用入口：注册 Go 服务、创建窗口、启动事件循环。
//
// 服务清单（对应原 Lynx 工程被替换的 3 个 native module + 1 个 HTTP 通道）：
//   - KVStore ← NativeModules.LynxStorage（键值持久化）
//   - TTS     ← 前端 fetch 直连 ttsedservice（规避桌面 WebView 的跨域限制）
//   - System  ← SystemInfo / lynx.setClipboardData（平台信息与剪贴板兜底）
func main() {
	app := application.New(application.Options{
		Name:        "nijapl",
		Description: "JLPT N3 词汇学习应用",
		Services: []application.Service{
			application.NewService(services.NewKVStore()),
			application.NewServiceWithOptions(services.NewTTS(), application.ServiceOptions{Route: "/wails/tts"}),
			application.NewService(services.NewSystem()),
		},
		Assets: application.AssetOptions{
			Handler: application.AssetFileServerFS(assets),
		},
		Mac: application.MacOptions{
			ApplicationShouldTerminateAfterLastWindowClosed: true,
		},
	})

	// 窗口默认 420×860：宽高比贴近移动端竖屏，配合响应式 rpx 基准
	// （--rpx: calc(100vw / 750)）保持与原 Lynx 页面一致的视觉比例。
	app.Window.NewWithOptions(application.WebviewWindowOptions{
		Title:  "nijapl",
		Width:  420,
		Height: 860,
		Mac: application.MacWindow{
			InvisibleTitleBarHeight: 50,
			Backdrop:                application.MacBackdropTranslucent,
			TitleBar:                application.MacTitleBarHiddenInset,
		},
		BackgroundColour: application.NewRGB(11, 16, 32),
		URL:              "/",
	})

	if err := app.Run(); err != nil {
		log.Fatal(err)
	}
}
