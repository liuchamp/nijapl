import type { Word } from '../types/domain.js'

/**
 * P8 自测的三题型出题（纯函数，架构 §2.9 / T05 判据 4）。
 *
 * 题型：
 * - `ja-zh`：题面为日文（汉字优先，无则假名），选项为 4 个中文释义；
 * - `zh-ja`：题面为中文释义，选项为 4 个假名；
 * - `listen`：题面为发音（听音，走 C1），选项为 4 个假名（无 TTS 时以假名兜底）。
 *
 * **确定性**：不使用随机数，相同输入恒产出相同题目与选项顺序（可单测）。
 */

/** 题型。 */
export type QuizMode = 'ja-zh' | 'zh-ja' | 'listen'

/** 选项。`wordId` 便于回写进度时定位词条。 */
export interface QuizOption {
  text: string
  wordId: string
}

/** 单题。 */
export interface QuizQuestion {
  /** 正确答案对应的词条 id（作答回写依据）。 */
  wordId: string
  mode: QuizMode
  /** 题面（listen 模式为空串，改为播放发音 / 兜底显示假名）。 */
  prompt: string
  /** 正确答案文本。 */
  answer: string
  options: QuizOption[]
  /** `answer` 在 `options` 中的下标。 */
  answerIndex: number
}

/** 每题选项数上限（含正确答案）。 */
const OPTION_COUNT = 4

/** 题面文本。 */
function promptFor(word: Word, mode: QuizMode): string {
  if (mode === 'ja-zh') {
    return word.kanji === '' ? word.kana : word.kanji
  }
  if (mode === 'zh-ja') {
    return word.meaning
  }
  return ''
}

/** 选项文本。 */
function optionTextFor(word: Word, mode: QuizMode): string {
  return mode === 'ja-zh' ? word.meaning : word.kana
}

/**
 * 构造题目列表。
 *
 * @param words 词库（未按任何顺序要求，函数内部按入参顺序取用）。
 * @param mode  题型。
 * @param count 期望题数（默认 8，实际不超过词库容量）。
 * @returns 题目数组；词库不足 2 条时返回 `[]`。
 */
export function buildQuizQuestions(
  words: Word[],
  mode: QuizMode,
  count = 8,
): QuizQuestion[] {
  const pool = words.filter((word) => word.meaning !== '' && word.kana !== '')
  const total = pool.length
  if (total < 2) {
    return []
  }

  const questions: QuizQuestion[] = []
  for (let i = 0; i < total && questions.length < count; i += 1) {
    const base = pool[i]
    const answerText = optionTextFor(base, mode)
    const distractors: QuizOption[] = []
    for (
      let step = 1;
      step < total && distractors.length < OPTION_COUNT - 1;
      step += 1
    ) {
      const candidate = pool[(i + step) % total]
      const text = optionTextFor(candidate, mode)
      if (candidate.id === base.id || text === answerText) {
        continue
      }
      if (distractors.some((option) => option.text === text)) {
        continue
      }
      distractors.push({ text, wordId: candidate.id })
    }
    if (distractors.length === 0) {
      continue
    }
    const answer: QuizOption = { text: answerText, wordId: base.id }
    const options = distractors.slice()
    const answerIndex = questions.length % (distractors.length + 1)
    options.splice(answerIndex, 0, answer)
    questions.push({
      wordId: base.id,
      mode,
      prompt: promptFor(base, mode),
      answer: answerText,
      options,
      answerIndex,
    })
  }
  return questions
}

/** 判定作答是否正确（越界视为错误）。 */
export function isAnswerCorrect(
  question: QuizQuestion,
  optionIndex: number,
): boolean {
  return optionIndex === question.answerIndex
}
