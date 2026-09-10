import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { BuildDataInput } from './schema.js'
import { BuildDataSchema } from './schema.js'

/** 校验结果。 */
export interface ValidationResult {
  ok: boolean
  errors: string[]
}

const here = dirname(fileURLToPath(import.meta.url))
const buildDir = resolve(here, '../../data/build')

/** 构建文件名 → `BuildData` 字段名的映射。 */
const BUILD_FILES: ReadonlyArray<{ file: string; key: keyof BuildDataInput }> =
  [
    { file: 'stages', key: 'stages' },
    { file: 'modules', key: 'modules' },
    { file: 'words', key: 'words' },
    { file: 'grammar', key: 'grammars' },
    { file: 'sentences', key: 'sentences' },
  ]

/** 读取 `data/build/*.json`，组装为待校验对象。 */
export async function loadBuild(): Promise<Record<string, unknown>> {
  const data: Record<string, unknown> = {}
  for (const { file, key } of BUILD_FILES) {
    const raw = await readFile(resolve(buildDir, `${file}.json`), 'utf8')
    data[key] = JSON.parse(raw)
  }
  return data
}

/**
 * 纯校验器：schema + 引用完整性 + 枚举 + 例句高亮偏移。
 * 失败返回 `{ ok: false, errors }`，不 throw。
 */
export function validateData(input: unknown): ValidationResult {
  const errors: string[] = []

  const parsed = BuildDataSchema.safeParse(input)
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      errors.push(`schema: [${issue.path.join('.')}] ${issue.message}`)
    }
    return { ok: false, errors }
  }

  const data = parsed.data

  const stageIds = new Set(data.stages.map((s) => s.id))
  const moduleIds = new Set(data.modules.map((m) => m.id))
  const moduleById = new Map(data.modules.map((m) => [m.id, m]))
  const wordIds = new Set(data.words.map((w) => w.id))
  const grammarIds = new Set(data.grammars.map((g) => g.id))

  // —— 模块 → 阶段 ——
  for (const m of data.modules) {
    if (!stageIds.has(m.stageId)) {
      errors.push(`module ${m.id}: stageId "${m.stageId}" 不存在`)
    }
  }

  // —— 词条 → 阶段/模块 与关联词 ——
  for (const w of data.words) {
    if (!stageIds.has(w.stageId)) {
      errors.push(`word ${w.id}: stageId "${w.stageId}" 不存在`)
    }
    if (!moduleIds.has(w.moduleId)) {
      errors.push(`word ${w.id}: moduleId "${w.moduleId}" 不存在`)
    }
    const owner = moduleById.get(w.moduleId)
    if (owner !== undefined && owner.stageId !== w.stageId) {
      errors.push(`word ${w.id}: stageId 与 module.stageId 不一致`)
    }
    for (const rel of w.related ?? []) {
      if (!wordIds.has(rel.toId)) {
        errors.push(`word ${w.id}: related.toId "${rel.toId}" 不存在`)
      }
    }
  }

  // —— 语法 → 阶段 与关联语法 ——
  for (const g of data.grammars) {
    if (!stageIds.has(g.stageId)) {
      errors.push(`grammar ${g.id}: stageId "${g.stageId}" 不存在`)
    }
    for (const rel of g.related ?? []) {
      if (!grammarIds.has(rel.toId)) {
        errors.push(`grammar ${g.id}: related.toId "${rel.toId}" 不存在`)
      }
    }
  }

  // —— 例句 → 词/语法 与高亮偏移 ——
  for (const s of data.sentences) {
    for (const sw of s.words) {
      if (!wordIds.has(sw.wordId)) {
        errors.push(`sentence ${s.id}: wordId "${sw.wordId}" 不存在`)
      }
      const hasStart = sw.start !== undefined
      const hasEnd = sw.end !== undefined
      if (hasStart !== hasEnd) {
        errors.push(`sentence ${s.id}: 偏移 start/end 必须同时提供`)
      } else if (hasStart && hasEnd) {
        const start = sw.start ?? 0
        const end = sw.end ?? 0
        if (!(start >= 0 && start < end && end <= s.ja.length)) {
          errors.push(
            `sentence ${s.id}: 偏移非法 [${start}, ${end})，ja.length=${s.ja.length}`,
          )
        }
      }
    }
    for (const sg of s.grammars) {
      if (!grammarIds.has(sg.grammarId)) {
        errors.push(`sentence ${s.id}: grammarId "${sg.grammarId}" 不存在`)
      }
    }
  }

  return { ok: errors.length === 0, errors }
}
