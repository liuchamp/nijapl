/**
 * 平台抽象的类型定义（`engine/platform` 单一真相源）。
 *
 * 该层把「当前运行在哪个平台」收敛为**一处**探测，页面 / store / service
 * 一律经 `engine/platform/index.js` 读取，禁止散落 UA 判断。
 */

/** 平台种类（Wails `environment.OS` 归一化后的结果；无法判定时为 `'web'`）。 */
export type PlatformKind =
  | 'macos'
  | 'windows'
  | 'linux'
  | 'ios'
  | 'android'
  | 'web'

/** 形态因子：移动端 / 桌面（用于移动优先的布局与能力降级）。 */
export type FormFactor = 'mobile' | 'desktop'
