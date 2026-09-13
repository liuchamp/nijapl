import { useMemo } from 'react'
import { useNavigate } from 'react-router'
import {
  grammarDetailPath,
  graphPath,
  kanaQuizPath,
  kanaStudyPath,
  ROUTES,
  studyPath,
  vocabPath,
} from '../constants/routes.js'
import type { GraphMode } from '../types/graph.js'

/**
 * 类型化导航助手（架构 §2.8）。
 *
 * 统一入口：**不使用** `<Link>` / `<NavLink>`（Lynx 无此组件），一律 `useNavigate()`。
 * 页面调用 `const nav = useNavigation()` 后使用语义化方法，避免路径字符串硬编码。
 */

/** 进入 P2 的选项。 */
export interface StudyNavigationOptions {
  mode?: 'learn' | 'review'
}

/** 进入 P6 的选项。 */
export interface GraphNavigationOptions {
  view?: GraphMode
  focus?: string
}

/** 进入 K1 的选项。 */
export interface KanaStudyNavigationOptions {
  mode?: 'learn' | 'review'
}

/** 导航能力集合。 */
export interface Navigation {
  goHome(): void
  goStages(): void
  goGrammarList(): void
  goReview(): void
  goMe(): void
  goStudy(moduleId: string, options?: StudyNavigationOptions): void
  goVocab(wordId: string): void
  goGrammarDetail(grammarId: string): void
  goGraph(options?: GraphNavigationOptions): void
  goQuiz(): void
  goKana(): void
  goKanaStudy(groupId: string, options?: KanaStudyNavigationOptions): void
  goKanaQuiz(groupId?: string): void
  back(): void
}

/** 取导航助手（在组件内调用）。 */
export function useNavigation(): Navigation {
  const navigate = useNavigate()
  return useMemo<Navigation>(
    () => ({
      goHome(): void {
        navigate(ROUTES.home)
      },
      goStages(): void {
        navigate(ROUTES.stages)
      },
      goGrammarList(): void {
        navigate(ROUTES.grammar)
      },
      goReview(): void {
        navigate(ROUTES.review)
      },
      goMe(): void {
        navigate(ROUTES.me)
      },
      goStudy(moduleId: string, options?: StudyNavigationOptions): void {
        navigate(studyPath(moduleId, options?.mode))
      },
      goVocab(wordId: string): void {
        navigate(vocabPath(wordId))
      },
      goGrammarDetail(grammarId: string): void {
        navigate(grammarDetailPath(grammarId))
      },
      goGraph(options?: GraphNavigationOptions): void {
        navigate(graphPath(options))
      },
      goQuiz(): void {
        navigate(ROUTES.quiz)
      },
      goKana(): void {
        navigate(ROUTES.kana)
      },
      goKanaStudy(groupId: string, options?: KanaStudyNavigationOptions): void {
        navigate(kanaStudyPath(groupId, options?.mode))
      },
      goKanaQuiz(groupId?: string): void {
        navigate(kanaQuizPath(groupId))
      },
      back(): void {
        navigate(-1)
      },
    }),
    [navigate],
  )
}
