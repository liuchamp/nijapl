import type { PersistOptions, StateStorage } from 'zustand/middleware'
import { createJSONStorage } from 'zustand/middleware'
import { storagePort } from '../engine/storage/index.js'
import type { Progress, Session, StudySettings } from '../types/progress.js'
import type { AppState } from './index.js'

/**
 * 持久化装配（架构 §1.3 / §2.6）。
 *
 * - `portableStorage` 把 zustand `persist` 的 `StateStorage` 桥到 `StoragePort`，
 *   **不使用** persist 默认的 `localStorage`（Lynx 无该 API）；
 * - `version` + `migrate` 负责版本迁移；`partialize` 只持久化
 *   `progress` / `session` / `settings`，**不**持久化 `runtime`；
 * - `onRehydrateStorage` 在恢复完成（或失败）后置 `hydrated=true` 解除门控。
 */

/** 持久化键名（唯一）。 */
export const STORE_STORAGE_KEY = 'nijapl.store'

/** 持久化 schema 版本；结构破坏性变更时递增并补 `migrate` 分支。 */
export const STORE_VERSION = 1

/** zustand ↔ StoragePort 适配器（异步；端口永不 throw，因此适配器同样不会 reject）。 */
export const portableStorage: StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    const value = await storagePort.get(name)
    return value ?? null
  },
  setItem: async (name: string, value: string): Promise<void> => {
    await storagePort.set(name, value)
  },
  removeItem: async (name: string): Promise<void> => {
    await storagePort.remove(name)
  },
}

/** 被持久化的状态子集（不含 runtime）。 */
export interface PersistedState {
  progress: Record<string, Progress>
  session: Session
  settings: StudySettings
}

/** 默认学习设置。 */
export function createInitialSettings(): StudySettings {
  return {
    rate: 1,
    pitch: 1,
    autoSpeakOnCard: true,
    unlockRuleEnabled: true,
    // 设计 §13 Q1 拍板：默认**开**（零基础用户不被 N5 词汇拦住），P9 可关。
    kanaGateEnabled: true,
  }
}

/** 默认会话快照（模块 / 阶段在 `startStudy` 时写入，K 域在 `startKanaGroup` 时写入）。 */
export function createInitialSession(): Session {
  return {
    stageId: '',
    moduleId: '',
    lastWordIndex: 0,
    kanaGroupId: '',
    lastKanaIndex: 0,
    lastStudyDate: '',
    todayNewCount: 0,
    todayReviewCount: 0,
    todayGrammarCount: 0,
    streakDays: 0,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function readString(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function readProgress(value: unknown): Record<string, Progress> {
  if (!isRecord(value)) {
    return {}
  }
  // 字段级净化：每个 Progress 必须至少有 `history: ReviewRecord[]`。
  // **必须用 `Array.isArray`**，不能用 `value.history?.length` 等真值判断——
  // `history: 'oops'` 时 `'oops'.length === 4` 会被静默判定为「已评估过」，
  // 致 todayNewCount 不 +1（不抛错但结果错，比崩溃更难查）。
  const sanitized: Record<string, Progress> = {}
  for (const [targetId, raw] of Object.entries(value)) {
    if (!isRecord(raw)) {
      continue
    }
    const history = Array.isArray(raw.history) ? raw.history : []
    sanitized[targetId] = { ...raw, history } as Progress
  }
  return sanitized
}

function readSession(value: unknown): Session {
  const base = createInitialSession()
  if (!isRecord(value)) {
    return base
  }
  return {
    stageId: readString(value.stageId, base.stageId),
    moduleId: readString(value.moduleId, base.moduleId),
    lastWordIndex: readNumber(value.lastWordIndex, base.lastWordIndex),
    kanaGroupId: readString(value.kanaGroupId, base.kanaGroupId),
    lastKanaIndex: readNumber(value.lastKanaIndex, base.lastKanaIndex),
    lastStudyDate: readString(value.lastStudyDate, base.lastStudyDate),
    todayNewCount: readNumber(value.todayNewCount, base.todayNewCount),
    todayReviewCount: readNumber(value.todayReviewCount, base.todayReviewCount),
    todayGrammarCount: readNumber(
      value.todayGrammarCount,
      base.todayGrammarCount,
    ),
    streakDays: readNumber(value.streakDays, base.streakDays),
  }
}

function readSettings(value: unknown): StudySettings {
  const base = createInitialSettings()
  if (!isRecord(value)) {
    return base
  }
  return {
    rate: readNumber(value.rate, base.rate),
    pitch: readNumber(value.pitch, base.pitch),
    autoSpeakOnCard: readBoolean(value.autoSpeakOnCard, base.autoSpeakOnCard),
    unlockRuleEnabled: readBoolean(
      value.unlockRuleEnabled,
      base.unlockRuleEnabled,
    ),
    // 老版本存储无此字段 → 回落默认 `true`（与 Q1 拍板一致，不漏掉已有用户的入门引导）。
    kanaGateEnabled: readBoolean(value.kanaGateEnabled, base.kanaGateEnabled),
  }
}

/** 只持久化必要分片（runtime 为易失状态，不落盘）。 */
export function partializeState(state: AppState): PersistedState {
  return {
    progress: state.progress,
    session: state.session,
    settings: state.settings,
  }
}

/**
 * 版本迁移：对未知/旧版数据做**逐字段净化**，坏数据一律回落到默认值。
 * 视作从「无版本」升级到 `STORE_VERSION` 的兼容路径。
 */
export function migrateState(persisted: unknown): PersistedState {
  const source = isRecord(persisted) ? persisted : {}
  return {
    progress: readProgress(source.progress),
    session: readSession(source.session),
    settings: readSettings(source.settings),
  }
}

/** 组装 `persist` 选项（供 `store/index.ts` 挂载）。 */
export function createPersistOptions(): PersistOptions<
  AppState,
  PersistedState
> {
  return {
    name: STORE_STORAGE_KEY,
    version: STORE_VERSION,
    storage: createJSONStorage<PersistedState>(() => portableStorage),
    partialize: partializeState,
    migrate: (persisted: unknown) => migrateState(persisted),
    // zustand 4.5.7 仅在 `version` 不一致时调用 `migrate`
    // （见 `node_modules/zustand/esm/middleware.mjs:376-388`）；
    // 版本一致的存储损坏 / 手改导出 JSON 这条路径完全不经过净化。
    // 所以必须在 `merge` 内再净化一次：
    // - `persisted === undefined` 守卫不能省：首次安装 / 空存储时 zustand
    //   会以 `merge(undefined, current)` 调用一次，若不守卫则会被全默认值覆盖 `current`；
    // - 复用现有 `migrateState`，逻辑零分叉。
    merge: (persisted, current) =>
      persisted === undefined
        ? current
        : { ...current, ...migrateState(persisted) },
    onRehydrateStorage: () => (state, error) => {
      if (error !== undefined && error !== null) {
        console.error('[store] 本地进度恢复失败，已回落默认进度：', error)
      }
      // 无论成功 / 失败都必须解除门控，避免应用停在启动态。
      state?.setHydrated(true)
    },
  }
}
