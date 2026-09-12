import './index.css'
import { useMemo, useState } from 'react'
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
 * - **`<div>` + `<div>`**：`item-key` 与 `key` 一致（F7 复用安全）；
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
    <div className="GrammarList">
      <span className="GrammarList-title">{STRINGS.grammarList.title}</span>

      <div className="GrammarList-filter">
        <span className="GrammarList-filterLabel">
          {STRINGS.grammarList.filterWeek}
        </span>
        <div className="GrammarList-chips">
          <div
            className={chipClass(week === null)}
            onClick={() => {
              setWeek(null)
            }}
          >
            <span className="GrammarList-chipLabel">
              {STRINGS.grammarList.all}
            </span>
          </div>
          {weeks.map((option) => (
            <div
              key={option}
              className={chipClass(week === option)}
              onClick={() => {
                setWeek(option)
              }}
            >
              <span className="GrammarList-chipLabel">
                {`${option}${STRINGS.grammarList.weekLabel}`}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="GrammarList-filter">
        <span className="GrammarList-filterLabel">
          {STRINGS.grammarList.filterLevel}
        </span>
        <div className="GrammarList-chips">
          <div
            className={chipClass(level === null)}
            onClick={() => {
              setLevel(null)
            }}
          >
            <span className="GrammarList-chipLabel">
              {STRINGS.grammarList.all}
            </span>
          </div>
          {levels.map((option) => (
            <div
              key={option}
              className={chipClass(level === option)}
              onClick={() => {
                setLevel(option)
              }}
            >
              <span className="GrammarList-chipLabel">{option}</span>
            </div>
          ))}
        </div>
      </div>

      <span className="GrammarList-count">
        {`${filtered.length}${STRINGS.grammarList.countUnit}`}
      </span>

      {filtered.length === 0 ? (
        <span className="GrammarList-empty">{STRINGS.grammarList.empty}</span>
      ) : (
        <div className="GrammarList-list">
          {filtered.map((grammar) => (
            <div
              key={grammar.id}
              item-key={grammar.id}
              className="GrammarList-item"
              onClick={() => nav.goGrammarDetail(grammar.id)}
            >
              <span className="GrammarList-pattern">{grammar.pattern}</span>
              <span className="GrammarList-meta">
                {`${grammar.week}${STRINGS.grammarList.weekLabel} · ${grammar.level} · ${grammar.scene}`}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
