import './index.css'
import { STRINGS } from '../../constants/strings.js'
import type { Word } from '../../types/domain.js'
import type { StudySettings } from '../../types/progress.js'

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
    <div className="Sheet">
      <div className="Sheet-mask" onClick={props.onDismiss} />
      <div className="Sheet-panel">
        <span className="Sheet-title">{title}</span>
        <span className="Sheet-body">{body}</span>

        <div className="Sheet-word">
          <span className="Sheet-wordKana">{word.kana}</span>
          <span className="Sheet-wordKanji">
            {word.kanji === '' ? word.kana : word.kanji}
          </span>
          <span className="Sheet-wordMeaning">{word.meaning}</span>
        </div>

        <div className="Sheet-actions">
          <div className="Sheet-dismiss" onClick={props.onDismiss}>
            <span className="Sheet-dismissLabel">
              {STRINGS.detailSheet.dismiss}
            </span>
          </div>
          <div
            className="Sheet-confirm"
            onClick={() => {
              props.onConfirm(word.id)
            }}
          >
            <span className="Sheet-confirmLabel">
              {STRINGS.detailSheet.confirm}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
