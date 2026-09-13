import { KanaConfusableCard } from '../../components/KanaConfusableCard/index.js'
import { STRINGS } from '../../constants/strings.js'
import { repository } from '../../data/index.js'
import { useNavigation } from '../../router/navigation.js'
import { enterKanaGroup } from '../../services/kanaWriteSession.js'
import { useAppStore, useSettings } from '../../store/hooks.js'
import {
  selectKanaConfusablePairs,
  selectKanaDueQueue,
  selectKanaWeak,
  selectTodayReviewQueue,
  selectWeakWords,
} from '../../store/selectors.js'
import type { Word } from '../../types/domain.js'
import type { Kana } from '../../types/kana.js'

/**
 * P7 复习（架构 §7 T04 判据 8 + 设计 §5.5 阶段 E）。
 *
 * - **今日到期队列**：`selectTodayReviewQueue`（依据 `isDue`：已出现且到 `nextReview`）；
 * - **错词本**：`selectWeakWords`（`需强化` / `模糊` 且出现过的词，按 `wrongCount` 降序）；
 * - **假名分区**（K3，并入本页而不新开 Tab）：
 *   - 今日到期 · 假名 → 点入 K1 **复习模式**（隐藏字源，直接考）；
 *   - 错音本 → `需强化` / `模糊` 的假名，按 `wrongCount` 降序；
 *   - 易混对比 → 两侧累计错 ≥ 2 的形近/同音对，并排对照 + 双侧可发音。
 *
 * **两个队列互不污染**：词条队列用 `repository.getWordById` 反查，`kana:` 前缀的 key 天然
 * 返回 `undefined` 被跳过；假名队列反过来只收 `kana:` 前缀。不需要任何 if 判断（设计 §6.1）。
 */

/** 词条行。 */
function WordRow(props: { word: Word; onTap: () => void }) {
  return (
    <div
      className="Review-row cursor-pointer select-none flex flex-row items-center justify-between w-full p-sm mt-xs bg-surface rounded-md"
      onClick={props.onTap}
    >
      <span className="Review-rowKana cursor-pointer select-none text-md">
        {props.word.kana}
      </span>
      <span className="Review-rowMeaning cursor-pointer select-none text-sm text-text-muted">
        {props.word.meaning}
      </span>
    </div>
  )
}

/** 假名行（平/片 + 罗马音）。 */
function KanaRow(props: { kana: Kana; onTap: () => void }) {
  return (
    <div
      className="Review-row cursor-pointer select-none flex flex-row items-center justify-between w-full p-sm mt-xs bg-surface rounded-md"
      onClick={props.onTap}
    >
      <span className="Review-rowKana cursor-pointer select-none text-md">
        {`${props.kana.hiragana} / ${props.kana.katakana}`}
      </span>
      <span className="Review-rowMeaning cursor-pointer select-none text-sm text-text-muted">
        {props.kana.romaji}
      </span>
    </div>
  )
}

