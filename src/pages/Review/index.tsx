import './index.css'
import { STRINGS } from '../../constants/strings.js'
import { useNavigation } from '../../router/navigation.js'
import { useAppStore } from '../../store/hooks.js'
import {
  selectTodayReviewQueue,
  selectWeakWords,
} from '../../store/selectors.js'
import type { Word } from '../../types/domain.js'

/**
 * P7 复习（架构 §7 T04 判据 8）。
 *
 * - **今日到期队列**：`selectTodayReviewQueue`（依据 `isDue`：已出现且到 `nextReview`）；
 * - **错词本**：`selectWeakWords`（`需强化` / `模糊` 且出现过的词，按 `wrongCount` 降序）；
 * - 「开始复习」进入首个到期词所在模块的复习模式（P2 `?mode=review`）。
 */

/** 词条行。 */
function WordRow(props: { word: Word; onTap: () => void }) {
  return (
    <view className="Review-row" catchtap={props.onTap}>
      <text className="Review-rowKana">{props.word.kana}</text>
      <text className="Review-rowMeaning">{props.word.meaning}</text>
    </view>
  )
}

/** P7 复习页。 */
export function ReviewPage() {
  const state = useAppStore((snapshot) => snapshot)
  const nav = useNavigation()

  const now = Date.now()
  const due = selectTodayReviewQueue(state, now)
  const weak = selectWeakWords(state)
  const firstDue = due[0]

  return (
    <view className="Review">
      <text className="Review-title">{STRINGS.review.title}</text>

      <view className="Review-summary">
        <text className="Review-summaryValue">{due.length}</text>
        <text className="Review-summaryLabel">{STRINGS.review.dueCount}</text>
      </view>

      <view
        className={
          firstDue === undefined
            ? 'Review-start Review-start--disabled'
            : 'Review-start'
        }
        catchtap={() => {
          if (firstDue !== undefined) {
            nav.goStudy(firstDue.moduleId, { mode: 'review' })
          }
        }}
      >
        <text className="Review-startLabel">{STRINGS.review.start}</text>
      </view>

      <view className="Review-section">
        <text className="Review-sectionTitle">{STRINGS.review.dueTitle}</text>
        {due.length === 0 ? (
          <text className="Review-empty">{STRINGS.review.dueEmpty}</text>
        ) : (
          <view className="Review-list">
            {due.map((word) => (
              <WordRow
                key={word.id}
                word={word}
                onTap={() => nav.goVocab(word.id)}
              />
            ))}
          </view>
        )}
      </view>

      <view className="Review-section">
        <text className="Review-sectionTitle">{STRINGS.review.weakTitle}</text>
        {weak.length === 0 ? (
          <text className="Review-empty">{STRINGS.review.weakEmpty}</text>
        ) : (
          <view className="Review-list">
            {weak.map((word) => (
              <WordRow
                key={word.id}
                word={word}
                onTap={() => nav.goVocab(word.id)}
              />
            ))}
          </view>
        )}
      </view>
    </view>
  )
}
