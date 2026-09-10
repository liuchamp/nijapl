import './index.css'
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
    <view className="WordCard" bindtap={props.onSpeak}>
      <view className="WordCard-top">
        {props.nodeState !== undefined ? (
          <NodeStateBadge state={props.nodeState} />
        ) : (
          <view className="WordCard-topSpacer" />
        )}
        <text className="WordCard-pos">{word.pos}</text>
      </view>

      <text className="WordCard-kana">{word.kana}</text>
      <text className="WordCard-kanji">
        {word.kanji === '' ? word.kana : word.kanji}
      </text>

      <view className="WordCard-actions">
        <view className="WordCard-reveal" catchtap={props.onToggleReveal}>
          <text className="WordCard-revealLabel">
            {props.revealed ? STRINGS.common.flipBack : STRINGS.common.flip}
          </text>
        </view>
        <TtsButton
          text={word.kana}
          settings={props.settings}
          label={STRINGS.tts.replay}
        />
      </view>

      {props.revealed ? (
        <view className="WordCard-meaningBox">
          <text className="WordCard-meaning">{word.meaning}</text>
        </view>
      ) : (
        <text className="WordCard-hint">{STRINGS.tts.tapToSpeak}</text>
      )}
    </view>
  )
}
