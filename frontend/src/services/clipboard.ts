import { System } from '../../bindings/nijapl/internal/services/index.js'
import { hasWailsRuntime } from '../engine/wails.js'

/**
 * 剪贴板工具：优先 Web `navigator.clipboard`，Wails 宿主内再兜底到 Go（`pbcopy` 等）。
 *
 * 说明：本项目未定义 Clipboard 端口（端口范围仅 TTS / Storage），
 * 故此处用**受保护的运行时探测**实现复制；都不可用时返回 `false`，
 * 由调用方给出**明确降级提示**（不是静默失败，P9「数据导出」依赖此语义）。
 *
 * 迁移说明：原实现的 `lynx.setClipboardData` 分支已删除（Lynx 专有 API）。
 */
export function copyText(text: string): boolean {
  const g = globalThis as unknown as {
    navigator?: { clipboard?: { writeText?: (text: string) => Promise<void> } }
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

  const viaWails = (): boolean => {
    if (!hasWailsRuntime()) {
      return false
    }
    // Go 侧同步写入（darwin: pbcopy）；调用是异步绑定，这里提交即视为成功。
    void Promise.resolve(System.SetClipboard(text)).catch(() => undefined)
    return true
  }

  try {
    if (viaNavigator()) {
      return true
    }
  } catch {
    // Web 剪贴板被拒绝（非安全上下文 / 权限）→ 继续尝试宿主能力。
  }
  try {
    if (viaWails()) {
      return true
    }
  } catch {
    // 宿主能力不可用 → 明确降级。
  }
  return false
}
