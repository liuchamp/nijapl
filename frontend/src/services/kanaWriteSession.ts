import { KANA_PEEK_MS } from '../constants/kana.js'
import { appActions } from '../store/hooks.js'
import { appStore } from '../store/index.js'

/**
 * K1 书写会话编排（设计 §8.3）。
 *
 * 职责：把「不会写，偷看一眼」的**计时副作用**收敛到这里。
 *
 * 分层理由（对齐 `services/studySession.ts`）：
 * - `store/actions.ts` 只做**同步纯状态变更**，不放 `setTimeout`；
 * - 计时器需要可取消（离开页面 / 连点 / 切卡），生命周期属于编排层。
 */

let peekTimer: ReturnType<typeof setTimeout> | null = null

/**
 * 揭示字形（「不会写，偷看一眼」），`KANA_PEEK_MS` 后**自动恢复**遮盖。
 *
 * 连点安全：先清掉上一次未触发的计时器，保证任一时刻**至多一个**待触发计时器
 * （否则多次点击会叠加，遮挡提前恢复，验收项 A6）。
 */
export function revealKanaPeek(): void {
  if (peekTimer !== null) {
    clearTimeout(peekTimer)
    peekTimer = null
  }
  appActions.setKanaPeekVisible(true)
  peekTimer = setTimeout(() => {
    peekTimer = null
    appActions.setKanaPeekVisible(false)
  }, KANA_PEEK_MS)
}

/**
 * 取消未完成的揭示计时并复位揭示态。
 *
 * 调用时机：离开 K1 页面（组件卸载）。
 * 不做这件事会留下一个悬挂计时器，在用户已离开后写入一次状态。
 */
export function cancelKanaPeek(): void {
  if (peekTimer !== null) {
    clearTimeout(peekTimer)
    peekTimer = null
  }
  if (appStore.getState().runtime.kanaPeekVisible) {
    appActions.setKanaPeekVisible(false)
  }
}

/** 供测试查询是否存在待触发的揭示计时器。 */
export function hasPendingKanaPeek(): boolean {
  return peekTimer !== null
}

/**
 * 进入某关并从指定音开始（**写 store**，导航由调用方负责）。
 *
 * 为什么先写 store 再导航（而不是把序号塞进 query 参数）：
 * `session.kanaGroupId` / `lastKanaIndex` 是关内断点的**唯一来源**，K1 挂载时会再调一次
 * `startKanaGroup` 并读这两个字段——先写再跳，K1 自然落在目标音上。
 * 走 query 参数则要额外维护一条「路径 → 索引」映射，还要处理越界与参数被手改的情况。
 *
 * 收敛在此处的理由：K0 音表点格、K0 主 CTA、K1 完成面板、首页假名卡**四处**都要做这件事，
 * 分散实现必然出现「漏写 setKanaIndex」这类只在特定入口复现的偏差。
 */
export function enterKanaGroup(groupId: string, index: number): void {
  appActions.startKanaGroup(groupId)
  appActions.setKanaIndex(index)
}
