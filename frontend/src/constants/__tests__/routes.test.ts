import { describe, expect, it } from 'vitest'
import {
  matchSidebarAction,
  SIDEBAR_GROUPS,
  type SidebarAction,
} from '../routes.js'
import { STRINGS } from '../strings.js'

/**
 * 侧边栏导航分组与活跃态匹配（T05 新增的纯逻辑）。
 *
 * `matchSidebarAction` 的核心是**最长前缀匹配**——`/kana` 同时是 `/kana/study/:groupId`
 * 与 `/kana/quiz` 的前缀，若按声明顺序取首个命中，K1 / K2 永远不会高亮。
 */

/** 全部动作（用于完整性断言）。 */
const ALL_ACTIONS: SidebarAction[] = SIDEBAR_GROUPS.flatMap((group) =>
  group.items.map((item) => item.action),
)

describe('matchSidebarAction', () => {
  it('首页为精确匹配（`/` 不会命中所有路径）', () => {
    expect(matchSidebarAction('/')).toBe('home')
    expect(matchSidebarAction('/me')).toBe('me')
  })

  it('Tab 路径命中对应动作', () => {
    expect(matchSidebarAction('/stages')).toBe('stages')
    expect(matchSidebarAction('/review')).toBe('review')
    expect(matchSidebarAction('/me')).toBe('me')
  })

  it('二级路径按前缀命中所属一级动作', () => {
    // P5 语法详解 `/grammar/:id` 归到「语法」。
    expect(matchSidebarAction('/grammar')).toBe('grammar')
    expect(matchSidebarAction('/grammar/gr-001')).toBe('grammar')
    // P2 词汇学习 `/study/:moduleId`。
    expect(matchSidebarAction('/study/m-01')).toBe('study')
    expect(matchSidebarAction('/graph')).toBe('graph')
  })

  it('K 域取最长前缀：K1 / K2 会盖过 K0', () => {
    expect(matchSidebarAction('/kana')).toBe('kana')
    expect(matchSidebarAction('/kana/study/g01')).toBe('kanaStudy')
    expect(matchSidebarAction('/kana/quiz')).toBe('kanaQuiz')
    expect(matchSidebarAction('/kana/quiz?group=g01')).toBe('kanaQuiz')
  })

  it('未收录的路径返回 null（不高亮任何项）', () => {
    expect(matchSidebarAction('/vocab/w-001')).toBeNull()
    expect(matchSidebarAction('/nope')).toBeNull()
  })
})

describe('SIDEBAR_GROUPS', () => {
  it('动作不重复（重复会让高亮与折叠态互相打架）', () => {
    expect(new Set(ALL_ACTIONS).size).toBe(ALL_ACTIONS.length)
  })

  it('每个动作都有中文文案（禁硬编码）', () => {
    for (const action of ALL_ACTIONS) {
      expect(STRINGS.sidebar[action]).toBeTruthy()
    }
  })

  it('仅 K 域分组可折叠', () => {
    const collapsible = SIDEBAR_GROUPS.filter((group) => group.collapsible).map(
      (group) => group.key,
    )
    expect(collapsible).toEqual(['kana'])
  })
})
