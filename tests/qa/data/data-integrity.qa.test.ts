import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import type { BuildData } from '../../../src/types/domain.js'
import { validateData } from '../../../scripts/gen-data/validate.js'

/**
 * QA 独立验证 —— T01 数据地基。
 * 直接读取磁盘上的 `data/build/*.json`（运行时唯一入口），而非 seed 源。
 */

function load<T>(name: string): T {
  const url = new URL(`../../../data/build/${name}.json`, import.meta.url)
  return JSON.parse(readFileSync(url, 'utf8')) as T
}

const stages = load<BuildData['stages']>('stages')
const modules = load<BuildData['modules']>('modules')
const words = load<BuildData['words']>('words')
const grammars = load<BuildData['grammars']>('grammar')
const sentences = load<BuildData['sentences']>('sentences')
const build: BuildData = { stages, modules, words, grammars, sentences }

function clone(): BuildData {
  return structuredClone(build)
}

describe('QA · 数据规模（PRD §7.2 / ARCH §7 T01 判据 2）', () => {
  it('4 阶段', () => expect(stages).toHaveLength(4))
  it('8–12 模块', () => {
    expect(modules.length).toBeGreaterThanOrEqual(8)
    expect(modules.length).toBeLessThanOrEqual(12)
  })
  it('40–60 词条', () => {
    expect(words.length).toBeGreaterThanOrEqual(40)
    expect(words.length).toBeLessThanOrEqual(60)
  })
  it('12–20 语法点', () => {
    expect(grammars.length).toBeGreaterThanOrEqual(12)
    expect(grammars.length).toBeLessThanOrEqual(20)
  })
  it('存在配套例句', () => expect(sentences.length).toBeGreaterThan(0))
})

describe('QA · source:"seed" 标注覆盖（防伪造红线）', () => {
  it('words 全部 source="seed"', () => {
    const bad = words.filter((w) => w.source !== 'seed')
    expect(bad.map((w) => w.id)).toEqual([])
  })
  it('grammars 全部 source="seed"', () => {
    const bad = grammars.filter((g) => g.source !== 'seed')
    expect(bad.map((g) => g.id)).toEqual([])
  })
  it('sentences 全部 source="seed"', () => {
    const bad = sentences.filter((s) => s.source !== 'seed')
    expect(bad.map((s) => s.id)).toEqual([])
  })
  it('记录 source 覆盖统计（用于报告）', () => {
    const counts = {
      stages: stages.filter((s) => 'source' in s).length,
      modules: modules.filter((m) => 'source' in m).length,
      words: words.filter((w) => w.source === 'seed').length,
      grammars: grammars.filter((g) => g.source === 'seed').length,
      sentences: sentences.filter((s) => s.source === 'seed').length,
      totals: {
        stages: stages.length,
        modules: modules.length,
        words: words.length,
        grammars: grammars.length,
        sentences: sentences.length,
      },
    }
    // stages/modules 在 ARCH §3.1 schema 中本无 source 字段（PRD §7.2 措辞更宽）
    expect(counts.words).toBe(counts.totals.words)
    expect(counts.grammars).toBe(counts.totals.grammars)
    expect(counts.sentences).toBe(counts.totals.sentences)
  })
})

describe('QA · 冲刺期 hasContent=false（防 NaN 关键字段）', () => {
  it('存在且仅存在一个 hasContent=false 的冲刺期', () => {
    const sprint = stages.filter((s) => s.hasContent === false)
    expect(sprint).toHaveLength(1)
    expect(sprint[0].name).toContain('冲刺')
  })
})

describe('QA · validateData 对真实产物全绿', () => {
  it('真实 data/build 通过校验（schema+引用+枚举+偏移）', () => {
    const r = validateData(build)
    expect(r.errors).toEqual([])
    expect(r.ok).toBe(true)
  })
})

