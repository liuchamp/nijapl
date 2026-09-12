import { beforeEach, describe, expect, it } from 'vitest'
import { isKanaProgressKey, kanaProgressKey } from '../../constants/kana.js'
import { repository } from '../../data/index.js'
import { appActions } from '../hooks.js'
import type { AppState } from '../index.js'
import { appStore } from '../index.js'
import {
  selectKanaDueQueue,
  selectKanaGateActive,
  selectKanaGroupProgress,
  selectKanaMasteredCount,
  selectKanaNextGroup,
  selectKanaNodeState,
  selectKanaOverallCompletion,
  selectKanaUnlocked,
  selectKanaWeak,
  selectOverallCompletion,
  selectStageCompletion,
  selectTodayReviewQueue,
  selectTodayStats,
  selectWeakWords,
} from '../selectors.js'

/**
 * K 域进度隔离回归（设计 §12 验收项 A2）。
 *
 * 这条用例是**设计 §6.1 的核心承诺**：假名进度不污染 N3 阶段完成度、解锁率、错词本。
 *
 * 隔离机制不是"加了 if 判断"，而是**利用了既有实现的遍历边界**：
 * - `stageCompletion` / `overallCompletion` 只遍历 `words`；
 * - `selectWeakWords` 只遍历 `repository.getAllWords()`；
 * - `selectTodayReviewQueue` 用 `getWordById(targetId)` 反查，`kana:` key 天然返回 undefined。
 *
 * 因此本用例一旦失败，说明有人"顺手"改了 W 域遍历口径 —— 那是必须立即发现的回归。
 */

const NOW = Date.now()

function read(): AppState {
  return appStore.getState()
}

/** W 域快照：四个不受 K 域影响的量。 */
function snapshotWordSide() {
  const state = read()
  return {
    stageS1: selectStageCompletion(state, 's1'),
    stageS2: selectStageCompletion(state, 's2'),
    overall: selectOverallCompletion(state),
    weak: selectWeakWords(state).map((word) => word.id),
    due: selectTodayReviewQueue(state, NOW).map((word) => word.id),
  }
}

beforeEach(() => {
  read().resetAllProgress()
  // 全局单例 store 在用例间共享：显式把两个开关复位到默认值，
  // 否则「关闭门控」用例会把 `kanaGateEnabled=false` 泄漏给后续用例
  // （表现为 g06 意外解锁）。
  read().updateSettings({ kanaGateEnabled: true, unlockRuleEnabled: true })
})

