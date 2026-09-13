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
 *
 * 样式：原 `index.css` 已迁移为 Tailwind 工具类（数字 = rpx，
 * `--spacing` 基准为 `calc(1 * var(--rpx))`）；原语义类名保留作标记。
 */

/** 筛选 chip 样式（选中高亮）。 */
function chipClass(active: boolean): string {
  return active
    ? 'GrammarList-chip GrammarList-chip--on px-sm py-xs mr-xs mb-xs bg-primary rounded-pill'
    : 'GrammarList-chip px-sm py-xs mr-xs mb-xs bg-surface-alt rounded-pill'
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
    <div className="GrammarList flex flex-col flex-1 w-full p-md">
      <span className="GrammarList-title text-lg font-bold mb-md">
        {STRINGS.grammarList.title}
      </span>

      <div className="GrammarList-filter flex flex-row items-center w-full mb-sm">
        <span className="GrammarList-filterLabel w-120 text-sm text-text-muted">
          {STRINGS.grammarList.filterWeek}
        </span>
        <div className="GrammarList-chips flex flex-row items-center flex-wrap flex-1">
          <div
            className={chipClass(week === null)}
            onClick={() => {
              setWeek(null)
            }}
          >
            <span className="GrammarList-chipLabel text-xs text-text">
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
              <span className="GrammarList-chipLabel text-xs text-text">
                {`${option}${STRINGS.grammarList.weekLabel}`}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="GrammarList-filter flex flex-row items-center w-full mb-sm">
        <span className="GrammarList-filterLabel w-120 text-sm text-text-muted">
          {STRINGS.grammarList.filterLevel}
        </span>
        <div className="GrammarList-chips flex flex-row items-center flex-wrap flex-1">
          <div
            className={chipClass(level === null)}
            onClick={() => {
              setLevel(null)
            }}
          >
            <span className="GrammarList-chipLabel text-xs text-text">
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
              <span className="GrammarList-chipLabel text-xs text-text">
                {option}
              </span>
            </div>
          ))}
        </div>
      </div>

      <span className="GrammarList-count text-xs text-text-muted mb-sm">
        {`${filtered.length}${STRINGS.grammarList.countUnit}`}
      </span>

      {filtered.length === 0 ? (
        <span className="GrammarList-empty text-md text-text-muted mt-lg">
          {STRINGS.grammarList.empty}
        </span>
      ) : (
        <div className="GrammarList-list flex flex-col flex-1 w-full">
          {filtered.map((grammar) => (
            <div
              key={grammar.id}
              item-key={grammar.id}
              className="GrammarList-item cursor-pointer select-none flex flex-col w-full p-md mb-sm bg-surface rounded-md"
              onClick={() => nav.goGrammarDetail(grammar.id)}
            >
              <span className="GrammarList-pattern text-md font-bold text-text">
                {grammar.pattern}
              </span>
              <span className="GrammarList-meta text-xs text-text-muted mt-xs">
                {`${grammar.week}${STRINGS.grammarList.weekLabel} · ${grammar.level} · ${grammar.scene}`}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
