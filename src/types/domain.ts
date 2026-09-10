import type { Pos } from '../constants/pos.js'

/** 数据来源：种子 / AI 生成 / 人工。 */
export type Source = 'seed' | 'ai' | 'human'

/** 例句审核状态。 */
export type ReviewStatus = 'pending' | 'approved'

/** 词关系类型。 */
export type WordRelationType = 'synonym' | 'antonym' | 'derived' | 'sameModule'

/** 语法关系类型。 */
export type GrammarRelationType = 'hypernym' | 'hyponym' | 'synonym' | 'antonym'

/** 学习阶段。`hasContent=false`（冲刺期）时完成度短路为「不参与」。 */
export interface Stage {
  id: string
  name: string
  order: number
  /** 备考周次区间（左闭右闭的周序号）。 */
  weekRange: { start: number; end: number }
  hasContent: boolean
  /** 数据来源标记（阶段同样是种子数据，见 PRD §7.2）。 */
  source: Source
}

/** 学习模块，隶属于某个阶段。 */
export interface Module {
  id: string
  stageId: string
  name: string
  wordCount: number
  /** 数据来源标记（PRD §7.2）。 */
  source: Source
}

/** 词条关联关系。 */
export interface WordRelation {
  fromId: string
  toId: string
  type: WordRelationType
}

/** 词条。`kana` 为 TTS 朗读依据；`pos` 为显式枚举。 */
export interface Word {
  id: string
  kana: string
  kanji: string
  pos: Pos
  meaning: string
  stageId: string
  moduleId: string
  source: Source
  related?: WordRelation[]
}

/** 语法关联关系。 */
export interface GrammarRelation {
  fromId: string
  toId: string
  type: GrammarRelationType
}

/** 语法点。 */
export interface Grammar {
  id: string
  pattern: string
  connection: string
  scene: string
  week: number
  level: string
  stageId: string
  source: Source
  related?: GrammarRelation[]
}

/**
 * 例句中出现的词条。
 * `start`/`end` 为可选高亮偏移，指向 `Sentence.ja` 的字符下标（左闭右开）。
 */
export interface SentenceWord {
  sentenceId: string
  wordId: string
  surface: string
  start?: number
  end?: number
}

/**
 * 例句中出现的语法点。
 * `start`/`end` 为可选高亮偏移，指向 `Sentence.ja` 的字符下标（左闭右开）；
 * 缺失时由渲染层退化为「目标词优先」的策略定位。
 */
export interface SentenceGrammar {
  sentenceId: string
  grammarId: string
  start?: number
  end?: number
}

/** 例句。 */
export interface Sentence {
  id: string
  ja: string
  zh: string
  level: string
  source: Source
  reviewStatus: ReviewStatus
  words: SentenceWord[]
  grammars: SentenceGrammar[]
}

/** 构建产物的数据契约：`data/build/*.json` 的唯一结构。 */
export interface BuildData {
  stages: Stage[]
  modules: Module[]
  words: Word[]
  grammars: Grammar[]
  sentences: Sentence[]
}