describe('K 域 · 进度隔离（A2）', () => {
  it('VERDICT · 写入假名进度后，W 域四项指标逐位不变', () => {
    // 先在 W 域制造一点真实进度（走公开 action，不直接 setState）
    const moduleWords = repository.getModuleWords('m01')
    appActions.startStudy('m01', NOW)
    for (const word of moduleWords.slice(0, 3)) {
      appActions.markPresented(word.id, NOW)
      appActions.submitSelfEval(word.id, '不认识', NOW)
    }
    const before = snapshotWordSide()
    expect(before.weak.length).toBeGreaterThan(0)

    // 再写入一批「需强化」的假名进度 —— 若隔离被破坏，它们会混进 W 域错词本
    appActions.startKanaGroup('g01', NOW)
    for (const kana of repository.getKanaByGroup('g01')) {
      const targetId = kanaProgressKey(kana.id)
      appActions.markPresented(targetId, NOW)
      appActions.submitSelfEval(targetId, '不认识', NOW)
    }

    const after = snapshotWordSide()
    expect(after).toEqual(before)
  })

  it('VERDICT · 假名进度 key 全部带 kana: 前缀，且不与词条 id 冲突', () => {
    appActions.startKanaGroup('g01', NOW)
    for (const kana of repository.getKanaByGroup('g01')) {
      appActions.markPresented(kanaProgressKey(kana.id), NOW)
    }
    const marked = Object.keys(read().progress).filter((key) =>
      isKanaProgressKey(key),
    )
    expect(marked).toHaveLength(repository.getKanaByGroup('g01').length)
    for (const key of marked) {
      // 前缀既保证「W 域反查不到」，也保证「K 域能反查到」
      expect(repository.getWordById(key)).toBeUndefined()
      expect(repository.getKanaById(key.slice('kana:'.length))).toBeDefined()
    }
  })

  it('VERDICT · 假名到期项只进 K 域队列，不进词条队列', () => {
    const group = repository.getKanaGroupById('g01')!
    appActions.startKanaGroup('g01', NOW)
    for (const kana of repository.getKanaByGroup('g01')) {
      appActions.markPresented(kanaProgressKey(kana.id), NOW)
      // 「认识」→ 间隔进入第 1 档（10 分钟），可用远期时间戳判到期
    }
    for (const kana of repository.getKanaByGroup('g01')) {
      appActions.submitSelfEval(kanaProgressKey(kana.id), '认识', NOW)
    }
    const future = NOW + 60 * 60 * 1000
    const kanaDue = selectKanaDueQueue(read(), future)
    const wordDue = selectTodayReviewQueue(read(), future)
    expect(kanaDue).toHaveLength(group.kanaIds.length)
    expect(wordDue).toHaveLength(0)
    for (const item of kanaDue) {
      expect(group.kanaIds).toContain(item.id)
    }
  })

  it('VERDICT · 错音本只收假名，W 域错词本保持为空', () => {
    const state = read()
    expect(selectKanaWeak(state)).toHaveLength(0)
    appActions.startKanaGroup('g01', NOW)
    for (const kana of repository.getKanaByGroup('g01').slice(0, 2)) {
      const targetId = kanaProgressKey(kana.id)
      appActions.markPresented(targetId, NOW)
      appActions.submitSelfEval(targetId, '不认识', NOW)
    }
    const next = read()
    // wrongCount 相同 → 按 id 升序
    expect(selectKanaWeak(next).map((item) => item.id)).toEqual(['a', 'i'])
    expect(selectWeakWords(next)).toHaveLength(0)
  })

  it('VERDICT · resetKanaProgress 只清 K 域，不动 W 域进度', () => {
    const moduleWords = repository.getModuleWords('m01')
    appActions.startStudy('m01', NOW)
    appActions.markPresented(moduleWords[0].id, NOW)
    appActions.submitSelfEval(moduleWords[0].id, '认识', NOW)

    appActions.startKanaGroup('g01', NOW)
    for (const kana of repository.getKanaByGroup('g01').slice(0, 3)) {
      appActions.markPresented(kanaProgressKey(kana.id), NOW)
      appActions.submitSelfEval(kanaProgressKey(kana.id), '认识', NOW)
    }
    expect(selectKanaOverallCompletion(read())).toBeGreaterThan(0)
    const wordState = read().progress[moduleWords[0].id]

    appActions.resetKanaProgress()

    expect(selectKanaOverallCompletion(read())).toBe(0)
    expect(
      Object.keys(read().progress).filter((key) => isKanaProgressKey(key)),
    ).toHaveLength(0)
    expect(read().progress[moduleWords[0].id]).toEqual(wordState)
    expect(read().session.kanaGroupId).toBe('')
  })
})

describe('K 域 · 续学与门控', () => {
  it('VERDICT · 断点续学：同关回来自上次音序，换关从头', () => {
    appActions.startKanaGroup('g01', NOW)
    appActions.setKanaIndex(4, NOW)
    expect(read().session.lastKanaIndex).toBe(4)

    appActions.startKanaGroup('g01', NOW)
    expect(read().runtime.kanaIndex).toBe(4)

    appActions.startKanaGroup('g02', NOW)
    expect(read().runtime.kanaIndex).toBe(0)
  })

  it('VERDICT · 关内翻页循环取模（末张的下一张回首张）', () => {
    const size = repository.getKanaByGroup('g01').length
    appActions.startKanaGroup('g01', NOW)
    appActions.setKanaIndex(size, NOW)
    expect(read().runtime.kanaIndex).toBe(0)
    appActions.setKanaIndex(-1, NOW)
    expect(read().runtime.kanaIndex).toBe(size - 1)
  })

  it('VERDICT · 门控默认开且未达标时生效；关闭后解除', () => {
    expect(read().settings.kanaGateEnabled).toBe(true)
    expect(selectKanaGateActive(read())).toBe(true)

    appActions.toggleKanaGate()
    expect(selectKanaGateActive(read())).toBe(false)
  })

  it('VERDICT · 清音 5 关达标后门控自动放行（不需要用户手动关）', () => {
    for (const group of repository
      .getKanaGroups()
      .filter((item) => item.voiceType === '清音')) {
      // 每关前 80% 置「已掌握」即可满足解锁阈值
      const ids = group.kanaIds.slice(0, Math.ceil(group.kanaIds.length * 0.8))
      for (const id of ids) {
        appActions.markPresented(kanaProgressKey(id), NOW)
        appActions.submitSelfEval(kanaProgressKey(id), '认识', NOW)
      }
    }
    const state = read()
    expect(selectKanaGateActive(state)).toBe(false)
    // 浊音关此时应已解锁（前置 g01 达标）
    expect(selectKanaUnlocked(state, 'g06')).toBe(true)
    expect(selectKanaGroupProgress(state, 'g06').total).toBe(10)
  })

  it('VERDICT · 清音第一关默认解锁，浊音第一关默认锁定', () => {
    const state = read()
    expect(selectKanaUnlocked(state, 'g01')).toBe(true)
    expect(selectKanaUnlocked(state, 'g06')).toBe(false)
    expect(selectKanaUnlocked(state, 'g09')).toBe(false)
  })
})

