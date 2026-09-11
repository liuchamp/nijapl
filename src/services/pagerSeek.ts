import type { SlideMode } from './platform.js'

/**
 * P2 卡片容器的**程序化翻页**（60301 修复）。
 *
 * 背景：旧实现用 `key={`pager-${token}`}` 强制销毁重建容器来 seek，
 * 容器在首帧创建后立刻被移除重建，与原生 UI 的异步创建形成竞态，
 * 触发 `60301 Can't find ui tag`（LynxUI 尚未创建就收到更新/移除）。
 *
 * 现改走 Lynx 官方 UI 方法（SelectorQuery + `invoke`），容器只创建一次：
 * - `<viewpager>` → `selectTab`（params: `{ index, smooth }`）
 * - `<scroll-view>` → `scrollTo`（params 同样支持 `{ index, smooth }`）
 *
 * 约束：`nodes-ref` **仅支持 id 选择器**，故容器必须带 `id`；
 * 宿主缺失 SelectorQuery 或方法不存在时回调 `onUnsupported`，由调用方回退。
 */

/** SelectorQuery 最小结构（只用到 select / invoke / exec）。 */
interface PagerQuery {
  select(selector: string): PagerQuery
  invoke(options: {
    method: string
    params?: Record<string, unknown>
    fail?(res: { code: number }): void
  }): PagerQuery
  exec(): void
}

/** 卡片容器 id（与 Study 页容器 `id` 一致）。 */
export const PAGER_ID = 'study-pager'

/** 容器 id 选择器。 */
export const PAGER_SELECTOR = `#${PAGER_ID}`

/** 取容器查询句柄；宿主无 `lynx.createSelectorQuery` 时返回 `null`。 */
function createPagerQuery(selector: string): PagerQuery | null {
  const scope = globalThis as unknown as {
    lynx?: { createSelectorQuery(): PagerQuery }
  }
  const query = scope.lynx?.createSelectorQuery()
  return query === undefined ? null : query.select(selector)
}

/** 翻页参数。 */
export interface SeekPagerParams {
  /** 当前容器模式，决定调用哪个 UI 方法。 */
  mode: SlideMode
  /** 目标序号（调用方须先行夹取）。 */
  index: number
  /**
   * 宿主**不具备**程序化翻页能力（无 `lynx.createSelectorQuery`）时的回调。
   *
   * 与 `onFail` 的区别：这只是"能力缺失"，不代表容器 UI 有问题，
   * 调用方应回退到重建方案，**不应**据此判定容器不可用。
   */
  onUnsupported: () => void
  /**
   * 有能力但**定位失败**（节点不存在 / 方法不存在）时的回调。
   *
   * 这是"容器 UI 未创建成功"的强信号（60301 的外在表现），
   * 调用方可据此在重试一次后永久降级，避免反复报错。
   */
  onFail?: () => void
}

/** 把容器定位到指定序号（异步，失败时经回调通知）。 */
export function seekPager(params: SeekPagerParams): void {
  const query = createPagerQuery(PAGER_SELECTOR)
  if (query === null) {
    params.onUnsupported()
    return
  }
  query
    .invoke({
      method: params.mode === 'viewpager' ? 'selectTab' : 'scrollTo',
      params: { index: params.index, smooth: true },
      fail: () => {
        params.onUnsupported()
        params.onFail?.()
      },
    })
    .exec()
}
