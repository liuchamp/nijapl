import { repository } from '../data/index.js'
import { evaluate } from '../engine/jumpRules.js'
import { initialProgress } from '../engine/srs.js'
import { buildJumpContext } from '../store/actions.js'
import { appStore } from '../store/index.js'
import { selectCurrentWord } from '../store/selectors.js'
import type { Word } from '../types/domain.js'
import type { JumpDecision, SelfEval } from '../types/progress.js'
import type { StudyEffect } from './jumpService.js'
import { emptyStudyEffect, toStudyEffect } from './jumpService.js'

/**
 * 学习会话编排（架构 §2.7 / §7 T04）。
 *
 * 职责：把「页面事件」翻译为「store 写操作 + 跳转效果」，是页面与状态层之间的薄编排层。
 *
 * 红线：
 * 1. **写操作仍唯一收敛在 `store/actions.ts`**：本文件只调用 action，不自行改状态；
 * 2. **卡片首次可见必须调用 `applyPresented`**（经 `markPresented` action）——
 *    这是五态中「学习中」的唯一入口（PRD §5.5 / QA F3）；
 * 3. 只依赖 zustand **vanilla** store（`store/index.ts`），不引入 React 绑定，
 *    以便在 Node 环境做端到端冒烟测试。
 */

/** 进入 P2 所需的最小信息。 */
export interface StudyEntry {
  moduleId: string
  words: Word[]
  index: number
}

/** 模块词序（进入 P2 的渲染序列）。 */
export function getModuleWords(moduleId: string): Word[] {
  return repository.getModuleWords(moduleId)
}

/** 当前词条（越界返回 `undefined`）。 */
export function currentWord(): Word | undefined {
  return selectCurrentWord(appStore.getState())
}

/** 开始学习某模块：读会话断点定位起始词序，返回渲染序列与起始下标。 */
export function beginStudy(moduleId: string): StudyEntry {
  appStore.getState().startStudy(moduleId)
  return {
    moduleId,
    words: repository.getModuleWords(moduleId),
    index: appStore.getState().runtime.currentIndex,
  }
}

/**
 * 卡片**首次可见**钩子：`未学 → 学习中`（幂等）。
 *
 * 由 Study 页在 `currentWord` 变化时调用；对已是非「未学」态的卡片为空操作，
 * 因此重复调用安全。
 */
export function presentCurrentCard(now?: number): void {
  const word = currentWord()
  if (word === undefined) {
    return
  }
  appStore.getState().markPresented(word.id, now)
}

/** 跳转到指定词序；返回收敛后的实际下标（越界自动夹取）。 */
export function goToIndex(index: number): number {
  appStore.getState().setCurrentIndex(index)
  return appStore.getState().runtime.currentIndex
}

/** 上一张 / 下一张（返回收敛后的新下标）。 */
export function stepIndex(delta: number): number {
  const current = appStore.getState().runtime.currentIndex
  return goToIndex(current + delta)
}

/** 自评结果 + 由此产生的界面效果。 */
export interface SelfEvalOutcome {
  decisions: JumpDecision[]
  effect: StudyEffect
}

/**
 * 提交三档自评（P2）。
 *
 * 走 `submitSelfEval` action（唯一写入口）：内部完成 SRS 推进、会话计数与跳转评估；
 * 本函数再经 `jumpService` 把决策翻译为页面效果。
 *
 * @param wordId  目标词条 id（通常为当前卡片词条）
 * @param selfEval 三档自评
 * @param now     时间戳（便于测试注入）
 */
export function applySelfEvaluation(
  wordId: string,
  selfEval: SelfEval,
  now?: number,
): SelfEvalOutcome {
  const decisions = appStore.getState().submitSelfEval(wordId, selfEval, now)
  return { decisions, effect: toStudyEffect(decisions) }
}

/** 跳过当前词条：`学习中 → 未学`，不计分。 */
export function skipCurrentWord(wordId: string, now?: number): void {
  appStore.getState().skipWord(wordId, now)
}

/**
 * 场景触发评估（scene）：用于进入卡片 / 详解页时命中 J3（高亮未掌握语法）、
 * J4（模块学完）、J5（动词变形）、J6（关联词）。
 *
 * 注意 scene 不评估 J1 / J2（二者仅由 selfEval 触发，见 jumpRules 注释）。
 */
export function evaluateSceneEffect(word: Word): StudyEffect {
  const state = appStore.getState()
  const decisions = evaluate(
    buildJumpContext(
      state,
      word,
      state.progress[word.id] ?? initialProgress(word.id),
    ),
    'scene',
  )
  return toStudyEffect(decisions)
}

/** 空效果快捷方式（页面初值用）。 */
export { emptyStudyEffect }
