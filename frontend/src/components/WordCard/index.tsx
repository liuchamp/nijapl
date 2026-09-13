import type { NodeState } from '../../constants/srs.js'
import { STRINGS } from '../../constants/strings.js'
import type { Word } from '../../types/domain.js'
import type { StudySettings } from '../../types/progress.js'
import { NodeStateBadge } from '../NodeStateBadge/index.js'
import { TtsButton } from '../TtsButton/index.js'

/**
 * P2 学习卡片（架构 §2.10）。
 *
 * - **整卡热区发音**：点击卡片任意空白处即朗读 `word.kana`（根节点 `bindtap`）；
 *   卡内交互元素一律 `catchtap` 阻止冒泡，避免「点按钮也发音 / 发音两次」；
 * - **翻面**：默认只显示假名 / 汉字 / 词性，点「看释义」显隐含释义（自评前置动作）；
 * - **发音反馈 / 降级**：视觉反馈与错误提示由 `TtsButton` + `ttsController` 负责；
 * - 本组件无自身状态、无数据写入（`applyPresented` 由 Study 页在卡片可见时统一调用）。
 */

interface WordCardProps {
  word: Word
  settings: StudySettings
  /** 是否已展开释义。 */
  revealed: boolean
  /** 切换释义显隐。 */
  onToggleReveal: () => void
  /** 整卡热区发音（父层调用 `ttsController.speak(word.kana)`）。 */
  onSpeak: () => void
  /** 节点态徽章（可选；Study 页传入当前词态）。 */
  nodeState?: NodeState
}

/** P2 学习卡片。 */
export function WordCard(props: WordCardProps) {
  const word = props.word
  return (
    <div
      className="WordCard cursor-pointer select-none flex flex-col items-center w-full p-lg bg-surface rounded-lg border-[calc(1*var(--rpx))] border-border"
      onClick={props.onSpeak}
    >
      <div className="WordCard-top cursor-pointer select-none flex flex-row items-center justify-between w-full">
        {props.nodeState !== undefined ? (
          <NodeStateBadge state={props.nodeState} />
        ) : (
          <div className="WordCard-topSpacer cursor-pointer select-none w-1 h-1" />
        )}
        <span className="WordCard-pos cursor-pointer select-none text-xs text-text-muted">
          {word.pos}
        </span>
      </div>

      <span className="WordCard-kana cursor-pointer select-none mt-lg text-xl font-bold text-text">
        {word.kana}
      </span>
      <span className="WordCard-kanji cursor-pointer select-none mt-sm text-lg text-text-muted">
        {word.kanji === '' ? word.kana : word.kanji}
      </span>

      <div className="WordCard-actions cursor-pointer select-none flex flex-row items-center justify-center gap-md mt-lg">
        <div
          className="WordCard-reveal cursor-pointer select-none px-md py-sm bg-surface-alt rounded-pill"
          onClick={(event) => {
            // 原 Lynx `catchtap`：阻断冒泡，避免「点看释义」连带触发整卡发音热区。
            event.stopPropagation()
            props.onToggleReveal()
          }}
        >
          <span className="WordCard-revealLabel cursor-pointer select-none text-sm text-text">
            {props.revealed ? STRINGS.common.flipBack : STRINGS.common.flip}
          </span>
        </div>
        <TtsButton
          text={word.kana}
          settings={props.settings}
          label={STRINGS.tts.replay}
        />
      </div>

      {props.revealed ? (
        <div className="WordCard-meaningBox cursor-pointer select-none flex flex-col mt-lg p-md bg-surface-alt rounded-md w-full">
          <span className="WordCard-meaning cursor-pointer select-none text-lg text-text text-center">
            {word.meaning}
          </span>
        </div>
      ) : (
        <span className="WordCard-hint cursor-pointer select-none mt-lg text-xs text-text-muted">
          {STRINGS.tts.tapToSpeak}
        </span>
      )}
    </div>
  )
}
