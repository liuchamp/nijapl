import './index.css'
import { useMemo, useState } from '@lynx-js/react'
import { STRINGS } from '../../constants/strings.js'
import { repository } from '../../data/index.js'
import { useNavigation } from '../../router/navigation.js'
import {
  filterGrammars,
  grammarLevelOptions,
  grammarWeekOptions,
} from '../../services/grammarView.js'

/**
 * P4 语法列表（架构 §2.9 / T05 判据 1）。
 *
 * - **`<list>` + `<list-item>`**：`item-key` 与 `key` 一致（F7 复用安全）；
 * - **周次 / 层级筛选即时**：筛选为纯函数（`services/grammarView`），
 *   选中即 `setState` → `useMemo` 重算，无网络 / 无异步；
 * - 点条目进入 P5 语法详解。
 */

/** 筛选 chip 样式（选中高亮）。 */
function chipClass(active: boolean): string {
  return active ? 'GrammarList-chip GrammarList-chip--on' : 'GrammarList-chip'
}

/** P4 语法列表页。 */
export function GrammarListPage() {
  const nav = useNavigation()
  const grammars = useMemo(() => repository.getAllGrammars(), [])
  const [week, setWeek] = useState<number | null>(null)
  const [level, setLevel] = useState<string | null>(null)

  const weeks = useMemo(() => grammarWeekOptions(grammars), [grammars])
  const levels = useMemo(() => grammarLevelOptions(grammars), [grammars])
  const filtered = useMemo(
    () => filterGrammars(grammars, { week, level }),
    [grammars, week, level],
  )

  return (
    <view className="GrammarList">
      <text className="GrammarList-title">{STRINGS.grammarList.title}</text>

      <view className="GrammarList-filter">
        <text className="GrammarList-filterLabel">
          {STRINGS.grammarList.filterWeek}
        </text>
        <view className="GrammarList-chips">
          <view
            className={chipClass(week === null)}
            catchtap={() => {
              setWeek(null)
            }}
          >
            <text className="GrammarList-chipLabel">
              {STRINGS.grammarList.all}
            </text>
          </view>
          {weeks.map((option) => (
            <view
              key={option}
              className={chipClass(week === option)}
              catchtap={() => {
                setWeek(option)
              }}
            >
              <text className="GrammarList-chipLabel">
                {`${option}${STRINGS.grammarList.weekLabel}`}
              </text>
            </view>
          ))}
        </view>
      </view>

      <view className="GrammarList-filter">
        <text className="GrammarList-filterLabel">
          {STRINGS.grammarList.filterLevel}
        </text>
        <view className="GrammarList-chips">
          <view
            className={chipClass(level === null)}
            catchtap={() => {
              setLevel(null)
            }}
          >
            <text className="GrammarList-chipLabel">
              {STRINGS.grammarList.all}
            </text>
          </view>
          {levels.map((option) => (
            <view
              key={option}
              className={chipClass(level === option)}
              catchtap={() => {
                setLevel(option)
              }}
            >
              <text className="GrammarList-chipLabel">{option}</text>
            </view>
          ))}
        </view>
      </view>

      <text className="GrammarList-count">
        {`${filtered.length}${STRINGS.grammarList.countUnit}`}
      </text>

      {filtered.length === 0 ? (
        <text className="GrammarList-empty">{STRINGS.grammarList.empty}</text>
      ) : (
        <list className="GrammarList-list">
          {filtered.map((grammar) => (
            <list-item
              key={grammar.id}
              item-key={grammar.id}
              className="GrammarList-item"
              catchtap={() => nav.goGrammarDetail(grammar.id)}
            >
              <text className="GrammarList-pattern">{grammar.pattern}</text>
              <text className="GrammarList-meta">
                {`${grammar.week}${STRINGS.grammarList.weekLabel} · ${grammar.level} · ${grammar.scene}`}
              </text>
            </list-item>
          ))}
        </list>
      )}
    </view>
  )
}
