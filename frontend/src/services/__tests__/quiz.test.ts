import { describe, expect, it } from 'vitest'

import type { Word } from '../../types/domain.js'
import { buildQuizQuestions, isAnswerCorrect } from '../quiz.js'

function makeWord(id: string, kana: string, meaning: string): Word {
  return {
    id,
    kana,
    kanji: '',
    pos: '名詞',
    meaning,
    stageId: 's1',
    moduleId: 'm01',
    source: 'seed',
  }
}

const WORDS: Word[] = [
  makeWord('w-01', 'のむ', '喝'),
  makeWord('w-02', 'たべる', '吃'),
  makeWord('w-03', 'いく', '去'),
  makeWord('w-04', 'みる', '看'),
  makeWord('w-05', 'きく', '听'),
]

describe('quiz · buildQuizQuestions 确定性', () => {
  it('相同输入恒产出相同题目（确定性）', () => {
    const a = buildQuizQuestions(WORDS, 'ja-zh', 8)
    const b = buildQuizQuestions(WORDS, 'ja-zh', 8)
    expect(a).toEqual(b)
  })

  it('词库不足 2 条 → 空题集', () => {
    expect(buildQuizQuestions([], 'ja-zh')).toEqual([])
    expect(buildQuizQuestions([makeWord('w', 'のむ', '喝')], 'ja-zh')).toEqual(
      [],
    )
  })

  it('题数受词库容量限制（不重复出题）', () => {
    const questions = buildQuizQuestions(WORDS, 'zh-ja', 100)
    expect(questions).toHaveLength(WORDS.length)
    const ids = new Set(questions.map((q) => q.wordId))
    expect(ids.size).toBe(WORDS.length)
  })

  it('每题含正确答案且 answerIndex 指向它', () => {
    for (const question of buildQuizQuestions(WORDS, 'ja-zh')) {
      expect(question.options[question.answerIndex]?.text).toBe(question.answer)
      expect(question.options[question.answerIndex]?.wordId).toBe(
        question.wordId,
      )
    }
  })

  it('ja-zh：题面为日文，选项为中文释义', () => {
    const question = buildQuizQuestions(WORDS, 'ja-zh')[0]
    expect(question.prompt).toBe('のむ')
    for (const option of question.options) {
      expect(WORDS.map((w) => w.meaning)).toContain(option.text)
    }
  })

  it('zh-ja：题面为中文，选项为假名', () => {
    const question = buildQuizQuestions(WORDS, 'zh-ja')[0]
    expect(question.prompt).toBe('喝')
    for (const option of question.options) {
      expect(WORDS.map((w) => w.kana)).toContain(option.text)
    }
  })

  it('listen：题面为空串（以发音/假名兜底），选项为假名', () => {
    const question = buildQuizQuestions(WORDS, 'listen')[0]
    expect(question.prompt).toBe('')
    for (const option of question.options) {
      expect(WORDS.map((w) => w.kana)).toContain(option.text)
    }
  })

  it('选项文本互不重复', () => {
    for (const question of buildQuizQuestions(WORDS, 'ja-zh')) {
      const texts = question.options.map((o) => o.text)
      expect(new Set(texts).size).toBe(texts.length)
    }
  })
})

describe('quiz · isAnswerCorrect', () => {
  it('命中 answerIndex → true；其它 → false', () => {
    const question = buildQuizQuestions(WORDS, 'ja-zh')[0]
    expect(isAnswerCorrect(question, question.answerIndex)).toBe(true)
    expect(isAnswerCorrect(question, -1)).toBe(false)
    expect(isAnswerCorrect(question, 99)).toBe(false)
    expect(isAnswerCorrect(question, (question.answerIndex + 1) % 4)).toBe(
      false,
    )
  })
})
