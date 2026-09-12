/**
 * 审计取证测试 · 持久化脏数据与「方案 A」落地风险
 *
 * 背景：工程师指出 `src/store/persistence.ts:84-89` 的 `readProgress` 是**零净化**的
 * （只做一次 `isRecord` 就 `as` 直转），而同文件的 `readSession` / `readSettings`
 * 有逐字段回落。他据此推断：
 * - 现状判据 `existing.seen`：脏值 `undefined` → falsy → 走 +1 分支，**fail-open 不崩溃**；
 * - 方案 A `existing.history.length`：`history` 缺失 → **TypeError 抛在 action 内部**，
 *   `set` 不执行，用户看到「点了没反应」。
 *
 * 本文件用**真实持久化链路**（写脏 JSON 进 storage 端口 → `persist.rehydrate()` →
 * 调用真实 action）实测该风险是否存在、可达性如何，并给出两种防御写法的行为差异。
 *
 * 约定：不改 `src/`；`PROBE` 只观测，`VERDICT` 按应有行为断言。
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { storagePort } from '../../src/engine/storage/index.js'
import type { AppState } from '../../src/store/index.js'
import { appStore } from '../../src/store/index.js'
import {
  createInitialSession,
  createInitialSettings,
  migrateState,
  STORE_STORAGE_KEY,
} from '../../src/store/persistence.js'
import type { Progress } from '../../src/types/progress.js'

/** 测试基准时间戳。 */
const NOW = Date.now()

/** 一条**缺 history** 的脏进度（模拟版本迁移 / 存储损坏 / 手改导出 JSON）。 */
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

/** 取全局 store 状态。 */
function read(): AppState {
  return appStore.getState()
}

/** 把给定的持久化载荷写入存储端口（version 可指定，用于走/不走 migrate）。 */
async function seedStorage(
  payload: Record<string, unknown>,
  version: number,
): Promise<void> {
  await storagePort.set(
    STORE_STORAGE_KEY,
    JSON.stringify({ state: payload, version }),
  )
}

/** 组装「progress 脏 + session/settings 脏」的载荷。 */
function dirtyPayload(): Record<string, unknown> {
  return {
    progress: { 'w-01': dirtyProgressWithoutHistory() },
    session: {
      ...createInitialSession(),
      lastStudyDate: 123, // 脏：数字（readString 应回落 ''）
      todayNewCount: 'oops', // 脏：字符串（readNumber 应回落 0）
    },
    settings: { ...createInitialSettings(), rate: 'oops' }, // 脏：字符串
  }
}

beforeEach(async () => {
  read().resetAllProgress()
  await storagePort.remove(STORE_STORAGE_KEY)
})

afterEach(async () => {
  await storagePort.remove(STORE_STORAGE_KEY)
  read().resetAllProgress()
})

describe('AUDIT 持久化 · readProgress 是否逐字段净化', () => {
  it('PROBE+VERDICT · 修复后：migrateState 对 progress 也走 Array.isArray 净化', () => {
    const migrated = migrateState(dirtyPayload())
    const word = migrated.progress['w-01'] as unknown as Progress

    console.log(
      `[AUDIT] migrateState 之后 :: progress.w-01.history=${String(
        (word as { history?: unknown }).history,
      )} | session.todayNewCount=${migrated.session.todayNewCount} ` +
        `| session.lastStudyDate=${JSON.stringify(
          migrated.session.lastStudyDate,
        )} | settings.rate=${migrated.settings.rate}`,
    )

    // control：session / settings 确实被逐字段回落到默认值。
    expect(migrated.session.todayNewCount).toBe(0)
    expect(migrated.session.lastStudyDate).toBe('')
    expect(migrated.settings.rate).toBe(1)

    // 修复后：readProgress 也对每个 progress 补 history=[]。
    // **必须用 Array.isArray**，不能用 truthy 判断（'oops'.length===4 会静默误判）。
    expect(word.history).toEqual([])
  })
})

