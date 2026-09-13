import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { KanaDataInput } from './kana-schema.js'
import { KanaDataSchema } from './kana-schema.js'
import type { ValidationResult } from './validate.js'

/**
 * K 域数据校验：schema + 唯一性 + 引用完整性 + 枚举 + 结构规则 + 规模。
 *
 * 与 `validate.ts` 分开，保证 W 域契约（`ARCH §8.7` 冻结）零改动。
 * 失败返回 `{ ok: false, errors }`，不 throw；由 `gen:data` 置退出码 1。
 */

const here = dirname(fileURLToPath(import.meta.url))
const buildDir = resolve(here, '../../data/build')

/** 各音类的期望音数（设计 §7.3）。 */
const EXPECTED_VOICE_COUNTS: Record<string, number> = {
  清音: 46,
  浊音: 20,
  半浊音: 5,
  拗音: 33,
}

/** 读取 `data/build/kana.json`。 */
export async function loadKanaBuild(): Promise<unknown> {
  const raw = await readFile(resolve(buildDir, 'kana.json'), 'utf8')
  return JSON.parse(raw)
}

/** 读取 `data/build/words.json` 的 id 集合（校验 `examples[].wordId` 引用）。 */
export async function loadWordIds(): Promise<Set<string>> {
  const raw = await readFile(resolve(buildDir, 'words.json'), 'utf8')
  const words = JSON.parse(raw) as Array<{ id: string }>
  return new Set(words.map((word) => word.id))
}

/** 按 `id` 找重复项。 */
function findDuplicates(values: string[]): string[] {
  const seen = new Set<string>()
  const duplicates = new Set<string>()
  for (const value of values) {
    if (seen.has(value)) {
      duplicates.add(value)
    }
    seen.add(value)
  }
  return [...duplicates]
}

/** 前置关是否存在环（DFS 三色标记）。 */
function findPrerequisiteCycle(groups: KanaDataInput['groups']): string | null {
  const byId = new Map(groups.map((group) => [group.id, group]))
  const state = new Map<string, 0 | 1 | 2>()
  let cyclic: string | null = null

  const visit = (id: string): void => {
    if (cyclic !== null) {
      return
    }
    const mark = state.get(id) ?? 0
    if (mark === 1) {
      cyclic = id
      return
    }
    if (mark === 2) {
      return
    }
    state.set(id, 1)
    for (const next of byId.get(id)?.prerequisiteGroupIds ?? []) {
      visit(next)
    }
    state.set(id, 2)
  }

  for (const group of groups) {
    visit(group.id)
  }
  return cyclic
}

