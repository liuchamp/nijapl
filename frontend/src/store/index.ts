import { persist } from 'zustand/middleware'
import { createStore } from 'zustand/vanilla'
import type { KanaScript } from '../types/kana.js'
import type {
  JumpDecision,
  Progress,
  Session,
  StudySettings,
} from '../types/progress.js'
import type { Actions, DetailSheetMode } from './actions.js'
import { createActions } from './actions.js'
import {
  createInitialSession,
  createInitialSettings,
  createPersistOptions,
} from './persistence.js'

/**
 * 全局 store（架构 §1.3 / §2.6）：zustand v4 **vanilla** `createStore`
 * + 四片 state 合并 + `persist` 挂载。
 *
 * 分片：
 * - `progress`：PROGRESS map（持久化）
 * - `session`：断点续学 / 打卡 / 配额（持久化）
 * - `settings`：发音与解锁开关（持久化）
 * - `runtime`：当前学习位置 / 会话错题数 / 浮层状态（**不持久化**）
 *
 * 写操作全部收敛到 `actions.ts`；派生查询在 `selectors.ts`；React 绑定在 `hooks.ts`。
 */

/** 持久化分片：词条 / 语法点进度表。 */
export interface ProgressSlice {
  progress: Record<string, Progress>
}

/** 持久化分片：断点续学 / 打卡 / 今日配额。 */
export interface SessionSlice {
  session: Session
}

/** 持久化分片：学习设置。 */
export interface SettingsSlice {
  settings: StudySettings
}

/** 半屏详解浮层状态（C2）。 */
export interface DetailSheetState {
  visible: boolean
  wordId: string | null
  mode: DetailSheetMode | null
}

/** 易失分片：仅存在于本次运行，不落盘。 */
export interface RuntimeState {
  /** 持久化是否已恢复完成（hydration 门控）。 */
  hydrated: boolean
  /** 当前学习模块 id（null 表示未进入学习）。 */
  currentModuleId: string | null
  /** 当前词条在模块内的序号。 */
  currentIndex: number
  /** 会话内累计答错（J2 依据），进入模块时清零。 */
  sessionWrongCount: number
  /**
   * K 域会话内累计**错音**（**独立计数器**），进入关时清零。
   *
   * 与 `sessionWrongCount` 分开的原因：K 域错音只服务于 K1「本关错音」展示
   * ——假名不是 `word`，`submitSelfEval` 不会对 `kana:` 目标调用 `evaluate`，
   * 它**不参与 J2 判定**。若共用 W 域那个计数器，就必须在进关时清零它，
   * 于是「词条 → 假名 → 词条」的中途串门会丢掉已累计的会话错音，
   * 回到词条后 J2（≥2 次提示详解）失准。
   */
  kanaSessionWrongCount: number
  /** 半屏浮层状态。 */
  detailSheet: DetailSheetState
  /** 最近一次自评命中的跳转决策（便于页面读取）。 */
  lastDecisions: JumpDecision[]

  // —— K 域（五十音）运行时状态（设计 §8.3）——
  /** 当前关 id（null 表示未进入关）。 */
  currentKanaGroupId: string | null
  /** 当前音在关内的序号。 */
  kanaIndex: number
  /** K1 卡片当前显示的书写体系（平 / 片）。 */
  kanaScript: KanaScript
  /** 是否处于「默写」态（遮盖字形，凭记忆书写）。 */
  kanaMemoryMode: boolean
  /** 是否处于「偷看一眼」揭示窗口内（`KANA_PEEK_MS` 后由 service 复位）。 */
  kanaPeekVisible: boolean
}

/** 易失分片容器。 */
export interface RuntimeSlice {
  runtime: RuntimeState
}

/** 完整应用状态 = 四片 + 写操作。 */
export type AppState = ProgressSlice &
  SessionSlice &
  SettingsSlice &
  RuntimeSlice &
  Actions

/** 易失分片初值。 */
export function createInitialRuntime(): RuntimeState {
  return {
    hydrated: false,
    currentModuleId: null,
    currentIndex: 0,
    sessionWrongCount: 0,
    detailSheet: { visible: false, wordId: null, mode: null },
    lastDecisions: [],
    currentKanaGroupId: null,
    kanaIndex: 0,
    kanaScript: 'hiragana',
    kanaMemoryMode: false,
    kanaPeekVisible: false,
    kanaSessionWrongCount: 0,
  }
}

/** 全局单例 store。 */
export const appStore = createStore<AppState>()(
  persist(
    (set, get) => ({
      progress: {},
      session: createInitialSession(),
      settings: createInitialSettings(),
      runtime: createInitialRuntime(),
      ...createActions(set, get),
    }),
    createPersistOptions(),
  ),
)

/**
 * 兜底解门控：若因平台差异导致 `persist` 的恢复回调未触发，
 * 超时后强制置 `hydrated=true`，避免应用永久停留在启动态。
 */
const HYDRATION_WATCHDOG_MS = 2500

setTimeout(() => {
  if (!appStore.getState().runtime.hydrated) {
    appStore.getState().setHydrated(true)
  }
}, HYDRATION_WATCHDOG_MS)
