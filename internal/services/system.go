package services

import (
	"os/exec"
	"runtime"
)

// System 提供平台信息与剪贴板兜底，替代原 Lynx 的 `SystemInfo` 与 `lynx.setClipboardData`。
//
// 说明：原 `services/platform.ts`（仅用于 `<viewpager>` 平台降级）已整体删除；
// Web 端剪贴板优先走 `navigator.clipboard`，本服务只在该 API 不可用时兜底。
type System struct{}

// NewSystem 构造 System 服务。
func NewSystem() *System { return &System{} }

// Platform 返回平台标识（goos：darwin / windows / linux）。
func (s *System) Platform() string {
	return runtime.GOOS
}

// SetClipboard 写入系统剪贴板；成功返回 true。
//
// macOS 走 `pbcopy`；其余平台返回 false，由前端回退到 `navigator.clipboard`
// 或"文本见下方"的降级展示（P9 导出数据的既有行为）。
func (s *System) SetClipboard(text string) bool {
	if runtime.GOOS != "darwin" {
		return false
	}
	cmd := exec.Command("pbcopy")
	stdin, err := cmd.StdinPipe()
	if err != nil {
		return false
	}
	if err := cmd.Start(); err != nil {
		return false
	}
	if _, err := stdin.Write([]byte(text)); err != nil {
		_ = stdin.Close()
		return false
	}
	_ = stdin.Close()
	return cmd.Wait() == nil
}