/** K 域数据校验入口。 */
export function validateKanaData(
  input: unknown,
  wordIds: ReadonlySet<string>,
): ValidationResult {
  const errors: string[] = []

  const parsed = KanaDataSchema.safeParse(input)
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      errors.push(`kana schema: [${issue.path.join('.')}] ${issue.message}`)
    }
    return { ok: false, errors }
  }

  const { groups, kana } = parsed.data
  const groupIds = new Set(groups.map((group) => group.id))
  const kanaById = new Map(kana.map((item) => [item.id, item]))

  // —— 唯一性 ——
  for (const [label, values] of [
    ['kana.id', kana.map((item) => item.id)],
    ['kana.romaji', kana.map((item) => item.romaji)],
    ['kana.hiragana', kana.map((item) => item.hiragana)],
    ['kana.katakana', kana.map((item) => item.katakana)],
    ['group.id', groups.map((group) => group.id)],
    ['group.order', groups.map((group) => `${group.order}`)],
  ] as Array<[string, string[]]>) {
    for (const duplicate of findDuplicates(values)) {
      errors.push(`kana: ${label} 重复 "${duplicate}"`)
    }
  }

  // —— 关卡 order 连续（1..N） ——
  const orders = groups.map((group) => group.order).sort((a, b) => a - b)
  orders.forEach((order, index) => {
    if (order !== index + 1) {
      errors.push(`kana group: order 不连续，期望 ${index + 1}，实际 ${order}`)
    }
  })

  // —— 关卡前置：存在 + 无环 ——
  for (const group of groups) {
    for (const prerequisite of group.prerequisiteGroupIds) {
      if (!groupIds.has(prerequisite)) {
        errors.push(
          `kana group ${group.id}: prerequisiteGroupId "${prerequisite}" 不存在`,
        )
      }
      if (prerequisite === group.id) {
        errors.push(`kana group ${group.id}: 前置关不能是自己`)
      }
    }
  }
  const cyclic = findPrerequisiteCycle(groups)
  if (cyclic !== null) {
    errors.push(`kana group: prerequisiteGroupIds 存在环，起点 "${cyclic}"`)
  }

  // —— group.kanaIds ↔ kana.groupId 双向一致 ——
  const expectedByGroup = new Map<string, string[]>()
  for (const item of kana) {
    const list = expectedByGroup.get(item.groupId)
    if (list === undefined) {
      expectedByGroup.set(item.groupId, [item.id])
      continue
    }
    list.push(item.id)
  }
  for (const group of groups) {
    const actual = group.kanaIds
    const expected = expectedByGroup.get(group.id) ?? []
    if (actual.join(',') !== expected.join(',')) {
      errors.push(
        `kana group ${group.id}: kanaIds 与 kana.groupId 不一致（group=[${actual.join(',')}] / kana=[${expected.join(',')}]）`,
      )
    }
  }
  for (const groupId of expectedByGroup.keys()) {
    if (!groupIds.has(groupId)) {
      errors.push(`kana: groupId "${groupId}" 不存在`)
    }
  }

  // —— 逐音校验 ——
  for (const item of kana) {
    if (item.romajiAliases[0] !== item.romaji) {
      errors.push(
        `kana ${item.id}: romajiAliases 首项必须是 romaji "${item.romaji}"`,
      )
    }
    for (const alias of item.romajiAliases) {
      if (!/^[a-z]+$/.test(alias)) {
        errors.push(`kana ${item.id}: romajiAliases "${alias}" 必须是小写字母`)
      }
    }

    if (item.baseKanaId !== undefined) {
      if (!kanaById.has(item.baseKanaId)) {
        errors.push(`kana ${item.id}: baseKanaId "${item.baseKanaId}" 不存在`)
      }
      if (item.baseKanaId === item.id) {
        errors.push(`kana ${item.id}: baseKanaId 不能是自己`)
      }
    }

    for (const other of item.confusable) {
      if (!kanaById.has(other)) {
        errors.push(`kana ${item.id}: confusable "${other}" 不存在`)
      }
      if (other === item.id) {
        errors.push(`kana ${item.id}: confusable 不能包含自己`)
      }
      if (!kanaById.get(other)?.confusable.includes(item.id)) {
        errors.push(
          `kana ${item.id}: confusable "${other}" 未对称回指（对称闭包被破坏）`,
        )
      }
    }

    // 音类结构规则
    if (item.voiceType === '清音') {
      if (item.baseKanaId !== undefined) {
        errors.push(`kana ${item.id}: 清音不应有 baseKanaId`)
      }
      if (item.origin === undefined) {
        errors.push(`kana ${item.id}: 清音必须有 origin（字源）`)
      }
    } else {
      if (item.baseKanaId === undefined) {
        errors.push(`kana ${item.id}: ${item.voiceType}必须有 baseKanaId`)
      }
      if (item.origin !== undefined) {
        errors.push(
          `kana ${item.id}: ${item.voiceType}不应有独立 origin（由基准音构成）`,
        )
      }
    }

    // 书写形态规则（拗音 2 码点，其余 1 码点）
    const expectedLength = item.voiceType === '拗音' ? 2 : 1
    for (const [label, value] of [
      ['hiragana', item.hiragana],
      ['katakana', item.katakana],
    ] as Array<[string, string]>) {
      if ([...value].length !== expectedLength) {
        errors.push(
          `kana ${item.id}: ${label} "${value}" 码点数应为 ${expectedLength}`,
        )
      }
    }

    // 段规则：拗音只可能是 a/u/o；ん 只能是 n
    if (item.voiceType === '拗音' && !['a', 'u', 'o'].includes(item.vowel)) {
      errors.push(`kana ${item.id}: 拗音的段只能是 a/u/o，实际 "${item.vowel}"`)
    }
    if (item.id === 'n' && item.vowel !== 'n') {
      errors.push(`kana ${item.id}: ん 的段必须是 n`)
    }

    for (const example of item.examples) {
      if (example.wordId !== undefined && !wordIds.has(example.wordId)) {
        errors.push(
          `kana ${item.id}: examples.wordId "${example.wordId}" 不在 N3 词表中`,
        )
      }
    }
  }

  // —— 行一致性（音表横轴）——
  // 同一个 `row` 的音必须同关同音类：否则音表会把同一行画到两处，或把浊音混进清音行。
  // 这类脏数据在渲染层表现为「行首完成度分母莫名变大」，很难从 UI 反查，故在数据层拦下。
  const rowOwners = new Map<string, { groupId: string; voiceType: string }>()
  for (const item of kana) {
    const owner = rowOwners.get(item.row)
    if (owner === undefined) {
      rowOwners.set(item.row, {
        groupId: item.groupId,
        voiceType: item.voiceType,
      })
      continue
    }
    if (owner.groupId !== item.groupId) {
      errors.push(
        `kana ${item.id}: 行 "${item.row}" 跨关（${owner.groupId} / ${item.groupId}）`,
      )
    }
    if (owner.voiceType !== item.voiceType) {
      errors.push(
        `kana ${item.id}: 行 "${item.row}" 跨音类（${owner.voiceType} / ${item.voiceType}）`,
      )
    }
  }

  // —— 规模 ——
  const counts = new Map<string, number>()
  for (const item of kana) {
    counts.set(item.voiceType, (counts.get(item.voiceType) ?? 0) + 1)
  }
  for (const [voiceType, expected] of Object.entries(EXPECTED_VOICE_COUNTS)) {
    const actual = counts.get(voiceType) ?? 0
    if (actual !== expected) {
      errors.push(`kana: ${voiceType} 音数应为 ${expected}，实际 ${actual}`)
    }
  }
  const total = Object.values(EXPECTED_VOICE_COUNTS).reduce(
    (sum, value) => sum + value,
    0,
  )
  if (kana.length !== total) {
    errors.push(`kana: 总音数应为 ${total}，实际 ${kana.length}`)
  }
  if (groups.length !== 12) {
    errors.push(`kana: 关卡数应为 12，实际 ${groups.length}`)
  }

  return { ok: errors.length === 0, errors }
}
