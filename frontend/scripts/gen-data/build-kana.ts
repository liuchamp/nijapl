import {
  KANA_CONFUSABLE_EDGES,
  KANA_EXAMPLES,
  KANA_GROUP_SPECS,
  KANA_ROMAJI_ALIASES,
  KANA_ROW_SPECS,
  type KanaRowSpec,
} from '../../data/source/kana/index.js'
import type { Kana, KanaGroup, KanaWord } from '../../src/types/kana.js'

/**
 * K 域数据构建：把 `data/source/kana/` 的紧凑行规格展开为 104 音的完整实体。
 *
 * 展开规则（全部为**确定性纯计算**，无随机、无时间依赖）：
 * - `id` = 罗马音（唯一）；
 * - 平/片假名按**码点步长**切分（`stride = 码点数 / 音数`），
 *   自动兼容拗音的 2 码点形态（`きゃ`），避免用下标切出半个假名；
 * - `baseKanaId`：浊音 / 半浊音取**对应清音行同下标**；拗音取**本行首音**（きゃ → き）；
 * - `origin` 只给清音（浊音 / 半浊音 / 拗音是构成关系，给独立字源是错误的教学信息）；
 * - `strokePaths` 恒为空数组：v1 未取得可靠笔顺源，按设计 §13 Q2 降级为「只描红」，
 *   字段保留以便后续补数据而零代码改动；
 * - `confusable` 由边表做**对称闭包**；
 * - 关卡的 `kanaIds` 按**行声明序**派生，不手写（避免与行数据漂移）。
 */

/** 取字符串的码点数组（兼容拗音的 2 码点形态）。 */
function codePoints(text: string): string[] {
  return [...text]
}

/** 按步长切分平行字符串的第 `index` 段。 */
function sliceAt(text: string, index: number, stride: number): string {
  const points = codePoints(text)
  return points.slice(index * stride, (index + 1) * stride).join('')
}

/** 建立易混关系的对称闭包。 */
function buildConfusableMap(
  edges: ReadonlyArray<[string, string]>,
): Map<string, string[]> {
  const map = new Map<string, string[]>()
  const add = (from: string, to: string): void => {
    const list = map.get(from)
    if (list === undefined) {
      map.set(from, [to])
      return
    }
    if (!list.includes(to)) {
      list.push(to)
    }
  }
  for (const [a, b] of edges) {
    if (a === b) {
      continue
    }
    add(a, b)
    add(b, a)
  }
  return map
}

