import type { Source } from './domain.js'

/**
 * K 域（五十音图）领域类型。
 *
 * 与 W 域（`domain.ts` 的词条 / 语法）**物理隔离**：
 * - K 域数据独立成 `data/build/kana.json`，**不并入** `BuildData`（架构 §8.7 数据契约冻结）；
 * - K 域进度复用 `Progress` 五态机，但 `progress` key **必须**带 `kana:` 前缀，
 *   以保证与 `WORD.id` / `GRAMMAR.id` 的 id 空间不冲突。
 */

/** 音类（K0 音表的主 Tab）。半浊音独立成类，不并入浊音。 */
export type KanaVoiceType = '清音' | '浊音' | '半浊音' | '拗音'

/** 书写体系（K0 音表的子 Tab，可多选）。 */
export type KanaScript = 'hiragana' | 'katakana'

/** 段（音表的列）。`ん` 独列为 `n`。 */
export type KanaVowel = 'a' | 'i' | 'u' | 'e' | 'o' | 'n'

/**
 * 关卡：K 域学习 / 解锁的最小单位。
 *
 * 前置关系用**显式字段** `prerequisiteGroupIds` 表达，
 * **禁止**从 `Kana.baseKanaId` 运行时推导（脏数据下会产生循环依赖，见设计 §10.2 RK4）。
 */
export interface KanaGroup {
  id: string
  name: string
  voiceType: KanaVoiceType
  /** 学习顺序，1..12。 */
  order: number
  /** 前置关：全部满足「已掌握率 ≥ 阈值」才解锁。无前置 = 始终解锁。 */
  prerequisiteGroupIds: string[]
  kanaIds: string[]
  source: Source
}

/** 应用实例：以该假名打头的常用词（学以致用钩子）。 */
export interface KanaWord {
  /** 假名词形（含拗音/长音），如 `あい`。 */
  text: string
  /** 声调记号，如 `①`；未知时为空串。 */
  accent: string
  /** 汉字写法，如 `愛`；无汉字时为空串。 */
  kanji: string
  /** 中文释义。 */
  meaning: string
  /** 可选：命中 N3 词表时指向 `WORD.id`，供跳转 P3 词汇详解。 */
  wordId?: string
}

/** 假名（平片成对，一个"音"）。 */
export interface Kana {
  /** 唯一 id，即罗马音（`ka` / `gya`）；进度 key = `kana:` + id。 */
  id: string
  groupId: string
  voiceType: KanaVoiceType
  /**
   * 「行」（音表的**横轴**分组），如 `ka` / `sha`；同行的音共用一个辅音。
   *
   * 与 `vowel`（纵轴「段」）正交：`Kana` 落在 `row × vowel` 的格子里。
   * 数据里**显式给出**而不是从罗马音前缀反推——反推在 `shi/chi/tsu/fu/ji/wo`
   * 这些不规则音上会失效（设计 §10.2 RK4 同源：显式优于隐式推导）。
   */
  row: string
  /** 段（音表的**纵轴**）：あ段 / い段 / う段 / え段 / お段 / ん。 */
  vowel: KanaVowel
  romaji: string
  /**
   * 允许的罗马音输入变体（K2 题型⑤「输入罗马音」判分用）。
   * **必须显式枚举**（如 `し → ['shi','si']`），禁止模糊匹配（见设计 §10.2 RK3）。
   */
  romajiAliases: string[]
  hiragana: string
  katakana: string
  /**
   * 基准清音 id（浊音 / 半浊音 / 拗音专用），**仅作展示与关联**，不作解锁依据。
   * 清音无此字段。
   */
  baseKanaId?: string
  /**
   * 字源：平假名（草书来源）/ 片假名（楷书取偏旁）。
   * 拗音由基础音复合而成，无独立字源（可为空）。
   */
  origin?: {
    hiragana: { char: string; note: string }
    katakana: { char: string; note: string }
  }
  /**
   * 笔顺：归一化 0..1 坐标的 SVG path，按笔序。
   *
   * **v1 为空数组**：未取到可靠笔顺数据源，按设计 §13 Q2 的裁决降级为
   * 「只描红、不显示笔顺动画」；字段保留以便后续补齐数据而**零代码改动**。
   */
  strokePaths: string[]
  /** 易混（形近 / 同音）假名 id 列表，供干扰项与对比练习。 */
  confusable: string[]
  /** 应用实例，至少 1 条。 */
  examples: KanaWord[]
  source: Source
}

/** `data/build/kana.json` 的唯一结构。 */
export interface KanaData {
  groups: KanaGroup[]
  kana: Kana[]
}

/** K2 测验题型。 */
export type KanaQuizKind =
  /** 听音选假名（TTS 播 hiragana → 从假名中选）。 */
  | 'listenToKana'
  /** 假名选罗马音。 */
  | 'kanaToRomaji'
  /** 罗马音选假名。 */
  | 'romajiToKana'
  /** 平片互译（平→片、片→平 交替，由题序决定方向）。 */
  | 'scriptSwap'
  /** 输入罗马音（键盘输入，非选择题）。 */
  | 'typeRomaji'

/** 一道 K2 测验题（判别联合：选择题带 options，输入题无 options）。 */
export type KanaQuizQuestion =
  | {
      kind: Exclude<KanaQuizKind, 'typeRomaji'>
      targetId: string
      /** 题干（选择题的展示文本；`listenToKana` 为空串，靠播放发音）。 */
      prompt: string
      /** 正确答案文本。 */
      answer: string
      /** 选项（含正确答案，顺序确定）。 */
      options: string[]
    }
  | {
      kind: 'typeRomaji'
      targetId: string
      prompt: string
      answer: string
      options: []
    }