/**
 * K 域 · 每日配额隔离。
 *
 * 这是「隔离是免费的」这句话的**边界**：完成度 / 错词本 / 到期队列靠遍历边界天然隔离，
 * 但 `todayNewCount` / `todayReviewCount` 是**计数器**——只要复用同一个写入口就会被 +1。
 *
 * 因此 `store/actions.ts` 里显式加了 `isKanaProgressKey(targetId)` 判断。
 * 本组用例钉死这条判断：一旦被「顺手简化」掉，首页「今日新词 n/20」会被
 * 104 个假名瞬间刷满，表现为「什么都没学但今日任务显示已完成」。
 */
describe('K 域 · 每日配额隔离', () => {
  it('VERDICT · 假名自评不占「今日新词」，词条自评照常 +1', () => {
    const words = repository.getModuleWords('m01')
    appActions.startStudy('m01', NOW)
    appActions.markPresented(words[0].id, NOW)
    appActions.submitSelfEval(words[0].id, '认识', NOW)
    expect(read().session.todayNewCount).toBe(1)

    appActions.startKanaGroup('g01', NOW)
    for (const kana of repository.getKanaByGroup('g01')) {
      const targetId = kanaProgressKey(kana.id)
      appActions.markPresented(targetId, NOW)
      appActions.submitSelfEval(targetId, '认识', NOW)
    }

    // 10 个假名都是「首次自评」，但一个都不该计入词条配额。
    expect(read().session.todayNewCount).toBe(1)
  })

  it('VERDICT · 假名测验不占「今日复习」，但假名进度确实写进去了', () => {
    const words = repository.getModuleWords('m01')
    appActions.submitReviewResult(words[0].id, true, NOW)
    expect(read().session.todayReviewCount).toBe(1)

    for (const kana of repository.getKanaByGroup('g01').slice(0, 3)) {
      appActions.submitReviewResult(kanaProgressKey(kana.id), false, NOW)
    }

    expect(read().session.todayReviewCount).toBe(1)
    // 反向断言：隔离不等于「没写」。答错的假名必须进错音本。
    expect(selectKanaWeak(read()).map((item) => item.id)).toEqual([
      'a',
      'i',
      'u',
    ])
  })

  it('VERDICT · 首页今日到期数不受假名到期影响', () => {
    appActions.startKanaGroup('g01', NOW)
    for (const kana of repository.getKanaByGroup('g01')) {
      const targetId = kanaProgressKey(kana.id)
      appActions.markPresented(targetId, NOW)
      appActions.submitSelfEval(targetId, '认识', NOW)
    }
    // 「认识」→ 间隔 10 分钟；1 小时后假名到期，但词条队列必须仍为空。
    const future = NOW + 60 * 60 * 1000
    expect(selectKanaDueQueue(read(), future)).toHaveLength(10)
    expect(selectTodayStats(read(), future).dueCount).toBe(0)
  })
})

/**
 * K 域 · 错音计数隔离。
 *
 * 与配额隔离同源，但**方向相反**：配额是「K 域别占 W 域的名额」，
 * 这里还要保证「W 域的会话错音别被 K 域顺手清零」。
 *
 * 历史实现是「进关时把共享的 `sessionWrongCount` 清零」，代价是
 * 「词条 → 假名 → 词条」中途串门的用户会丢掉已累计的会话错音，
 * 回到词条后 J2（≥2 次提示详解）失准。现在按域分流到
 * `sessionWrongCount`（W，J2）与 `kanaSessionWrongCount`（K，仅 K1 展示）。
 */
