import { NO_CONTENT } from '../constants/srs.js'
import type { Module, Stage, Word } from '../types/domain.js'
import type { Progress, SrsState } from '../types/progress.js'

/**
 * 单条词条完成度映射：未学=0、已掌握=1，其余按掌握程度取中间值。
 *
 * **导出供 K 域复用**（`engine/kana.ts`）：假名与词条共用同一套「五态 → 分值」口径，
 * 保证「模块完成度」与「关完成度」在语义上可比较。导出为**增量改动**，
 * 既有函数签名与行为零变化。
 */
export const STATE_SCORE: Record<SrsState, number> = {
  未学: 0,
  学习中: 0.25,
  模糊: 0.5,
  需强化: 0.5,
  已掌握: 1,
}

/** 均值；空数组返回 0（避免 0/0 = NaN）。导出理由同 {@link STATE_SCORE}。 */
export function mean(values: number[]): number {
  if (values.length === 0) {
    return 0
  }
  let sum = 0
  for (const value of values) {
    sum += value
  }
  return sum / values.length
}

/** 词条完成度：0..1；未出现过的词返回 0。 */
export function wordCompletion(p: Progress): number {
  if (!p.seen) {
    return 0
  }
  return STATE_SCORE[p.state]
}

/** 模块完成度：其下词条完成度均值；无词条返回 0。 */
export function moduleCompletion(
  words: Word[],
  pm: Record<string, Progress>,
): number {
  if (words.length === 0) {
    return 0
  }
  return mean(
    words.map((word) => {
      const p = pm[word.id]
      return p === undefined ? 0 : wordCompletion(p)
    }),
  )
}

/**
 * 阶段完成度：其下模块完成度均值。
 *
 * `hasContent === false`（冲刺期）返回 {@link NO_CONTENT} 哨兵，
 * **绝不出现 0/0 = NaN**。阶段无模块时退化为按词条计算；无词条返回 0。
 */
export function stageCompletion(
  stage: Stage,
  modules: Module[],
  words: Word[],
  pm: Record<string, Progress>,
): number {
  if (!stage.hasContent) {
    return NO_CONTENT
  }

  const stageModules = modules.filter((m) => m.stageId === stage.id)
  if (stageModules.length === 0) {
    const stageWords = words.filter((w) => w.stageId === stage.id)
    return mean(
      stageWords.map((word) => {
        const p = pm[word.id]
        return p === undefined ? 0 : wordCompletion(p)
      }),
    )
  }

  return mean(
    stageModules.map((m) =>
      moduleCompletion(
        words.filter((w) => w.moduleId === m.id),
        pm,
      ),
    ),
  )
}

/**
 * 总完成度：所有 `hasContent === true` 阶段完成度的均值。
 * `NO_CONTENT` 哨兵被忽略；无参与阶段返回 0。
 */
export function overallCompletion(
  stages: Stage[],
  modules: Module[],
  words: Word[],
  pm: Record<string, Progress>,
): number {
  const scores = stages
    .map((stage) => stageCompletion(stage, modules, words, pm))
    .filter((score) => score !== NO_CONTENT)
  return mean(scores)
}
