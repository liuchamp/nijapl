import { STRINGS } from '../../constants/strings.js'
import type { Word } from '../../types/domain.js'
import type { StudySettings } from '../../types/progress.js'
import { Icon } from '../Icon/index.js'

/**
 * C2 半屏详解浮层（架构 §2.10 / 判据 4）。
 *
 * - `position: fixed` 底部半屏；`mode` 决定文案：
 *   - `auto`：J1「第一次遇到这个词（自评不认识）」自动展开；
 *   - `prompt`：J2「会话累计答错」引导展开；
 * - 两个动作：**查看详解**（跳 P3）与 **忽略，继续**（关闭浮层）；
 * - 浮层外遮罩点击 = 忽略（`catchtap` 阻止穿透到下层卡片热区）。
 */

/** 浮层模式。 */
export type DetailSheetMode = 'auto' | 'prompt'

interface DetailSheetProps {
  visible: boolean
  mode: DetailSheetMode | null
  /** 目标词条（不可用时浮层不渲染内容）。 */
  word: Word | undefined
  settings: StudySettings
  /** 确认：进入 P3 详解。 */
  onConfirm: (wordId: string) => void
  /** 忽略：关闭浮层继续学习。 */
  onDismiss: () => void
}

/** C2 半屏详解浮层。 */
export function DetailSheet(props: DetailSheetProps) {
  if (!props.visible || props.word === undefined) {
    return null
  }
  const word = props.word
  const isAuto = props.mode !== 'prompt'
  const title = isAuto
    ? STRINGS.detailSheet.autoTitle
    : STRINGS.detailSheet.promptTitle
  const body = isAuto
    ? STRINGS.detailSheet.autoBody
    : STRINGS.detailSheet.promptBody

  return (
    <div className="Sheet fixed inset-0 flex flex-col justify-end">
      <div
        className="Sheet-mask cursor-pointer select-none fixed inset-0 bg-[rgba(0,0,0,0.55)]"
        onClick={props.onDismiss}
      />
      <div className="Sheet-panel relative flex flex-col w-full p-lg bg-surface rounded-t-lg border-t-[calc(1*var(--rpx))] border-border">
        <span className="Sheet-title text-lg font-bold">{title}</span>
        <span className="Sheet-body mt-xs text-sm text-text-muted">{body}</span>

        <div className="Sheet-word flex flex-col items-center mt-lg p-md bg-surface-alt rounded-md">
          <span className="Sheet-wordKana text-xl font-bold">{word.kana}</span>
          <span className="Sheet-wordKanji mt-xs text-md text-text-muted">
            {word.kanji === '' ? word.kana : word.kanji}
          </span>
          <span className="Sheet-wordMeaning mt-sm text-md">
            {word.meaning}
          </span>
        </div>

        <div className="Sheet-actions flex flex-row items-center justify-between gap-md mt-lg">
          <div
            className="Sheet-dismiss cursor-pointer select-none flex-1 flex items-center justify-center py-md bg-surface-alt rounded-pill gap-8"
            onClick={props.onDismiss}
          >
            <Icon name="close" size="28rpx" />
            <span className="Sheet-dismissLabel cursor-pointer select-none text-md text-text-muted">
              {STRINGS.detailSheet.dismiss}
            </span>
          </div>
          <div
            className="Sheet-confirm cursor-pointer select-none flex-1 flex items-center justify-center py-md bg-primary rounded-pill gap-8"
            onClick={() => {
              props.onConfirm(word.id)
            }}
            style={{ color: '#8FB89B' }}
          >
            <Icon name="check" size="28rpx" />
            <span className="Sheet-confirmLabel cursor-pointer select-none text-md font-bold text-bg">
              {STRINGS.detailSheet.confirm}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
