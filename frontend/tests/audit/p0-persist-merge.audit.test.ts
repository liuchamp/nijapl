/**
 * 审计取证测试 · 净化落点（migrate vs merge）与崩溃面普查
 *
 * 背景：工程师指出 —— 把 `history` 净化补进 `readProgress`（即 `migrateState`）**覆盖不到**
 * 「version 一致」的持久化路径，因为 zustand persist 只在 version 不一致时调用 `migrate`，
 * 版本一致时直返原始 state。他建议把净化挂到 `merge`（每次 rehydrate 都执行）。
 *
 * 本文件用**一个测试内自建的探针 store**（复用项目真实的 `createPersistOptions`，
 * 只覆盖 `name` / `migrate` / `merge` 并埋计数器）实测：
 * 1. `merge` 是否在 storage 为空时以 `undefined` 被调用（决定守卫是否必要）；
 * 2. version 一致时 `migrate` 是否真的不执行、`merge` 是否拿到未净化的原始数据；
 * 3. version 不一致时 `migrate` 是否执行；
 * 4. 逐入口普查脏 `history` 的首个崩溃点与 V8 错误消息（验证工程师的崩溃面表格）。
 *
 * **不改 `src/` 任何源码。**
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { persist } from 'zustand/middleware'
import { createStore } from 'zustand/vanilla'

import { storagePort } from '../../src/engine/storage/index.js'
import type { AppState } from '../../src/store/index.js'
import { appStore } from '../../src/store/index.js'
import {
  createInitialSession,
  createInitialSettings,
  createPersistOptions,
  migrateState,
} from '../../src/store/persistence.js'

/** 测试基准时间戳。 */
const NOW = Date.now()

/** 探针 store 的存储键（与真实 store 隔离）。 */
const PROBE_KEY = 'audit.probe.store'

/** 探针 store 的状态形状。 */
type ProbeState = { a: number } & Record<string, unknown>

/** 埋点计数器。 */
interface Spies {
  migrate: number
  merge: unknown[]
}

/** 清零埋点。 */
function resetSpies(spies: Spies): void {
  spies.migrate = 0
  spies.merge = []
}

/**
 * 建探针 store 并**排空创建时的那次异步 hydrate**，再清零埋点。
 *
 * `persist` 在 store 创建时就会异步 hydrate 一次；若不清空直接计数，
 * 会把那一次算进来（实测表现为 merge 计数 = 2，且首元素是 `undefined`）。
 */
async function freshProbe(spies: Spies) {
  const probe = makeProbeStore(spies)
  await probe.persist.rehydrate() // 排空创建时那次
  resetSpies(spies)
  return probe
}

/** 一条缺 history 的脏进度。 */
function dirtyProgressWithoutHistory(): Record<string, unknown> {
  return {
    targetId: 'w-01',
    state: '学习中',
    wrongCount: 0,
    nextReview: 0,
    intervalLevel: 0,
    seen: true,
    // 故意省略 history
  }
}

/** 含三个分片脏值的持久化载荷。 */
function dirtyPayload(): Record<string, unknown> {
  return {
    progress: { 'w-01': dirtyProgressWithoutHistory() },
    session: { ...createInitialSession(), todayNewCount: 'oops' },
    settings: { ...createInitialSettings(), rate: 'oops' },
  }
}

/**
 * 建一个复用项目真实 persist 选项、但埋了 migrate/merge 计数器的探针 store。
 *
 * 注意：`persist` 在 **store 创建时就会 hydrate 一次**，因此埋点必须在创建后清零，
 * 否则会把「创建时那一次」算进来（实测表现为 merge 计数 = 2、首元素是 undefined）。
 */
