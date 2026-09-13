import type { GraphMode } from '../types/graph.js'
import type { IconName } from './icons.js'

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
  /** 图标名；用 `IconName` 而非 `string`，拼错在 `tsc` 阶段即报错。 */
  icon: IconName
}

/**
 * 底部 5 个 Tab：首页 / 阶段 / 语法 / 复习 / 我的。
 * TabBar 不占独立路由层，由 App 外壳依据 `isTabPath(location.pathname)` 决定是否渲染。
 */
export const TABS: TabDefinition[] = [
  { path: ROUTES.home, label: '首页', icon: 'home' },
  { path: ROUTES.stages, label: '阶段', icon: 'stages' },
  { path: ROUTES.grammar, label: '语法', icon: 'book' },
  { path: ROUTES.review, label: '复习', icon: 'review' },
  { path: ROUTES.me, label: '我的', icon: 'settings' },
]

/** 5 个 Tab 路径（唯一来源）。 */
export const TAB_PATHS: string[] = TABS.map((tab) => tab.path)

/* ------------------------------------------------------------------ *
 * PC 侧边栏导航分组（T05）
 *
 * 只描述**结构与路径前缀**；中文文案在 `constants/strings.ts` 的
 * `STRINGS.sidebar`，跳转动作在 `components/Sidebar`（走 `useNavigation()`）。
 * ------------------------------------------------------------------ */

/** 侧边栏导航动作（与 `STRINGS.sidebar` 的键一一对应）。 */
export type SidebarAction =
  | 'home'
  | 'study'
  | 'stages'
  | 'review'
  | 'grammar'
  | 'graph'
  | 'me'
  | 'kana'
  | 'kanaStudy'
  | 'kanaQuiz'

/** 侧边栏条目。 */
export interface SidebarItem {
  /** 导航动作（决定文案与跳转）。 */
  action: SidebarAction
  /** 图标名（`components/Icon` 的 18 个品牌图标之一）；用 `IconName` 而非 `string`，拼错在 `tsc` 阶段即报错。 */
  icon: IconName
  /** 活跃态判定的**路径前缀**（取最长匹配，见 `matchSidebarAction`）。 */
  match: string
}

/** 侧边栏分组。 */
export interface SidebarGroup {
  /** 分组标识（折叠状态与分组标题的键）。 */
  key: string
  /** 是否可折叠（K 域为可折叠的次级分组）。 */
  collapsible: boolean
  items: SidebarItem[]
}

/**
 * 侧边栏分组结构（顺序即展示顺序）。
 *
 * 主分组 7 项 + K 域可折叠分组 3 项（K0 / K1 / K2）。
 */
export const SIDEBAR_GROUPS: SidebarGroup[] = [
  {
    key: 'main',
    collapsible: false,
    items: [
      { action: 'home', icon: 'home', match: ROUTES.home },
      { action: 'study', icon: 'study', match: '/study' },
      { action: 'stages', icon: 'stages', match: ROUTES.stages },
      { action: 'review', icon: 'review', match: ROUTES.review },
      { action: 'grammar', icon: 'book', match: ROUTES.grammar },
      { action: 'graph', icon: 'graph', match: ROUTES.graph },
      { action: 'me', icon: 'settings', match: ROUTES.me },
    ],
  },
  {
    key: 'kana',
    collapsible: true,
    items: [
      { action: 'kana', icon: 'star', match: ROUTES.kana },
      { action: 'kanaStudy', icon: 'study', match: '/kana/study' },
      { action: 'kanaQuiz', icon: 'check', match: ROUTES.kanaQuiz },
    ],
  },
]

/** 路径前缀是否命中（`/` 为精确匹配，其余为「等于或以 `prefix/` 开头」）。 */
function isSidebarMatch(prefix: string, pathname: string): boolean {
  if (prefix === ROUTES.home) {
    return pathname === prefix
  }
  return pathname === prefix || pathname.startsWith(`${prefix}/`)
}

/**
 * 当前路径命中的侧边栏动作。
 *
 * **取最长前缀**：`/kana` 同时是 `/kana/study/:groupId` 与 `/kana/quiz` 的前缀，
 * 最长匹配才能让 K1 / K2 正确高亮（而非永远高亮 K0）。无命中返回 `null`。
 */
export function matchSidebarAction(pathname: string): SidebarAction | null {
  // 容差：只吃 path 部分（调用方传的是 `useLocation().pathname`，本身不含
  // `?query#hash`；若误传整条 URL 也不会让匹配全部落空）。
  const path = pathname.split(/[?#]/)[0] ?? pathname
  let best: SidebarItem | null = null
  for (const group of SIDEBAR_GROUPS) {
    for (const item of group.items) {
      if (!isSidebarMatch(item.match, path)) {
        continue
      }
      if (best === null || item.match.length > best.match.length) {
        best = item
      }
    }
  }
  return best === null ? null : best.action
}

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
