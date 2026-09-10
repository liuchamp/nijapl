/**
 * 剪贴板工具（架构 §8.5）：优先 Lynx 宿主能力，其次 Web `navigator.clipboard`。
 *
 * 说明：本项目未定义 Clipboard 端口（T03 端口范围仅 TTS / Storage），
 * 故此处用**受保护的运行时探测**实现复制；两者都不可用时返回 `false`，
 * 由调用方给出**明确降级提示**（不是静默失败）。
 *
 * 该逻辑原内联于 `ttsController`，抽出以便 P9「数据导出」复用（无重复实现）。
 */
export function copyText(text: string): boolean {
  const g = globalThis as unknown as {
    lynx?: { setClipboardData?: (options: { text: string }) => void }
    navigator?: { clipboard?: { writeText?: (text: string) => Promise<void> } }
  }

  const viaLynx = (): boolean => {
    const setter = g.lynx?.setClipboardData
    if (typeof setter !== 'function') {
      return false
    }
    setter.call(g.lynx, { text })
    return true
  }
  const viaNavigator = (): boolean => {
    const clipboard = g.navigator?.clipboard
    const write = clipboard?.writeText
    if (typeof write !== 'function') {
      return false
    }
    void write.call(clipboard, text)
    return true
  }

  try {
    if (viaLynx()) {
      return true
    }
  } catch {
    // Lynx 剪贴板不可用 → 继续尝试 Web 剪贴板。
  }
  try {
    if (viaNavigator()) {
      return true
    }
  } catch {
    // Web 剪贴板被拒绝（非安全上下文 / 权限）→ 明确降级。
  }
  return false
}