function makeProbeStore(spies: Spies) {
  const options = createPersistOptions()
  return createStore<ProbeState>()(
    persist(() => ({ a: 1, setHydrated: () => undefined }), {
      ...options,
      name: PROBE_KEY,
      migrate: (persisted: unknown) => {
        spies.migrate += 1
        return migrateState(persisted) as unknown as ProbeState
      },
      merge: (persisted: unknown, current: ProbeState) => {
        spies.merge.push(persisted)
        if (persisted === undefined) {
          return current // 守卫：存储为空时不能拿默认值覆盖 current
        }
        return { ...current, ...migrateState(persisted) } as ProbeState
      },
    }),
  )
}

/** 把载荷写入探针键（version 可指定）。 */
async function seedProbeStorage(
  payload: Record<string, unknown>,
  version: number,
): Promise<void> {
  await storagePort.set(PROBE_KEY, JSON.stringify({ state: payload, version }))
}

/** 造出「真实 store 里 w-01 / G001 的 history 缺失」的现场。 */
async function givenDirtyInRealStore(targetId = 'w-01'): Promise<void> {
  await storagePort.set(
    'nijapl.store',
    JSON.stringify({
      state: {
        progress: {
          [targetId]: { ...dirtyProgressWithoutHistory(), targetId },
        },
        session: createInitialSession(),
        settings: createInitialSettings(),
      },
      version: 1,
    }),
  )
  await appStore.persist.rehydrate()
}

/** 取全局 store 状态。 */
function read(): AppState {
  return appStore.getState()
}

/** 执行动作并捕获是否抛错 + 错误消息。 */
function capture(action: () => void): { threw: boolean; message: string } {
  try {
    action()
    return { threw: false, message: '' }
  } catch (error) {
    return { threw: true, message: String(error) }
  }
}

beforeEach(async () => {
  read().resetAllProgress()
  await storagePort.remove('nijapl.store')
  await storagePort.remove(PROBE_KEY)
})

afterEach(async () => {
  await storagePort.remove('nijapl.store')
  await storagePort.remove(PROBE_KEY)
  read().resetAllProgress()
})

describe('AUDIT 净化落点 · zustand persist 的 migrate / merge 调用时机', () => {
  it('PROBE+VERDICT · 存储为空时 merge 仍被调用且入参为 undefined（守卫必要）', async () => {
    const spies: Spies = { migrate: 0, merge: [] }
    const probe = await freshProbe(spies)

    await storagePort.remove(PROBE_KEY)
    await probe.persist.rehydrate()

    console.log(
      `[AUDIT] 空存储 rehydrate :: merge 调用 ${spies.merge.length} 次，` +
        `入参=${String(spies.merge.at(-1))} | migrate 调用 ${spies.migrate} 次`,
    )

    // 关键：即使没有持久化数据，merge 依然会被调用一次，且 persisted === undefined。
    expect(spies.merge.length).toBe(1)
    expect(spies.merge.at(-1)).toBeUndefined()
    // 没有守卫的话 migrateState(undefined) 会返回全默认值，覆盖掉 current。
    expect(migrateState(undefined).progress).toEqual({})
    expect(probe.getState().a).toBe(1)
  })

  it('PROBE+VERDICT · version 一致：migrate 不执行，merge 拿到未净化的原始数据', async () => {
    const spies: Spies = { migrate: 0, merge: [] }
    const probe = await freshProbe(spies)
    await seedProbeStorage(dirtyPayload(), 1)
    await probe.persist.rehydrate()

    const raw = spies.merge.at(-1) as Record<string, unknown> | undefined
    const rawSession = raw?.session as { todayNewCount?: unknown } | undefined
    console.log(
      `[AUDIT] version 一致 :: migrate=${spies.migrate} 次 | merge 收到 ` +
        `session.todayNewCount=${JSON.stringify(rawSession?.todayNewCount)}（未净化即为原始脏值）`,
    )

    // 证实工程师的判断：版本一致 → migrate 一次都不跑 → readProgress/readSession 的净化全部落空。
    expect(spies.migrate).toBe(0)
    expect(rawSession?.todayNewCount).toBe('oops')

    // 而 merge 每次都跑，这才是能覆盖全路径的落点。
    expect(spies.merge.length).toBe(1)
  })

  it('PROBE+VERDICT · version 不一致：migrate 执行（净化仅在该路径生效）', async () => {
    const spies: Spies = { migrate: 0, merge: [] }
    const probe = await freshProbe(spies)
    await seedProbeStorage(dirtyPayload(), 0)
    await probe.persist.rehydrate()

    console.log(
      `[AUDIT] version 不一致 :: migrate=${spies.migrate} 次 | merge=${spies.merge.length} 次`,
    )
    expect(spies.migrate).toBe(1)
    // merge 同样会跑（收到的是 migrate 的返回值）。
    expect(spies.merge.length).toBe(1)
  })

  it('PROBE+VERDICT · 修复后：版本一致路径下，merge 把 progress 分片净化（history 补 []）', async () => {
    await givenDirtyInRealStore('w-01')
    const word = read().progress['w-01'] as unknown as {
      history?: unknown
    }
    console.log(
      `[AUDIT] 真实 store(version 一致) :: w-01.history=${String(word?.history)}`,
    )
    // 修复后：merge 在每次 rehydrate 都调 migrateState，readProgress 用 Array.isArray 净化 history。
    expect(word?.history).toEqual([])
  })
})