describe('AUDIT 持久化 · 脏数据能否真的进入 store（可达性）', () => {
  it('PROBE+VERDICT · 路径1：version 匹配（merge 净化生效）', async () => {
    await seedStorage(dirtyPayload(), 1)
    await appStore.persist.rehydrate()

    const word = read().progress['w-01'] as unknown as Progress | undefined
    console.log(
      `[AUDIT] rehydrate(version 匹配) 之后 :: w-01=${JSON.stringify(word)}`,
    )
    expect(word).toBeDefined()
    // 修复后：merge 路径对 progress 分片也走 Array.isArray 净化，history 被补成 []。
    expect(word?.history).toEqual([])
  })

  it('PROBE+VERDICT · 路径2：version 不匹配（走 migrateState 净化）', async () => {
    await seedStorage(dirtyPayload(), 0)
    await appStore.persist.rehydrate()

    const word = read().progress['w-01'] as unknown as Progress | undefined
    console.log(
      `[AUDIT] rehydrate(version 不匹配) 之后 :: w-01=${JSON.stringify(word)}`,
    )
    expect(word).toBeDefined()
    expect(word?.history).toEqual([])
  })
})

describe('AUDIT 持久化 · 两种判据在脏数据上的行为差异', () => {
  /** 造出「store 里 w-01 的 history 缺失」的现场。 */
  async function givenDirtyHistoryInStore(): Promise<void> {
    await seedStorage(dirtyPayload(), 1)
    await appStore.persist.rehydrate()
  }

  it('PROBE+VERDICT · 净化 history 为 [] 后：submitSelfEval 正常推进（证明需补 readProgress 净化）', async () => {
    await seedStorage(
      {
        progress: {
          'w-01': { ...dirtyProgressWithoutHistory(), history: [] }, // 唯一差别：补上 history
        },
        session: createInitialSession(),
        settings: createInitialSettings(),
      },
      1,
    )
    await appStore.persist.rehydrate()

    let threw = false
    try {
      read().submitSelfEval('w-01', '不认识', NOW)
    } catch (error) {
      threw = true
      console.log(`[AUDIT] 净化后仍抛错 :: ${String(error)}`)
    }
    console.log(
      `[AUDIT] 净化 history=[] 之后 :: threw=${threw} ` +
        `state=${read().progress['w-01']?.state} ` +
        `todayNewCount=${read().session.todayNewCount}`,
    )

    // 唯一变量是 history 被净化为 []：不抛、SRS 正常推进。
    expect(threw).toBe(false)
    expect(read().progress['w-01']?.state).toBe('需强化')
  })

  it('PROBE+VERDICT · 修复后：version 匹配时 merge 兜底净化（session/settings 也被清洗）', async () => {
    await seedStorage(dirtyPayload(), 1) // version 与 STORE_VERSION 相同
    await appStore.persist.rehydrate()

    console.log(
      `[AUDIT] rehydrate(version 匹配) :: session.todayNewCount=${JSON.stringify(
        read().session.todayNewCount,
      )} settings.rate=${JSON.stringify(read().settings.rate)}`,
    )

    // 修复后：version 匹配时也走 merge 净化，脏 session/settings 字段被回落到默认值。
    expect(read().session.todayNewCount).toBe(0)
    expect(read().settings.rate).toBe(1)
  })

  it('PROBE+VERDICT · 修复后：方案 A 裸写法在净化后的 history 上不抛', async () => {
    await givenDirtyHistoryInStore()
    const existing = read().progress['w-01'] as unknown as {
      history?: unknown[]
    }

    // 修复后：history 被 merge 净化为 []，方案 A 裸写法 length=0 不会抛。
    let error: unknown = null
    try {
      void existing.history.length
    } catch (caught) {
      error = caught
    }
    console.log(
      `[AUDIT] 修复后 方案A裸写法 :: ${error === null ? '未抛错' : String(error)}`,
    )

    expect(error).toBeNull()
  })

  it('PROBE+VERDICT · 方案 A 防御写法 (history?.length ?? 0)：不抛，且为 0', async () => {
    await givenDirtyHistoryInStore()
    const existing = read().progress['w-01'] as unknown as {
      history?: unknown[]
    }

    let delta = -1
    let threw = false
    try {
      delta = (existing.history?.length ?? 0) === 0 ? 1 : 0
    } catch {
      threw = true
    }
    console.log(`[AUDIT] 方案A防御写法 :: threw=${threw} delta=${delta}`)

    expect(threw).toBe(false)
    // 脏数据下 fail-open：视为「未评估过」→ +1（比崩溃安全）。
    expect(delta).toBe(1)
  })

  it('PROBE+VERDICT · 修复后：history 非数组脏值被 Array.isArray 净化为 []', async () => {
    await seedStorage(
      {
        progress: {
          'w-01': { ...dirtyProgressWithoutHistory(), history: 'oops' },
        },
        session: createInitialSession(),
        settings: createInitialSettings(),
      },
      1,
    )
    await appStore.persist.rehydrate()

    const existing = read().progress['w-01'] as unknown as {
      history?: unknown
    }
    // 修复后：merge 内的 Array.isArray 净化把 'oops' 重置成 [] → length=0 → 走 +1。
    // （裸 length 检查变成"length=4 已评估过"的隐蔽场景已被根除 —— 不再可能。）
    const rawLength = (existing.history as { length?: number })?.length ?? 0
    const delta = rawLength === 0 ? 1 : 0
    console.log(
      `[AUDIT] 修复后 history='oops' :: 净化后 length=${rawLength} → delta=${delta}（正确识别为首次）`,
    )

    expect(existing.history).toEqual([])
    expect(delta).toBe(1)
  })

  it('PROBE+VERDICT · 修复后：脏 history 下 submitSelfEval(认识) 也不抛错并推进', async () => {
    // 验证非「不认识」分支：'认识' 走 `applySelfEval` 的 pushRecord 路径，
    // 净化后 history=[]，pushRecord 展开空数组 → 不抛错、SRS 推进到「已掌握」。
    await seedStorage(
      {
        progress: {
          'w-01': dirtyProgressWithoutHistory(),
        },
        session: createInitialSession(),
        settings: createInitialSettings(),
      },
      1,
    )
    await appStore.persist.rehydrate()

    let threw = false
    try {
      read().submitSelfEval('w-01', '认识', NOW)
    } catch (error) {
      threw = true
      console.log(`[AUDIT] submitSelfEval(认识) 仍抛错 :: ${String(error)}`)
    }
    console.log(
      `[AUDIT] 修复后 submitSelfEval(认识) :: threw=${threw} ` +
        `state=${read().progress['w-01']?.state} ` +
        `todayNewCount=${read().session.todayNewCount}`,
    )

    expect(threw).toBe(false)
    expect(read().progress['w-01']?.state).toBe('已掌握')
    expect(read().session.todayNewCount).toBe(1)
  })

  it('PROBE+VERDICT · 修复后：脏 history 下 markPresented 也不抛错（首次展示）', async () => {
    // 验证 markPresented 入口：applyPresented 不会触碰 history，但 '学习中' 写入流程
    // 仍需保证后续 submitSelfEval 不受脏 history 干扰。
    await seedStorage(
      {
        progress: {
          'w-02': dirtyProgressWithoutHistory(),
        },
        session: createInitialSession(),
        settings: createInitialSettings(),
      },
      1,
    )
    await appStore.persist.rehydrate()

    let threw = false
    try {
      read().markPresented('w-02', NOW)
      read().submitSelfEval('w-02', '认识', NOW)
    } catch (error) {
      threw = true
      console.log(`[AUDIT] markPresented + 自评 仍抛错 :: ${String(error)}`)
    }
    console.log(
      `[AUDIT] 修复后 markPresented + 自评 :: threw=${threw} ` +
        `state=${read().progress['w-02']?.state} ` +
        `history.length=${read().progress['w-02']?.history.length}`,
    )

    expect(threw).toBe(false)
    expect(read().progress['w-02']?.state).toBe('已掌握')
  })
})