/** P7 复习页。 */
export function ReviewPage() {
  const state = useAppStore((snapshot) => snapshot)
  const nav = useNavigation()
  const settings = useSettings()

  const now = Date.now()
  const due = selectTodayReviewQueue(state, now)
  const weak = selectWeakWords(state)
  const firstDue = due[0]

  const kanaDue = selectKanaDueQueue(state, now)
  const kanaWeak = selectKanaWeak(state)
  const kanaPairs = selectKanaConfusablePairs(state)
  const firstKanaDue = kanaDue[0]

  /** 进入某个假名的 K1 复习模式（定位到该音在关内的序号）。 */
  function reviewKana(kana: Kana): void {
    const index = repository
      .getKanaByGroup(kana.groupId)
      .findIndex((member) => member.id === kana.id)
    enterKanaGroup(kana.groupId, index < 0 ? 0 : index)
    nav.goKanaStudy(kana.groupId, { mode: 'review' })
  }

  return (
    <div className="Review flex flex-col flex-1 w-full p-md">
      <span className="Review-title text-lg font-bold">
        {STRINGS.review.title}
      </span>

      <div className="Review-summary flex flex-col items-center w-full mt-md p-md bg-surface rounded-lg">
        <span className="Review-summaryValue text-xl font-bold text-primary">
          {due.length}
        </span>
        <span className="Review-summaryLabel mt-xs text-sm text-text-muted">
          {STRINGS.review.dueCount}
        </span>
      </div>

      <div
        className={
          firstDue === undefined
            ? 'Review-start Review-start--disabled opacity-50 flex flex-row items-center justify-center w-full mt-md py-md bg-primary rounded-pill'
            : 'Review-start flex flex-row items-center justify-center w-full mt-md py-md bg-primary rounded-pill'
        }
        onClick={() => {
          if (firstDue !== undefined) {
            nav.goStudy(firstDue.moduleId, { mode: 'review' })
          }
        }}
      >
        <span className="Review-startLabel text-md font-bold text-bg">
          {STRINGS.review.start}
        </span>
      </div>

      <div className="Review-section flex flex-col w-full mt-lg">
        <span className="Review-sectionTitle text-md font-bold">
          {STRINGS.review.dueTitle}
        </span>
        {due.length === 0 ? (
          <span className="Review-empty mt-sm text-sm text-text-muted">
            {STRINGS.review.dueEmpty}
          </span>
        ) : (
          <div className="Review-list flex flex-col w-full mt-sm">
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

      <div className="Review-section flex flex-col w-full mt-lg">
        <span className="Review-sectionTitle text-md font-bold">
          {STRINGS.review.weakTitle}
        </span>
        {weak.length === 0 ? (
          <span className="Review-empty mt-sm text-sm text-text-muted">
            {STRINGS.review.weakEmpty}
          </span>
        ) : (
          <div className="Review-list flex flex-col w-full mt-sm">
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

      {/* —— K3 假名分区 —— */}
      <div className="Review-section flex flex-col w-full mt-lg">
        <div className="Review-sectionHead flex flex-row items-center justify-between w-full">
          <span className="Review-sectionTitle text-md font-bold">
            {STRINGS.kana.reviewDueTitle}
          </span>
          <div
            className={
              firstKanaDue === undefined
                ? 'Review-kanaStart Review-kanaStart--disabled opacity-50 cursor-pointer select-none px-sm py-xs bg-primary-soft rounded-pill'
                : 'Review-kanaStart cursor-pointer select-none px-sm py-xs bg-primary-soft rounded-pill'
            }
            onClick={() => {
              if (firstKanaDue !== undefined) {
                reviewKana(firstKanaDue)
              }
            }}
          >
            <span className="Review-kanaStartLabel text-xs text-primary">
              {STRINGS.kana.reviewStart}
            </span>
          </div>
        </div>
        {kanaDue.length === 0 ? (
          <span className="Review-empty mt-sm text-sm text-text-muted">
            {STRINGS.kana.reviewDueEmpty}
          </span>
        ) : (
          <div className="Review-list flex flex-col w-full mt-sm">
            {kanaDue.map((item) => (
              <KanaRow
                key={item.id}
                kana={item}
                onTap={() => reviewKana(item)}
              />
            ))}
          </div>
        )}
      </div>

      <div className="Review-section flex flex-col w-full mt-lg">
        <span className="Review-sectionTitle text-md font-bold">
          {STRINGS.kana.reviewWeakTitle}
        </span>
        {kanaWeak.length === 0 ? (
          <span className="Review-empty mt-sm text-sm text-text-muted">
            {STRINGS.kana.reviewWeakEmpty}
          </span>
        ) : (
          <div className="Review-list flex flex-col w-full mt-sm">
            {kanaWeak.map((item) => (
              <KanaRow
                key={item.id}
                kana={item}
                onTap={() => reviewKana(item)}
              />
            ))}
          </div>
        )}
      </div>

      <div className="Review-section flex flex-col w-full mt-lg">
        <span className="Review-sectionTitle text-md font-bold">
          {STRINGS.kana.reviewConfusableTitle}
        </span>
        {kanaPairs.length === 0 ? (
          <span className="Review-empty mt-sm text-sm text-text-muted">
            {STRINGS.kana.reviewConfusableEmpty}
          </span>
        ) : (
          <div className="Review-list flex flex-col w-full mt-sm">
            {kanaPairs.map((pair) => (
              <KanaConfusableCard
                // 一对只出现一次（`confusable` 是对称表，selector 已按字典序去重），
                // 故 `a.id|b.id` 在本页内唯一且稳定。
                key={`${pair.a.id}|${pair.b.id}`}
                a={pair.a}
                b={pair.b}
                wrongCount={pair.wrongCount}
                settings={settings}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