describe('K 域 · 错音计数隔离', () => {
  it('VERDICT · 假名错音只进 K 域计数器，不累加词条 J2 依据', () => {
    const words = repository.getModuleWords('m01')
    appActions.startStudy('m01', NOW)
    appActions.markPresented(words[0].id, NOW)
    appActions.submitSelfEval(words[0].id, '不认识', NOW)
    expect(read().runtime.sessionWrongCount).toBe(1)

    appActions.startKanaGroup('g01', NOW)
    for (const kana of repository.getKanaByGroup('g01').slice(0, 3)) {
      const targetId = kanaProgressKey(kana.id)
      appActions.markPresented(targetId, NOW)
      appActions.submitSelfEval(targetId, '不认识', NOW)
    }

    // 3 次假名错音全进 K 域计数器 —— K1「本关错音」显示的正是它。
    expect(read().runtime.kanaSessionWrongCount).toBe(3)
    // 词条侧计数**分毫未动**：假名不参与 J2，也就不该污染 J2 的输入。
    expect(read().runtime.sessionWrongCount).toBe(1)
  })

  it('VERDICT · 进 K 域不清零词条会话错音（W→K 串门不丢 J2 信号）', () => {
    const words = repository.getModuleWords('m01')
    appActions.startStudy('m01', NOW)
    for (const word of words.slice(0, 2)) {
      appActions.markPresented(word.id, NOW)
      appActions.submitSelfEval(word.id, '模糊', NOW)
    }
    expect(read().runtime.sessionWrongCount).toBe(2)

    // 中途拐去学假名：W 域计数必须原样保留（这正是旧实现破坏的那一点）。
    appActions.startKanaGroup('g01', NOW)
    expect(read().runtime.sessionWrongCount).toBe(2)
    // K 域计数器独立从 0 开始，不受 W 域既有值影响。
    expect(read().runtime.kanaSessionWrongCount).toBe(0)
  })

  it('VERDICT · 重新进关清零 K 域计数、不动 W 域计数；resetKanaProgress 只清 K 域', () => {
    const words = repository.getModuleWords('m01')
    appActions.startStudy('m01', NOW)
    appActions.markPresented(words[0].id, NOW)
    appActions.submitSelfEval(words[0].id, '不认识', NOW)

    appActions.startKanaGroup('g01', NOW)
    const kana = repository.getKanaByGroup('g01')[0]
    appActions.markPresented(kanaProgressKey(kana.id), NOW)
    appActions.submitSelfEval(kanaProgressKey(kana.id), '不认识', NOW)
    expect(read().runtime.kanaSessionWrongCount).toBe(1)

    // 重新进关：K 域计数归零（每关独立计数），W 域计数不受牵连。
    appActions.startKanaGroup('g01', NOW)
    expect(read().runtime.kanaSessionWrongCount).toBe(0)
    expect(read().runtime.sessionWrongCount).toBe(1)

    // resetKanaProgress 是 K 域重置入口，同样只清 K 域计数器。
    appActions.resetKanaProgress()
    expect(read().runtime.kanaSessionWrongCount).toBe(0)
    expect(read().runtime.sessionWrongCount).toBe(1)
  })
})

describe('K 域 · 派生统计', () => {
  it('VERDICT · selectKanaMasteredCount 与总体完成度、树顶节点态同向', () => {
    const empty = read()
    expect(selectKanaMasteredCount(empty)).toBe(0)
    expect(selectKanaNodeState(empty)).toBe('未学')

    const members = repository.getKanaByGroup('g01')
    for (const item of members) {
      appActions.markPresented(kanaProgressKey(item.id), NOW)
      appActions.submitSelfEval(kanaProgressKey(item.id), '认识', NOW)
    }

    const state = read()
    expect(selectKanaMasteredCount(state)).toBe(members.length)
    expect(selectKanaOverallCompletion(state)).toBeGreaterThan(0)
    // 只有一关达标、其余 11 关未学 → 不可能是「已掌握」的绿色，也不该被判为未学。
    expect(selectKanaNodeState(state)).toBe('学习中')
  })

  it('VERDICT · 「继续下一关」跳过当前关，并落在首个未掌握音上', () => {
    /** 把某关前 `count` 个音标记为已掌握。 */
    function master(groupId: string, count: number): void {
      for (const item of repository.getKanaByGroup(groupId).slice(0, count)) {
        appActions.markPresented(kanaProgressKey(item.id), NOW)
        appActions.submitSelfEval(kanaProgressKey(item.id), '认识', NOW)
      }
    }

    // g01 全掌握 → g02 解锁
    master('g01', repository.getKanaByGroup('g01').length)
    const first = selectKanaNextGroup(read(), 'g01')
    expect(first?.groupId).toBe('g02')
    expect(first?.index).toBe(0)

    // g02 只学 3 个 → 续学点应落在第 4 个（下标 3），不是回到 0
    master('g02', 3)
    const second = selectKanaNextGroup(read(), 'g01')
    expect(second?.groupId).toBe('g02')
    expect(second?.index).toBe(3)

    // 从 g02 出发时**不能**再返回 g02（否则「继续下一关」点了像没反应）
    expect(selectKanaNextGroup(read(), 'g02')?.groupId).not.toBe('g02')
  })
})
