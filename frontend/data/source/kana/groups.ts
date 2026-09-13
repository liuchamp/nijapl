import type { Source } from '../../../src/types/domain.js'
import type { KanaVoiceType } from '../../../src/types/kana.js'

/**
 * K 域关卡规格（构建期输入）。
 *
 * `kanaIds` **不在此声明**：由 `scripts/gen-data/build-kana.ts` 依据
 * `KANA_ROW_SPECS` 的行序与 `groupId` 派生，保证「行 → 关」唯一映射、不会手写漂移。
 *
 * 前置关用**显式字段**表达（设计 §10.2 RK4）：禁止从 `Kana.baseKanaId` 运行时推导。
 */

/** 关卡规格（不含派生字段 `kanaIds`）。 */
export interface KanaGroupSpec {
  id: string
  name: string
  voiceType: KanaVoiceType
  order: number
  prerequisiteGroupIds: string[]
  source: Source
}

/**
 * 12 关：清音 5 关 + 浊音/半浊音 3 关 + 拗音 4 关。
 *
 * 前置依据是「该关的全部假名，其基准音所在关」：
 * - G06 が・ざ ← G01（か）/ G02（さ）
 * - G07 だ・ば ← G02（た）/ G03（は）
 * - G08 ぱ ← G03（は）
 * - G09 きゃ・しゃ・ちゃ ← G01（き）/ G02（し・ち）
 * - G10 にゃ・ひゃ・みゃ ← G03（に・ひ）/ G04（み）
 * - G11 りゃ・ぎゃ・じゃ ← G05（り）/ G06（ぎ・じ）
 * - G12 びゃ・ぴゃ ← G07（び）/ G08（ぴ）
 */
export const KANA_GROUP_SPECS: KanaGroupSpec[] = [
  {
    id: 'g01',
    name: 'あ・か行',
    voiceType: '清音',
    order: 1,
    prerequisiteGroupIds: [],
    source: 'human',
  },
  {
    id: 'g02',
    name: 'さ・た行',
    voiceType: '清音',
    order: 2,
    prerequisiteGroupIds: ['g01'],
    source: 'human',
  },
  {
    id: 'g03',
    name: 'な・は行',
    voiceType: '清音',
    order: 3,
    prerequisiteGroupIds: ['g02'],
    source: 'human',
  },
  {
    id: 'g04',
    name: 'ま・や行',
    voiceType: '清音',
    order: 4,
    prerequisiteGroupIds: ['g03'],
    source: 'human',
  },
  {
    id: 'g05',
    name: 'ら・わ行・ん',
    voiceType: '清音',
    order: 5,
    prerequisiteGroupIds: ['g04'],
    source: 'human',
  },
  {
    id: 'g06',
    name: 'が・ざ行',
    voiceType: '浊音',
    order: 6,
    prerequisiteGroupIds: ['g01'],
    source: 'human',
  },
  {
    id: 'g07',
    name: 'だ・ば行',
    voiceType: '浊音',
    order: 7,
    prerequisiteGroupIds: ['g02', 'g03'],
    source: 'human',
  },
  {
    id: 'g08',
    name: 'ぱ行（半浊音）',
    voiceType: '半浊音',
    order: 8,
    prerequisiteGroupIds: ['g03'],
    source: 'human',
  },
  {
    id: 'g09',
    name: 'きゃ・しゃ・ちゃ',
    voiceType: '拗音',
    order: 9,
    prerequisiteGroupIds: ['g01', 'g02'],
    source: 'human',
  },
  {
    id: 'g10',
    name: 'にゃ・ひゃ・みゃ',
    voiceType: '拗音',
    order: 10,
    prerequisiteGroupIds: ['g03', 'g04'],
    source: 'human',
  },
  {
    id: 'g11',
    name: 'りゃ・ぎゃ・じゃ',
    voiceType: '拗音',
    order: 11,
    prerequisiteGroupIds: ['g05', 'g06'],
    source: 'human',
  },
  {
    id: 'g12',
    name: 'びゃ・ぴゃ',
    voiceType: '拗音',
    order: 12,
    prerequisiteGroupIds: ['g07', 'g08'],
    source: 'human',
  },
]
