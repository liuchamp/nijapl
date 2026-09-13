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
//   - Mobile  ← 移动端原生能力（实时 TTS / 常亮 / 触觉 / 安全区；桌面 no-op）
func main() {
	app := application.New(application.Options{
		Name:        "Nijapl",
		Description: "JLPT N3 词汇学习应用",
		Services: []application.Service{
			application.NewService(services.NewKVStore()),
			application.NewServiceWithOptions(services.NewTTS(), application.ServiceOptions{Route: "/wails/tts"}),
			application.NewService(services.NewSystem()),
			application.NewService(services.NewMobile()),
		},
		Assets: application.AssetOptions{
			Handler: application.AssetFileServerFS(assets),
		},
		Mac: application.MacOptions{
			ApplicationShouldTerminateAfterLastWindowClosed: true,
		},
	})

	// 窗口默认 1180×800、最小 900×640：
	// - 移动端（iOS/Android）由系统决定尺寸，这两组值不生效，无副作用；
	// - 桌面端由此放开「420×860 单一竖屏」假设，宽窗（≥768px）才有物理空间
	//   触发 PC 布局（左侧栏 + 居中限宽内容区，见 `router/useIsWide.ts`）；
	// - 窄窗（<768px）仍走原移动端单列 + 底部 TabBar，视觉与原 Lynx 一致。
	app.Window.NewWithOptions(application.WebviewWindowOptions{
		Title:     "Nijapl",
		Width:     1180,
		Height:    800,
		MinWidth:  900,
		MinHeight: 640,
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