describe('AUDIT 崩溃面 · 脏 history 在各入口的首个崩溃点', () => {
  it('PROBE · 修复后：合并净化使各入口不再抛错', async () => {
    const results: string[] = []

    await givenDirtyInRealStore('w-01')
    const unknown = capture(() => read().submitSelfEval('w-01', '不认识', NOW))
    results.push(
      `submitSelfEval(不认识): threw=${unknown.threw} ${unknown.message}`,
    )

    await givenDirtyInRealStore('w-01')
    const known = capture(() => read().submitSelfEval('w-01', '认识', NOW))
    results.push(`submitSelfEval(认识): threw=${known.threw} ${known.message}`)

    await givenDirtyInRealStore('G001')
    const grammar = capture(() =>
      read().submitGrammarSelfEval('G001', '不认识', NOW),
    )
    results.push(
      `submitGrammarSelfEval: threw=${grammar.threw} ${grammar.message}`,
    )

    await givenDirtyInRealStore('w-01')
    const review = capture(() => read().submitReviewResult('w-01', true, NOW))
    results.push(`submitReviewResult: threw=${review.threw} ${review.message}`)

    await givenDirtyInRealStore('w-01')
    const skip = capture(() => read().skipWord('w-01', NOW))
    results.push(`skipWord: threw=${skip.threw} ${skip.message}`)

    for (const line of results) {
      console.log(`[AUDIT-CRASH] ${line}`)
    }

    // 修复后：merge 兜底把 history 净化成 []，各入口不再抛错；
    // skipWord 本就只透传 history，是唯一始终不抛的入口。
    expect(unknown.threw).toBe(false)
    expect(known.threw).toBe(false)
    expect(grammar.threw).toBe(false)
    expect(review.threw).toBe(false)
    expect(skip.threw).toBe(false)
  })

  it('VERDICT · 回归锁：脏 history 下 submitSelfEval 不应抛错，且 SRS 应正常推进', async () => {
    await givenDirtyInRealStore('w-01')

    const outcome = capture(() => read().submitSelfEval('w-01', '不认识', NOW))
    console.log(
      `[AUDIT] 回归锁 :: threw=${outcome.threw} ${outcome.message} ` +
        `| state=${read().progress['w-01']?.state}`,
    )

    // 期望（修复后）：不抛错 + 状态推进到「需强化」。
    // 现状：抛 TypeError 且状态停在「学习中」（自评完全失效）—— 故本条当前为红。
    expect(outcome.threw).toBe(false)
    expect(read().progress['w-01']?.state).toBe('需强化')
  })
})
