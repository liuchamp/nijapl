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
    <div className="Review-row" onClick={props.onTap}>
      <span className="Review-rowKana">{props.word.kana}</span>
      <span className="Review-rowMeaning">{props.word.meaning}</span>
    </div>
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
    <div className="Review">
      <span className="Review-title">{STRINGS.review.title}</span>

      <div className="Review-summary">
        <span className="Review-summaryValue">{due.length}</span>
        <span className="Review-summaryLabel">{STRINGS.review.dueCount}</span>
      </div>

      <div
        className={
          firstDue === undefined
            ? 'Review-start Review-start--disabled'
            : 'Review-start'
        }
        onClick={() => {
          if (firstDue !== undefined) {
            nav.goStudy(firstDue.moduleId, { mode: 'review' })
          }
        }}
      >
        <span className="Review-startLabel">{STRINGS.review.start}</span>
      </div>

      <div className="Review-section">
        <span className="Review-sectionTitle">{STRINGS.review.dueTitle}</span>
        {due.length === 0 ? (
          <span className="Review-empty">{STRINGS.review.dueEmpty}</span>
        ) : (
          <div className="Review-list">
            {due.map((word) => (
              <WordRow
                key={word.id}
                word={word}
                onTap={() => nav.goVocab(word.id)}
              />
            ))}
          </div>
        )}
      </div>

      <div className="Review-section">
        <span className="Review-sectionTitle">{STRINGS.review.weakTitle}</span>
        {weak.length === 0 ? (
          <span className="Review-empty">{STRINGS.review.weakEmpty}</span>
        ) : (
          <div className="Review-list">
            {weak.map((word) => (
              <WordRow
                key={word.id}
                word={word}
                onTap={() => nav.goVocab(word.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
