import { useStore } from 'zustand'
import type { Progress, Session, StudySettings } from '../types/progress.js'
import type { Actions } from './actions.js'
import type { AppState, DetailSheetState, RuntimeState } from './index.js'
import { appStore } from './index.js'

/**
 * React 绑定（架构 §2.6）：把 zustand v4 vanilla store 接到组件。
 *
 * - `useAppStore(selector)`：通用选择器（**selector 必须返回稳定引用或原始值**，
 *   不要在其中构造新对象 / 新数组，否则会触发无限重渲染）；
 * - 其余 hook 均返回稳定分片或原始值；
 * - 需要 dispatch 时优先用 `appActions`（稳定引用，可用于事件回调）。
 */

/** 通用选择器绑定。 */
export function useAppStore<T>(selector: (state: AppState) => T): T {
  return useStore(appStore, selector)
}

/** 持久化是否已完成（hydration 门控）。 */
export function useHydrated(): boolean {
  return useAppStore((state) => state.runtime.hydrated)
}

/** 全量进度表（稳定引用）。 */
export function useProgressMap(): Record<string, Progress> {
  return useAppStore((state) => state.progress)
}

/** 单个目标进度（稳定引用）。 */
export function useProgress(targetId: string): Progress | undefined {
  return useAppStore((state) => state.progress[targetId])
}

/** 会话快照（稳定引用）。 */
export function useSession(): Session {
  return useAppStore((state) => state.session)
}

/** 学习设置（稳定引用）。 */
export function useSettings(): StudySettings {
  return useAppStore((state) => state.settings)
}

/** 易失运行时状态（稳定引用）。 */
export function useRuntime(): RuntimeState {
  return useAppStore((state) => state.runtime)
}

/** 半屏详解浮层状态（稳定引用）。 */
export function useDetailSheet(): DetailSheetState {
  return useAppStore((state) => state.runtime.detailSheet)
}

const initialState: AppState = appStore.getState()

/**
 * 稳定 action 引用集合：action 函数在 store 生命周期内恒定，
 * 可直接放进 `useMemo` / `useCallback` 依赖数组或在事件回调中使用。
 */
export const appActions: Actions = {
  setHydrated: initialState.setHydrated,
  ensureProgress: initialState.ensureProgress,
  markPresented: initialState.markPresented,
  submitSelfEval: initialState.submitSelfEval,
  skipWord: initialState.skipWord,
  submitReviewResult: initialState.submitReviewResult,
  startStudy: initialState.startStudy,
  setCurrentIndex: initialState.setCurrentIndex,
  openDetailSheet: initialState.openDetailSheet,
  closeDetailSheet: initialState.closeDetailSheet,
  markStudyDay: initialState.markStudyDay,
  updateSettings: initialState.updateSettings,
  toggleUnlockRule: initialState.toggleUnlockRule,
  resetAllProgress: initialState.resetAllProgress,
}
