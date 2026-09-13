package services

import "github.com/wailsapp/wails/v3/pkg/application"

// Mobile 暴露移动端（iOS / Android）原生能力：实时 TTS、屏幕常亮、触觉反馈、安全区。
//
// 说明：`application.Mobile` 是包级单例（类型 `application.MobileManager`），
// 桌面构建下由 `mobile_stub.go`（`//go:build !ios && !android`）提供 no-op 实现，
// 因此本服务**无需 build tag** 即可在各平台编译，桌面调用为安全空操作。
// 前端经 `engine/platform` 判定形态后决定是否走本服务（见 `engine/tts/tts.mobile.ts`）。
type Mobile struct{}

// NewMobile 构造 Mobile 服务。
func NewMobile() *Mobile { return &Mobile{} }

// Available 当前是否为移动端（iOS / Android）。
func (m *Mobile) Available() bool { return application.System.IsMobile() }

// Speak 原生实时合成。`application.Mobile.Speak` 无返回值（fire-and-forget），
// 故本方法**恒返回 true**，语义仅为「已**派发**」，**不表示**合成 / 播放成功。
//
// 两处刻意保留的不对称（前端 `engine/tts/tts.mobile.ts` 按此契约乐观处理）：
//   - 不校验空文本：传空串同样返回 true（HTTP 路径会先返回 `empty-text`）；
//   - 不感知失败：Wails 侧无从得知 OS TTS 引擎的实际结果，前端只能乐观判定。
func (m *Mobile) Speak(text string) bool {
	application.Mobile.Speak(text)
	return true
}

// StopSpeak 停止原生合成。
func (m *Mobile) StopSpeak() {
	application.Mobile.StopSpeak()
}

// SetKeepAwake 学习 / 自测页保持屏幕常亮。
func (m *Mobile) SetKeepAwake(enabled bool) {
	application.Mobile.SetKeepAwake(enabled)
}

// Haptic 触觉反馈（kind: "impact" | "notification" | "selection"）。
func (m *Mobile) Haptic(kind string) {
	application.Mobile.Haptic(kind)
}

// SafeArea 安全区 insets（JSON 字符串）；桌面返回空串。
func (m *Mobile) SafeArea() string {
	return application.Mobile.SafeAreaJSON()
}