describe('QA · 引用完整性（独立复算）', () => {
  const stageIds = new Set(stages.map((s) => s.id))
  const moduleIds = new Set(modules.map((m) => m.id))
  const wordIds = new Set(words.map((w) => w.id))
  const grammarIds = new Set(grammars.map((g) => g.id))

  it('每个 module.stageId 存在', () => {
    for (const m of modules) expect(stageIds.has(m.stageId), m.id).toBe(true)
  })
  it('每个 word.moduleId / stageId 存在', () => {
    for (const w of words) {
      expect(moduleIds.has(w.moduleId), `${w.id}.moduleId`).toBe(true)
      expect(stageIds.has(w.stageId), `${w.id}.stageId`).toBe(true)
    }
  })
  it('word.stageId 与所属 module.stageId 一致', () => {
    const m = new Map(modules.map((x) => [x.id, x]))
    for (const w of words) {
      expect(m.get(w.moduleId)?.stageId, w.id).toBe(w.stageId)
    }
  })
  it('每个 grammar.stageId 存在', () => {
    for (const g of grammars) expect(stageIds.has(g.stageId), g.id).toBe(true)
  })
  it('每个 sentence.words[].wordId / grammars[].grammarId 存在', () => {
    for (const s of sentences) {
      for (const sw of s.words) expect(wordIds.has(sw.wordId), `${s.id}:${sw.wordId}`).toBe(true)
      for (const sg of s.grammars) {
        expect(grammarIds.has(sg.grammarId), `${s.id}:${sg.grammarId}`).toBe(true)
      }
    }
  })
})

describe('QA · SentenceWord.start/end 可选偏移约束', () => {
  it('已提供的偏移满足 0 <= start < end <= ja.length', () => {
    for (const s of sentences) {
      for (const sw of s.words) {
        const hasStart = sw.start !== undefined
        const hasEnd = sw.end !== undefined
        expect(hasStart, `${s.id}: start/end 必须同时提供`).toBe(hasEnd)
        if (hasStart && hasEnd) {
          expect(sw.start!, `${s.id}:${sw.wordId} start>=0`).toBeGreaterThanOrEqual(0)
          expect(sw.start! < sw.end!, `${s.id}:${sw.wordId} start<end`).toBe(true)
          expect(sw.end! <= s.ja.length, `${s.id}:${sw.wordId} end<=len`).toBe(true)
        }
      }
    }
  })

  it('存在「缺失偏移」与「带偏移」两类样例（覆盖可选分支）', () => {
    const all = sentences.flatMap((s) => s.words)
    expect(all.some((w) => w.start === undefined)).toBe(true)
    expect(all.some((w) => w.start !== undefined)).toBe(true)
  })
})

describe('QA · 校验器拒绝坏数据（负向用例）', () => {
  it('word.moduleId 指向不存在模块 → 拒绝', () => {
    const d = clone()
    d.words[0].moduleId = 'NO_SUCH_MODULE'
    const r = validateData(d)
    expect(r.ok).toBe(false)
    expect(r.errors.join('\n')).toContain('moduleId')
  })

  it('word.stageId 指向不存在阶段 → 拒绝', () => {
    const d = clone()
    d.words[0].stageId = 'NO_SUCH_STAGE'
    expect(validateData(d).ok).toBe(false)
  })

  it('pos 越出枚举（单字「五」）→ 拒绝', () => {
    const d = clone()
    // @ts-expect-error 故意注入非法枚举
    d.words[0].pos = '五'
    expect(validateData(d).ok).toBe(false)
  })

  it('source 越出枚举 → 拒绝', () => {
    const d = clone()
    // @ts-expect-error 故意注入非法来源
    d.words[0].source = 'csv'
    expect(validateData(d).ok).toBe(false)
  })

  it('高亮偏移越界 end > ja.length → 拒绝', () => {
    const d = clone()
    const target = d.sentences.find((s) => s.words.some((w) => w.start !== undefined))!
    const sw = target.words.find((w) => w.start !== undefined)!
    sw.end = target.ja.length + 5
    expect(validateData(d).ok).toBe(false)
  })

  it('高亮偏移 start === end → 拒绝', () => {
    const d = clone()
    const target = d.sentences.find((s) => s.words.some((w) => w.start !== undefined))!
    const sw = target.words.find((w) => w.start !== undefined)!
    sw.end = sw.start
    expect(validateData(d).ok).toBe(false)
  })

  it('高亮偏移仅提供 start → 拒绝', () => {
    const d = clone()
    const target = d.sentences.find((s) => s.words.some((w) => w.start !== undefined))!
    const sw = target.words.find((w) => w.start !== undefined)!
    delete sw.end
    expect(validateData(d).ok).toBe(false)
  })

  it('sentence.grammars[].grammarId 悬空 → 拒绝', () => {
    const d = clone()
    const withG = d.sentences.find((s) => s.grammars.length > 0)!
    withG.grammars[0].grammarId = 'G999'
    expect(validateData(d).ok).toBe(false)
  })

  it('sentence.words[].wordId 悬空 → 拒绝', () => {
    const d = clone()
    d.sentences[0].words[0].wordId = 'w-NOPE'
    expect(validateData(d).ok).toBe(false)
  })
})
