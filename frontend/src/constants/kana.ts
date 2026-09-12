import type { KanaQuizKind, KanaScript, KanaVoiceType } from '../types/kana.js'

/**
 * K 域（五十音）常量（设计 §8.4）。
 *
 * 与 `srs.ts` / `pos.ts` 同规格：只放**枚举、阈值与派生键**。
 * 逐音数据（字源 / 罗马音变体 / 易混集 / 应用实例）在 `data/build/kana.json` 里，
 * 由 `validate-kana.ts` 校验——**不在本文件重复一份**，避免两处漂移。
 */

/** K 域进度 key 前缀。**必须**保留：保证与 `WORD.id` / `GRAMMAR.id` 的 id 空间物理隔离。 */
export const KANA_PROGRESS_PREFIX = 'kana:'

/** 进度 key 构造器（唯一入口，禁止页面手写 `'kana:' + id`）。 */
export function kanaProgressKey(kanaId: string): string {
  return `${KANA_PROGRESS_PREFIX}${kanaId}`
}

/** 该进度 key 是否属于 K 域。 */
export function isKanaProgressKey(targetId: string): boolean {
  return targetId.startsWith(KANA_PROGRESS_PREFIX)
}

/** 从 K 域进度 key 还原假名 id；非 K 域 key 返回 `null`。 */
export function kanaIdFromKey(targetId: string): string | null {
  return isKanaProgressKey(targetId)
    ? targetId.slice(KANA_PROGRESS_PREFIX.length)
    : null
}

/** 音类顺序（K0 音表主 Tab 的展示顺序）。 */
export const KANA_VOICE_TYPES: readonly KanaVoiceType[] = [
  '清音',
  '浊音',
  '半浊音',
  '拗音',
] as const

/** 书写体系（K0 音表子 Tab）。 */
export const KANA_SCRIPTS: readonly KanaScript[] = [
  'hiragana',
  'katakana',
] as const

/** 段顺序（音表的列序）。 */
export const KANA_VOWELS = ['a', 'i', 'u', 'e', 'o', 'n'] as const

/**
 * 关解锁阈值：前置关「已掌握率」达到该比例才解锁。
 *
 * 与 `srs.ts` 的 `STAGE_UNLOCK_RATIO` **取值一致但独立命名**：
 * K 域与阶段解锁是两套可独立调参的口径，共用常量会让未来调整互相牵连。
 */
export const KANA_UNLOCK_RATIO = 0.8

/**
 * 「不会写，偷看一眼」的遮挡恢复时长（毫秒）。
 *
 * 对齐参考产品有道五十音图 `seeSeconds` 的 `setTimeout(…, 2000)`：
 * 偷看是有时间惩罚的，不是无限期揭示。
 */
export const KANA_PEEK_MS = 2000

/** 选择题的选项个数（1 正确 + 3 干扰）。 */
export const KANA_QUIZ_OPTION_COUNT = 4

/** 结业测验题数（12 关全达标后，从 104 音里确定性抽样）。 */
export const KANA_FINAL_QUIZ_SIZE = 20

/**
 * 结业测验的抽样步长。
 *
 * 与 `KANA_TOTAL = 104` **互质**，故 `i * stride % 104`（i < 20）两两不同；
 * 取 5 而不是 1 是为了让抽到的音**跨关铺开**——按顺序取前 20 个会全部落在清音 5 关内，
 * 那样「结业测验」其实只考了清音。步长变化后 `pickFinalQuizTargets` 会自动补齐去重，
 * 不需要同步改任何代码。
 */
export const KANA_FINAL_QUIZ_STRIDE = 5

/** K2 题型顺序（也是确定性轮转的取值顺序）。 */
export const KANA_QUIZ_KINDS: readonly KanaQuizKind[] = [
  'listenToKana',
  'kanaToRomaji',
  'romajiToKana',
  'scriptSwap',
  'typeRomaji',
] as const

/** 期望的关卡数（12 关）。 */
export const KANA_GROUP_COUNT = 12

/** 期望的假名总数（104 音）。 */
export const KANA_TOTAL = 104

/** 描红画布的网格线数量（横 / 竖），复刻五十音练习格的田字结构。 */
export const KANA_CANVAS_GRID = 1

/**
 * 小写假名（平假名 + 片假名两套）。
 *
 * 用途：`splitKanaMora` 判定「这一拍要和前一个假名合并」——`きゃ` 是**一拍**而不是两拍。
 * **必须显式枚举**（不是「码点比前一个小」之类的推论）：`っ`（促音）码点比 `き` 大，
 * `ゎ` 也不参与拗音，用比较大小的写法会同时错判这两类。
 */
export const KANA_SMALL_KANA: readonly string[] = [
  'ぁ',
  'ぃ',
  'ぅ',
  'ぇ',
  'ぉ',
  'ゃ',
  'ゅ',
  'ょ',
  'ゎ',
  'ァ',
  'ィ',
  'ゥ',
  'ェ',
  'ォ',
  'ャ',
  'ュ',
  'ョ',
  'ヮ',
] as const