/** 展开单行为若干音。 */
function expandRow(
  row: KanaRowSpec,
  rowById: Map<string, KanaRowSpec>,
  confusableMap: Map<string, string[]>,
  leadingKanaId: Map<string, string>,
): Kana[] {
  const total = row.romaji.length
  if (row.vowels.length !== total) {
    throw new Error(
      `[build-kana] 行 ${row.id}: vowels(${row.vowels.length}) 与 romaji(${total}) 长度不一致`,
    )
  }
  const stride = codePoints(row.hiragana).length / total
  const hasOrigin = row.originHiragana !== ''
  const clearRow =
    row.clearRowId === undefined ? undefined : rowById.get(row.clearRowId)
  if (row.clearRowId !== undefined && clearRow === undefined) {
    throw new Error(
      `[build-kana] 行 ${row.id}: clearRowId "${row.clearRowId}" 不存在`,
    )
  }

  return row.romaji.map<Kana>((romaji, index) => {
    const hiragana = sliceAt(row.hiragana, index, stride)
    const katakana = sliceAt(row.katakana, index, stride)

    let baseKanaId: string | undefined
    if (row.baseFromFirst === true) {
      // 拗音：基准音 = 本行**首个大書き假名**对应的音（きゃ 行 → き，じゃ 行 → じ）。
      // 用「假名 → id」索引反查，而不是硬编码行映射：数据一改，基准音自动跟随，
      // 且不可能出现「基准音指向自己」这类自引用（曾由校验器捕获过一版）。
      const leading = sliceAt(row.hiragana, 0, 1)
      baseKanaId = leadingKanaId.get(leading)
      if (baseKanaId === undefined) {
        throw new Error(
          `[build-kana] 行 ${row.id}: 找不到大書き假名 "${leading}" 对应的基准音`,
        )
      }
    } else if (clearRow !== undefined) {
      baseKanaId = clearRow.romaji[index]
    }

    const examples = (KANA_EXAMPLES[romaji] ?? []).map<KanaWord>((spec) =>
      spec.wordId === undefined
        ? {
            text: spec.text,
            accent: spec.accent,
            kanji: spec.kanji,
            meaning: spec.meaning,
          }
        : {
            text: spec.text,
            accent: spec.accent,
            kanji: spec.kanji,
            meaning: spec.meaning,
            wordId: spec.wordId,
          },
    )
    const origin = hasOrigin
      ? {
          hiragana: {
            char: sliceAt(row.originHiragana, index, 1),
            note: `「${sliceAt(row.originHiragana, index, 1)}」的草书演变`,
          },
          katakana: {
            char: sliceAt(row.originKatakana, index, 1),
            note: `取「${sliceAt(row.originKatakana, index, 1)}」的偏旁`,
          },
        }
      : undefined

    return {
      id: romaji,
      groupId: row.groupId,
      voiceType: row.voiceType,
      row: row.id,
      vowel: row.vowels[index],
      romaji,
      romajiAliases: KANA_ROMAJI_ALIASES[romaji] ?? [romaji],
      hiragana,
      katakana,
      ...(baseKanaId === undefined ? {} : { baseKanaId }),
      ...(origin === undefined ? {} : { origin }),
      strokePaths: [] as string[],
      confusable: [...(confusableMap.get(romaji) ?? [])],
      // 缺实例时保持空数组，由 `validateKanaData` 报 `examples 至少 1 条` 并让 gen:data 退出码 1；
      // 此处**不做兜底造数据**（不伪造内容，PRD §7.2）。
      examples,
      source: 'human' as const,
    }
  })
}

/** 展开全部假名（104 音）。
 *
 * **两遍构建**：先出清音 / 浊音 / 半浊音并建立「大書き假名 → id」索引（き → `ki`），
 * 再据此解析拗音的基准音。行声明序本就是「清音 → 浊音 → 半浊音 → 拗音」，
 * 故两遍拼接后仍与声明序完全一致（保证 `group.kanaIds` 顺序稳定）。
 */
export function buildKanaList(): Kana[] {
  const rowById = new Map(KANA_ROW_SPECS.map((row) => [row.id, row]))
  const confusableMap = buildConfusableMap(KANA_CONFUSABLE_EDGES)
  const leadingKanaId = new Map<string, string>()
  const kana: Kana[] = []

  for (const row of KANA_ROW_SPECS) {
    if (row.baseFromFirst === true) {
      continue
    }
    for (const item of expandRow(row, rowById, confusableMap, leadingKanaId)) {
      leadingKanaId.set(item.hiragana, item.id)
      kana.push(item)
    }
  }
  for (const row of KANA_ROW_SPECS) {
    if (row.baseFromFirst !== true) {
      continue
    }
    for (const item of expandRow(row, rowById, confusableMap, leadingKanaId)) {
      kana.push(item)
    }
  }
  return kana
}

/** 展开 12 关（`kanaIds` 按行声明序派生）。 */
export function buildKanaGroups(): KanaGroup[] {
  const kana = buildKanaList()
  const byGroup = new Map<string, string[]>()
  for (const item of kana) {
    const list = byGroup.get(item.groupId)
    if (list === undefined) {
      byGroup.set(item.groupId, [item.id])
      continue
    }
    list.push(item.id)
  }
  return [...KANA_GROUP_SPECS]
    .sort((a, b) => a.order - b.order)
    .map((spec) => ({
      id: spec.id,
      name: spec.name,
      voiceType: spec.voiceType,
      order: spec.order,
      prerequisiteGroupIds: [...spec.prerequisiteGroupIds],
      kanaIds: byGroup.get(spec.id) ?? [],
      source: spec.source,
    }))
}

/** 构建 `data/build/kana.json` 的内容。 */
export function buildKana(): { groups: KanaGroup[]; kana: Kana[] } {
  return { groups: buildKanaGroups(), kana: buildKanaList() }
}
