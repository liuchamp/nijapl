import './index.css'
import { useMemo } from 'react'
import { KANA_VOWELS, kanaProgressKey } from '../../constants/kana.js'
import { STRINGS } from '../../constants/strings.js'
import type { Kana, KanaScript } from '../../types/kana.js'
import type { Progress } from '../../types/progress.js'
import { STATE_STYLE } from '../NodeStateBadge/index.js'

/**
 * 五十音音表（K0 主体，设计 §5.1）。
 *
 * 结构：**行 = 行（あ行 / か行…），列 = 段（あ / い / う / え / お / ん）**，
 * 即 27 行 × 6 段的稀疏网格（`や行` 只有 3 音、`わ行` 2 音、`ん` 1 音）。
 * 格子按 `vowel` 落到固定列上，靠 `grid-column` 定位而非靠补齐空位——
 * 补齐会引入「空占位格」，点上去会命中一个不存在的音。
 *
 * 子 Tab（平假名 / 片假名 / 罗马音）是**多选**：三个布尔值控制格子里显示哪几层，
 * 与参考产品一致（`subTabHandler` 的 include/push/splice 语义）。
 *
 * 学习模式开关**不过滤内容**，只加高亮描边并把格子切成可点（设计 §5.1）。
 */

interface KanaTableProps {
  /** 该音类的全部音（顺序即数据行序，决定行与列的稳定次序）。 */
  kana: readonly Kana[]
  /** 已勾选的书写体系（可多选）。 */
  scripts: readonly KanaScript[]
  /** 是否显示罗马音层。 */
  showRomaji: boolean
  /** 学习模式：开启后音格可点、音表加高亮描边。 */
  studyMode: boolean
  /** 未解锁的关 id（其音格展示但**不可点**，避免绕过解锁口径直接从音表跳到 G12）。 */
  lockedGroupIds: readonly string[]
  /** 进度表（用于每格五态圆点与行完成度）。 */
  progress: Record<string, Progress>
  /** 点击某个音格（仅学习模式且所属关已解锁时触发）。 */
  onPickKana(kanaId: string): void
}

/** 行分组（保持数据行序，不用 `Map` 迭代序）。 */
interface RowGroup {
  row: string
  items: Kana[]
}

function groupRows(kana: readonly Kana[]): RowGroup[] {
  const order: string[] = []
  const byRow = new Map<string, Kana[]>()
  for (const item of kana) {
    const list = byRow.get(item.row)
    if (list === undefined) {
      byRow.set(item.row, [item])
      order.push(item.row)
      continue
    }
    list.push(item)
  }
  return order.map((row) => ({ row, items: byRow.get(row) ?? [] }))
}

/**
 * 行首标签：`${行首字形}行`（「あ行」）。
 *
 * 两个例外，都是**标准称法**问题而非实现妥协：
 * - 拗音没有「〇行」的传统叫法（kya 行 = 「きゃ」），只显示字形；
 * - `ん` 是独立音节（不成行），单音行只显示字形。
 */
function rowLabel(
  items: readonly Kana[],
  scripts: readonly KanaScript[],
): string {
  const first = items[0]
  if (first === undefined) {
    return ''
  }
  // 勾了平假名（或两者都没勾）时以平假名为行首，只勾片假名时用片假名。
  const useHiragana =
    scripts.includes('hiragana') || !scripts.includes('katakana')
  const char = useHiragana ? first.hiragana : first.katakana
  const isYoon = first.voiceType === '拗音'
  return !isYoon && items.length > 1 ? `${char}${STRINGS.kana.rowSuffix}` : char
}

/** 五十音音表。 */
export function KanaTable(props: KanaTableProps) {
  const rows = useMemo(() => groupRows(props.kana), [props.kana])
  const showHiragana = props.scripts.includes('hiragana')
  const showKatakana = props.scripts.includes('katakana')

  if (props.kana.length === 0) {
    return (
      <div className="KanaTable">
        <span className="KanaTable-empty">{STRINGS.kana.empty}</span>
      </div>
    )
  }

  return (
    <div
      className={props.studyMode ? 'KanaTable KanaTable--study' : 'KanaTable'}
    >
      {/* 表头：首列空出（行首列），其余为段名。 */}
      <div className="KanaTable-head">
        <span className="KanaTable-headCell">{STRINGS.kana.columnHeader}</span>
        {KANA_VOWELS.map((vowel) => (
          <span key={vowel} className="KanaTable-headCell">
            {vowel}
          </span>
        ))}
      </div>

      {rows.map((group) => {
        const mastered = group.items.filter(
          (item) =>
            props.progress[kanaProgressKey(item.id)]?.state === '已掌握',
        ).length
        return (
          <div key={group.row} className="KanaTable-row">
            <div className="KanaTable-rowHead">
              <span className="KanaTable-rowLabel">
                {rowLabel(group.items, props.scripts)}
              </span>
              <span className="KanaTable-rowMeta">
                {`${mastered}/${group.items.length}`}
              </span>
            </div>

            {group.items.map((item) => {
              const state =
                props.progress[kanaProgressKey(item.id)]?.state ?? '未学'
              const column = KANA_VOWELS.indexOf(item.vowel) + 2
              // 列号 = 段序 + 2（首列被行首占用）。`vowel` 的取值由数据 schema 的
              // `KanaVowelSchema` 枚举约束，故 `indexOf` 不会返回 -1；一旦返回 -1，
              // 列号会变成 1 顶掉行首单元格，在 UI 上表现为「行名消失」这种极难反查的错位。
              const cellClass = !props.studyMode
                ? 'KanaTable-cell'
                : props.lockedGroupIds.includes(item.groupId)
                  ? 'KanaTable-cell KanaTable-cell--locked'
                  : 'KanaTable-cell KanaTable-cell--clickable'
              return (
                <div
                  key={item.id}
                  className={cellClass}
                  style={{ gridColumn: column }}
                  onClick={() => {
                    if (
                      props.studyMode &&
                      !props.lockedGroupIds.includes(item.groupId)
                    ) {
                      props.onPickKana(item.id)
                    }
                  }}
                >
                  <div className="KanaTable-cellChars">
                    {showHiragana ? (
                      <span className="KanaTable-hiragana">
                        {item.hiragana}
                      </span>
                    ) : null}
                    {showKatakana ? (
                      <span className="KanaTable-katakana">
                        {item.katakana}
                      </span>
                    ) : null}
                  </div>
                  {props.showRomaji ? (
                    <span className="KanaTable-romaji">{item.romaji}</span>
                  ) : null}
                  {/* 五态圆点：配色复用 NodeStateBadge 的唯一配色表。 */}
                  <span
                    className="KanaTable-dot"
                    style={{ backgroundColor: STATE_STYLE[state].color }}
                  />
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}
