import type { GraphMode } from '../types/graph.js'

/**
 * 路由路径唯一来源（架构 §8.2）。
 *
 * 只导出**常量与构造器**，不依赖 react-router；页面 / 路由表 / 导航助手统一引用本文件，
 * 避免路径字符串散落各处。
 */
export const ROUTES = {
  /** P0 首页（Tab） */
  home: '/',
  /** P1 阶段地图（Tab） */
  stages: '/stages',
  /** P4 语法列表（Tab） */
  grammar: '/grammar',
  /** P7 复习（Tab） */
  review: '/review',
  /** P9 我的（Tab） */
  me: '/me',
  /** P2 词汇学习（二级） */
  study: '/study/:moduleId',
  /** P3 词汇详解（二级） */
  vocab: '/vocab/:wordId',
  /** P5 语法详解（二级） */
  grammarDetail: '/grammar/:grammarId',
  /** P6 知识图谱（二级） */
  graph: '/graph',
  /** P8 自测（二级） */
  quiz: '/quiz',
  /** K0 五十音总览（二级；K 域新增，不占 Tab 位） */
  kana: '/kana',
  /** K1 假名学习（二级） */
  kanaStudy: '/kana/study/:groupId',
  /** K2 假名测验（二级） */
  kanaQuiz: '/kana/quiz',
} as const

export type RouteKey = keyof typeof ROUTES

/** 底部 Tab 定义（顺序即展示顺序）。 */
export interface TabDefinition {
  path: string
  label: string
}

/**
 * 底部 5 个 Tab：首页 / 阶段 / 语法 / 复习 / 我的。
 * TabBar 不占独立路由层，由 App 外壳依据 `isTabPath(location.pathname)` 决定是否渲染。
 */
export const TABS: TabDefinition[] = [
  { path: ROUTES.home, label: '首页' },
  { path: ROUTES.stages, label: '阶段' },
  { path: ROUTES.grammar, label: '语法' },
  { path: ROUTES.review, label: '复习' },
  { path: ROUTES.me, label: '我的' },
]

/** 5 个 Tab 路径（唯一来源）。 */
export const TAB_PATHS: string[] = TABS.map((tab) => tab.path)

/** 当前路径是否命中某个 Tab（决定 TabBar 显隐）。 */
export function isTabPath(pathname: string): boolean {
  return TAB_PATHS.includes(pathname)
}

/** P2 词汇学习路径；`mode=review` 表示进入复习模式。 */
export function studyPath(moduleId: string, mode?: 'learn' | 'review'): string {
  const base = `${ROUTES.study.replace(':moduleId', encodeURIComponent(moduleId))}`
  return mode === 'review' ? `${base}?mode=review` : base
}

/** P3 词汇详解路径。 */
export function vocabPath(wordId: string): string {
  return ROUTES.vocab.replace(':wordId', encodeURIComponent(wordId))
}

/** P5 语法详解路径。 */
export function grammarDetailPath(grammarId: string): string {
  return ROUTES.grammarDetail.replace(
    ':grammarId',
    encodeURIComponent(grammarId),
  )
}

/** P6 知识图谱路径（`?view=overview|word|grammar&focus=:id`）。 */
export function graphPath(options?: {
  view?: GraphMode
  focus?: string
}): string {
  const params: string[] = []
  if (options?.view !== undefined) {
    params.push(`view=${encodeURIComponent(options.view)}`)
  }
  if (options?.focus !== undefined) {
    params.push(`focus=${encodeURIComponent(options.focus)}`)
  }
  return params.length === 0
    ? ROUTES.graph
    : `${ROUTES.graph}?${params.join('&')}`
}

/** K1 假名学习路径；`mode=review` 表示复习模式（隐藏字源，直接考）。 */
export function kanaStudyPath(
  groupId: string,
  mode?: 'learn' | 'review',
): string {
  const base = ROUTES.kanaStudy.replace(':groupId', encodeURIComponent(groupId))
  return mode === 'review' ? `${base}?mode=review` : base
}

/** K2 假名测验路径；`groupId` 缺省时按「结业测验」处理（全表抽样）。 */
export function kanaQuizPath(groupId?: string): string {
  return groupId === undefined
    ? ROUTES.kanaQuiz
    : `${ROUTES.kanaQuiz}?group=${encodeURIComponent(groupId)}`
}

/** 从 K2 路径的 `?group=` 参数还原关 id（缺省返回 `null` 表示结业测验）。 */
export function readKanaQuizGroup(search: string): string | null {
  const params = new URLSearchParams(search)
  const groupId = params.get('group')
  return groupId === null || groupId === '' ? null : groupId
}

/** K1 路径的 `?mode=review` 判定。 */
export function readKanaStudyMode(search: string): 'learn' | 'review' {
  return new URLSearchParams(search).get('mode') === 'review'
    ? 'review'
    : 'learn'
}
