import { describe, expect, it } from 'vitest'

import { seedData } from '../../../data/source/seed/index.js'
import type { BuildData } from '../../../src/types/domain.js'
import { validateData } from '../validate.js'

/** 深拷贝 seed，避免用例间相互污染。 */
function cloneBuild(): BuildData {
  return {
    stages: seedData.stages.map((s) => ({
      ...s,
      weekRange: { ...s.weekRange },
    })),
    modules: seedData.modules.map((m) => ({ ...m })),
    words: seedData.words.map((w) => ({ ...w })),
    grammars: seedData.grammars.map((g) => ({ ...g })),
    sentences: seedData.sentences.map((s) => ({
      ...s,
      words: s.words.map((w) => ({ ...w })),
      grammars: s.grammars.map((g) => ({ ...g })),
    })),
  }
}

describe('validateData', () => {
  it('接受完整合法的 seed 数据', () => {
    const result = validateData(cloneBuild())
    expect(result.ok).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('拒绝悬空引用：word.stageId 不存在', () => {
    const data = cloneBuild()
    data.words[0].stageId = 'NO_SUCH_STAGE'
    const result = validateData(data)
    expect(result.ok).toBe(false)
    expect(result.errors.some((e) => e.includes('word'))).toBe(true)
  })

  it('拒绝词条 stageId 与 module.stageId 不一致', () => {
    const data = cloneBuild()
    data.words[0].moduleId = 'm10'
    const result = validateData(data)
    expect(result.ok).toBe(false)
    expect(result.errors.some((e) => e.includes('不一致'))).toBe(true)
  })

  it('拒绝非法词性枚举（单字匹配应被拦截）', () => {
    const data = cloneBuild()
    // @ts-expect-error 故意写入非法枚举值
    data.words[0].pos = '五'
    expect(validateData(data).ok).toBe(false)
  })

  it('拒绝非法数据来源枚举', () => {
    const data = cloneBuild()
    // @ts-expect-error 故意写入非法来源
    data.words[0].source = 'csv'
    expect(validateData(data).ok).toBe(false)
  })

  it('拒绝悬空例句引用：grammarId 不存在', () => {
    const data = cloneBuild()
    data.sentences[1].grammars[0].grammarId = 'G999'
    const result = validateData(data)
    expect(result.ok).toBe(false)
    expect(result.errors.some((e) => e.includes('grammar'))).toBe(true)
  })

  it('拒绝倒序的句子高亮偏移 [start >= end]', () => {
    const data = cloneBuild()
    data.sentences[0].words[0].start = 6
    data.sentences[0].words[0].end = 2
    expect(validateData(data).ok).toBe(false)
  })

  it('拒绝越界的句子高亮偏移 [end > ja.length]', () => {
    const data = cloneBuild()
    data.sentences[0].words[0].start = 0
    data.sentences[0].words[0].end = 999
    expect(validateData(data).ok).toBe(false)
  })

  it('拒绝仅提供 start 而不提供 end 的偏移', () => {
    const data = cloneBuild()
    data.sentences[0].words[0].start = 0
    delete data.sentences[0].words[0].end
    expect(validateData(data).ok).toBe(false)
  })
})
