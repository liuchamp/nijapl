import type { KanaVoiceType, KanaVowel } from '../../../src/types/kana.js'

/**
 * K 域假名数据源（104 音）。
 *
 * 组织方式：**27 个「行」规格 + 3 张稀疏补丁表**，而不是 104 条独立对象。
 * 理由：
 * - 行内的平假名 / 片假名 / 罗马音 / 字源天然是等长的平行字符串，写成一行可肉眼对齐；
 * - 应用实例、罗马音变体、易混关系是**稀疏**的，用 `Record<id, …>` 只写例外；
 * - 校验脚本会检查各行长度一致、id 唯一、音数合计为 104（设计 §7.2）。
 *
 * 字源只给**清音**：浊音 / 半浊音 / 拗音由基准音构成（`が = か + 浊点`、`きゃ = き + や`），
 * 单独给字源是错误的教学信息。K1 卡片会按 `baseKanaId` 自动生成构成说明。
 */

/** 行规格。 */
export interface KanaRowSpec {
  id: string
  groupId: string
  voiceType: KanaVoiceType
  /** 浊音 / 半浊音的基准清音行（同下标取基准音）。 */
  clearRowId?: string
  /**
   * 拗音专用：基准音 = 本行**首个大書き假名**对应的音（きゃ 行 → き，じゃ 行 → じ）。
   * 由 `build-kana.ts` 通过「假名 → id」索引反查，不硬编码行映射。
   */
  baseFromFirst?: boolean
  vowels: KanaVowel[]
  hiragana: string
  katakana: string
  romaji: string[]
  /** 平假名字源汉字（草书来源），逐字与 `hiragana` 对齐。 */
  originHiragana: string
  /** 片假名字源汉字（楷书取偏旁），逐字与 `katakana` 对齐。 */
  originKatakana: string
}

/** 应用实例规格。 */
export interface KanaWordSpec {
  text: string
  accent: string
  kanji: string
  meaning: string
  /** 命中 N3 词表时指向 `WORD.id`，供 K1 卡片跳转 P3。 */
  wordId?: string
}

function ex(
  text: string,
  accent: string,
  kanji: string,
  meaning: string,
  wordId?: string,
): KanaWordSpec {
  return { text, accent, kanji, meaning, wordId }
}

/**
 * 27 行 × 104 音。
 *
 * 清音 11 行 = 46 音（や行 3、わ行 2、ん 1）；
 * 浊音 4 行 = 20 音；半浊音 1 行 = 5 音；拗音 11 行 = 33 音。
 */
export const KANA_ROW_SPECS: KanaRowSpec[] = [
  {
    id: 'a',
    groupId: 'g01',
    voiceType: '清音',
    vowels: ['a', 'i', 'u', 'e', 'o'],
    hiragana: 'あいうえお',
    katakana: 'アイウエオ',
    romaji: ['a', 'i', 'u', 'e', 'o'],
    originHiragana: '安以宇衣於',
    originKatakana: '阿伊宇江於',
  },
  {
    id: 'ka',
    groupId: 'g01',
    voiceType: '清音',
    vowels: ['a', 'i', 'u', 'e', 'o'],
    hiragana: 'かきくけこ',
    katakana: 'カキクケコ',
    romaji: ['ka', 'ki', 'ku', 'ke', 'ko'],
    originHiragana: '加幾久計己',
    originKatakana: '加幾久介己',
  },
  {
    id: 'sa',
    groupId: 'g02',
    voiceType: '清音',
    vowels: ['a', 'i', 'u', 'e', 'o'],
    hiragana: 'さしすせそ',
    katakana: 'サシスセソ',
    romaji: ['sa', 'shi', 'su', 'se', 'so'],
    originHiragana: '左之寸世曽',
    originKatakana: '散之須世曽',
  },
  {
    id: 'ta',
    groupId: 'g02',
    voiceType: '清音',
    vowels: ['a', 'i', 'u', 'e', 'o'],
    hiragana: 'たちつてと',
    katakana: 'タチツテト',
    romaji: ['ta', 'chi', 'tsu', 'te', 'to'],
    originHiragana: '太知川天止',
    originKatakana: '多千川天止',
  },
  {
    id: 'na',
    groupId: 'g03',
    voiceType: '清音',
    vowels: ['a', 'i', 'u', 'e', 'o'],
    hiragana: 'なにぬねの',
    katakana: 'ナニヌネノ',
    romaji: ['na', 'ni', 'nu', 'ne', 'no'],
    originHiragana: '奈仁奴祢乃',
    originKatakana: '奈二奴祢乃',
  },
  {
    id: 'ha',
    groupId: 'g03',
    voiceType: '清音',
    vowels: ['a', 'i', 'u', 'e', 'o'],
    hiragana: 'はひふへほ',
    katakana: 'ハヒフヘホ',
    romaji: ['ha', 'hi', 'fu', 'he', 'ho'],
    originHiragana: '波比不部保',
    originKatakana: '八比不部保',
  },
  {
    id: 'ma',
    groupId: 'g04',
    voiceType: '清音',
    vowels: ['a', 'i', 'u', 'e', 'o'],
    hiragana: 'まみむめも',
    katakana: 'マミムメモ',
    romaji: ['ma', 'mi', 'mu', 'me', 'mo'],
    originHiragana: '末美武女毛',
    originKatakana: '万三牟女毛',
  },
  {
    id: 'ya',
    groupId: 'g04',
    voiceType: '清音',
    vowels: ['a', 'u', 'o'],
    hiragana: 'やゆよ',
    katakana: 'ヤユヨ',
    romaji: ['ya', 'yu', 'yo'],
    originHiragana: '也由与',
    originKatakana: '也由与',
  },
  {
    id: 'ra',
    groupId: 'g05',
    voiceType: '清音',
    vowels: ['a', 'i', 'u', 'e', 'o'],
    hiragana: 'らりるれろ',
    katakana: 'ラリルレロ',
    romaji: ['ra', 'ri', 'ru', 're', 'ro'],
    originHiragana: '良利留礼呂',
    originKatakana: '良利流礼呂',
  },
  {
    id: 'wa',
    groupId: 'g05',
    voiceType: '清音',
    vowels: ['a', 'o'],
    hiragana: 'わを',
    katakana: 'ワヲ',
    romaji: ['wa', 'wo'],
    originHiragana: '和遠',
    originKatakana: '和乎',
  },
  {
    id: 'n',
    groupId: 'g05',
    voiceType: '清音',
    vowels: ['n'],
    hiragana: 'ん',
    katakana: 'ン',
    romaji: ['n'],
    originHiragana: '无',
    originKatakana: '尔',
  },
  {
    id: 'ga',
    groupId: 'g06',
    voiceType: '浊音',
    clearRowId: 'ka',
    vowels: ['a', 'i', 'u', 'e', 'o'],
    hiragana: 'がぎぐげご',
    katakana: 'ガギグゲゴ',
    romaji: ['ga', 'gi', 'gu', 'ge', 'go'],
    originHiragana: '',
    originKatakana: '',
  },
  {
    id: 'za',
    groupId: 'g06',
    voiceType: '浊音',
    clearRowId: 'sa',
    vowels: ['a', 'i', 'u', 'e', 'o'],
    hiragana: 'ざじずぜぞ',
    katakana: 'ザジズゼゾ',
    romaji: ['za', 'ji', 'zu', 'ze', 'zo'],
    originHiragana: '',
    originKatakana: '',
  },
  {
    id: 'da',
    groupId: 'g07',
    voiceType: '浊音',
    clearRowId: 'ta',
    vowels: ['a', 'i', 'u', 'e', 'o'],
    hiragana: 'だぢづでど',
    katakana: 'ダヂヅデド',
    romaji: ['da', 'di', 'du', 'de', 'do'],
    originHiragana: '',
    originKatakana: '',
  },
  {
    id: 'ba',
    groupId: 'g07',
    voiceType: '浊音',
    clearRowId: 'ha',
    vowels: ['a', 'i', 'u', 'e', 'o'],
    hiragana: 'ばびぶべぼ',
    katakana: 'バビブベボ',
    romaji: ['ba', 'bi', 'bu', 'be', 'bo'],
    originHiragana: '',
    originKatakana: '',
  },
  {
    id: 'pa',
    groupId: 'g08',
    voiceType: '半浊音',
    clearRowId: 'ha',
    vowels: ['a', 'i', 'u', 'e', 'o'],
    hiragana: 'ぱぴぷぺぽ',
    katakana: 'パピプペポ',
    romaji: ['pa', 'pi', 'pu', 'pe', 'po'],
    originHiragana: '',
    originKatakana: '',
  },
  {
    id: 'kya',
    groupId: 'g09',
    voiceType: '拗音',
    baseFromFirst: true,
    vowels: ['a', 'u', 'o'],
    hiragana: 'きゃきゅきょ',
    katakana: 'キャキュキョ',
    romaji: ['kya', 'kyu', 'kyo'],
    originHiragana: '',
    originKatakana: '',
  },
  {
    id: 'sha',
    groupId: 'g09',
    voiceType: '拗音',
    baseFromFirst: true,
    vowels: ['a', 'u', 'o'],
    hiragana: 'しゃしゅしょ',
    katakana: 'シャシュショ',
    romaji: ['sha', 'shu', 'sho'],
    originHiragana: '',
    originKatakana: '',
  },
  {
    id: 'cha',
    groupId: 'g09',
    voiceType: '拗音',
    baseFromFirst: true,
    vowels: ['a', 'u', 'o'],
    hiragana: 'ちゃちゅちょ',
    katakana: 'チャチュチョ',
    romaji: ['cha', 'chu', 'cho'],
    originHiragana: '',
    originKatakana: '',
  },
  {
    id: 'nya',
    groupId: 'g10',
    voiceType: '拗音',
    baseFromFirst: true,
    vowels: ['a', 'u', 'o'],
    hiragana: 'にゃにゅにょ',
    katakana: 'ニャニュニョ',
    romaji: ['nya', 'nyu', 'nyo'],
    originHiragana: '',
    originKatakana: '',
  },
  {
    id: 'hya',
    groupId: 'g10',
    voiceType: '拗音',
    baseFromFirst: true,
    vowels: ['a', 'u', 'o'],
    hiragana: 'ひゃひゅひょ',
    katakana: 'ヒャヒュヒョ',
    romaji: ['hya', 'hyu', 'hyo'],
    originHiragana: '',
    originKatakana: '',
  },
  {
    id: 'mya',
    groupId: 'g10',
    voiceType: '拗音',
    baseFromFirst: true,
    vowels: ['a', 'u', 'o'],
    hiragana: 'みゃみゅみょ',
    katakana: 'ミャミュミョ',
    romaji: ['mya', 'myu', 'myo'],
    originHiragana: '',
    originKatakana: '',
  },
  {
    id: 'rya',
    groupId: 'g11',
    voiceType: '拗音',
    baseFromFirst: true,
    vowels: ['a', 'u', 'o'],
    hiragana: 'りゃりゅりょ',
    katakana: 'リャリュリョ',
    romaji: ['rya', 'ryu', 'ryo'],
    originHiragana: '',
    originKatakana: '',
  },
  {
    id: 'gya',
    groupId: 'g11',
    voiceType: '拗音',
    baseFromFirst: true,
    vowels: ['a', 'u', 'o'],
    hiragana: 'ぎゃぎゅぎょ',
    katakana: 'ギャギュギョ',
    romaji: ['gya', 'gyu', 'gyo'],
    originHiragana: '',
    originKatakana: '',
  },
  {
    id: 'ja',
    groupId: 'g11',
    voiceType: '拗音',
    baseFromFirst: true,
    vowels: ['a', 'u', 'o'],
    hiragana: 'じゃじゅじょ',
    katakana: 'ジャジュジョ',
    romaji: ['ja', 'ju', 'jo'],
    originHiragana: '',
    originKatakana: '',
  },
  {
    id: 'bya',
    groupId: 'g12',
    voiceType: '拗音',
    baseFromFirst: true,
    vowels: ['a', 'u', 'o'],
    hiragana: 'びゃびゅびょ',
    katakana: 'ビャビュビョ',
    romaji: ['bya', 'byu', 'byo'],
    originHiragana: '',
    originKatakana: '',
  },
  {
    id: 'pya',
    groupId: 'g12',
    voiceType: '拗音',
    baseFromFirst: true,
    vowels: ['a', 'u', 'o'],
    hiragana: 'ぴゃぴゅぴょ',
    katakana: 'ピャピュピョ',
    romaji: ['pya', 'pyu', 'pyo'],
    originHiragana: '',
    originKatakana: '',
  },
]

/**
 * 应用实例：**每个音至少 1 条**（设计 §7.2 校验项）。
 *
 * 多数取「以该假名打头」的常用词；`ん` / `を` 无法打头，取**含该音**的常用词并在释义中标注。
 * `wordId` 仅在实例词与 N3 词表**完全同词**时填写（对齐 `WORD.kana`），供 K5 跳转 P3。
 */
export const KANA_EXAMPLES: Record<string, KanaWordSpec[]> = {
  a: [ex('あい', '①', '愛', '爱恋、爱情')],
  i: [ex('いえ', '②', '家', '家，房子', 'w-03')],
  u: [ex('うつくしい', '④', '美しい', '美丽的', 'w-41')],
  e: [ex('えき', '①', '駅', '车站', 'w-16')],
  o: [ex('おとこ', '③', '男', '男人')],

  ka: [ex('かく', '①', '書く', '写', 'w-24')],
  ki: [ex('きょう', '①', '今日', '今天', 'w-26')],
  ku: [ex('くうこう', '⓪', '空港', '机场', 'w-20')],
  ke: [ex('けさ', '①', '今朝', '今天早上')],
  ko: [ex('ことば', '③', '言葉', '语言，词语', 'w-33')],

  sa: [ex('さくら', '⓪', '桜', '樱花')],
  shi: [ex('しずか', '①', '静か', '安静的', 'w-15')],
  su: [ex('すばらしい', '④', '素晴らしい', '极好的', 'w-42')],
  se: [ex('せかい', '①', '世界', '世界')],
  so: [ex('そら', '①', '空', '天空')],

  ta: [ex('たべる', '②', '食べる', '吃', 'w-06')],
  chi: [ex('ちいさい', '③', '小さい', '小的', 'w-12')],
  tsu: [ex('つかう', '⓪', '使う', '使用', 'w-37')],
  te: [ex('てがみ', '⓪', '手紙', '信')],
  to: [ex('ところ', '⓪', '所', '地方', 'w-32')],

  na: [ex('なつ', '②', '夏', '夏天')],
  ni: [ex('にほん', '②', '日本', '日本')],
  nu: [ex('ぬの', '⓪', '布', '布')],
  ne: [ex('ねこ', '①', '猫', '猫')],
  no: [ex('のむ', '①', '飲む', '喝', 'w-07')],

  ha: [ex('はなす', '②', '話す', '说，讲', 'w-25')],
  hi: [ex('ひと', '⓪', '人', '人', 'w-02')],
  fu: [ex('ふゆ', '②', '冬', '冬天')],
  he: [ex('へた', '②', '下手', '不擅长')],
  ho: [ex('ほん', '①', '本', '书', 'w-05')],

  ma: [ex('まつ', '①', '待つ', '等待', 'w-38')],
  mi: [ex('みず', '⓪', '水', '水', 'w-04')],
  mu: [ex('むずかしい', '④', '難しい', '难的')],
  me: [ex('めがね', '①', '眼鏡', '眼镜')],
  mo: [ex('もう', '①', 'もう', '已经', 'w-50')],

  ya: [ex('やま', '②', '山', '山')],
  yu: [ex('ゆき', '②', '雪', '雪')],
  yo: [ex('よむ', '①', '読む', '读', 'w-23')],

  ra: [ex('らいねん', '①', '来年', '明年')],
  ri: [ex('りゆう', '⓪', '理由', '理由', 'w-35')],
  ru: [ex('るす', '①', '留守', '不在家')],
  re: [ex('れい', '①', '例', '例子')],
  ro: [ex('ろく', '②', '六', '六')],

  wa: [ex('わたし', '⓪', '私', '我', 'w-01')],
  wo: [ex('みずを', '⓪', '水', '水（作助词示例，含「を」）')],
  n: [ex('ほん', '①', '本', '书（含拨音「ん」）', 'w-05')],

  ga: [ex('がっこう', '⓪', '学校', '学校', 'w-17')],
  gi: [ex('ぎんこう', '⓪', '銀行', '银行')],
  gu: [ex('ぐあい', '⓪', '具合', '状况')],
  ge: [ex('げんき', '①', '元気', '精神，健康')],
  go: [ex('ごはん', '①', 'ご飯', '米饭')],

  za: [ex('ざっし', '⓪', '雑誌', '杂志')],
  ji: [ex('じかん', '⓪', '時間', '时间', 'w-31')],
  zu: [ex('ずっと', '⓪', 'ずっと', '一直')],
  ze: [ex('ぜんぶ', '①', '全部', '全部')],
  zo: [ex('ぞう', '①', '象', '大象')],

  da: [ex('だいがく', '⓪', '大学', '大学')],
  di: [ex('ちぢむ', '⓪', '縮む', '收缩')],
  du: [ex('つづく', '⓪', '続く', '继续')],
  de: [ex('でんしゃ', '⓪', '電車', '电车', 'w-18')],
  do: [ex('どようび', '②', '土曜日', '星期六')],

  ba: [ex('ばんごう', '③', '番号', '号码')],
  bi: [ex('びょういん', '⓪', '病院', '医院')],
  bu: [ex('ぶんか', '①', '文化', '文化')],
  be: [ex('べんり', '①', '便利', '方便的', 'w-14')],
  bo: [ex('ぼうし', '⓪', '帽子', '帽子')],

  pa: [ex('ぱん', '①', 'パン', '面包')],
  pi: [ex('ぴあの', '⓪', 'ピアノ', '钢琴')],
  pu: [ex('ぷれぜんと', '②', 'プレゼント', '礼物')],
  pe: [ex('ぺん', '①', 'ペン', '笔')],
  po: [ex('ぽすと', '①', 'ポスト', '邮筒')],

  kya: [ex('きゃく', '⓪', '客', '客人')],
  kyu: [ex('きゅう', '⓪', '九', '九')],
  kyo: [ex('きょうしつ', '⓪', '教室', '教室')],
  sha: [ex('しゃしん', '⓪', '写真', '照片')],
  shu: [ex('しゅみ', '①', '趣味', '爱好')],
  sho: [ex('しょくじ', '⓪', '食事', '用餐')],
  cha: [ex('ちゃいろ', '⓪', '茶色', '茶色')],
  chu: [ex('ちゅうごく', '①', '中国', '中国')],
  cho: [ex('ちょうしょく', '③', '朝食', '早餐')],

  nya: [ex('こんにゃく', '⓪', '蒟蒻', '魔芋')],
  nyu: [ex('にゅうがく', '⓪', '入学', '入学')],
  nyo: [ex('にょうぼう', '①', '女房', '妻子（口语）')],
  hya: [ex('ひゃく', '②', '百', '百')],
  hyu: [ex('ヒューズ', '①', 'ヒューズ', '保险丝')],
  hyo: [ex('ひょう', '①', '表', '表格')],
  mya: [ex('みゃく', '⓪', '脈', '脉搏')],
  myu: [ex('ミュージック', '①', 'ミュージック', '音乐')],
  myo: [ex('みょうじ', '⓪', '名字', '姓氏')],

  rya: [ex('りゃく', '⓪', '略', '简略')],
  ryu: [ex('りゅう', '①', '竜', '龙')],
  ryo: [ex('りょうり', '①', '料理', '料理')],
  gya: [ex('ぎゃく', '⓪', '逆', '相反')],
  gyu: [ex('ぎゅうにゅう', '⓪', '牛乳', '牛奶')],
  gyo: [ex('きんぎょ', '①', '金魚', '金鱼')],
  ja: [ex('じゃま', '⓪', '邪魔', '妨碍')],
  ju: [ex('じゅぎょう', '⓪', '授業', '课程')],
  jo: [ex('じょせい', '⓪', '女性', '女性')],

  bya: [ex('さんびゃく', '①', '三百', '三百')],
  byu: [ex('ビュー', '①', 'ビュー', '视野')],
  byo: [ex('びょういん', '⓪', '病院', '医院')],
  pya: [ex('ろっぴゃく', '④', '六百', '六百')],
  pyu: [ex('ピュア', '①', 'ピュア', '纯粹')],
  pyo: [ex('ぴょんぴょん', '①', 'ぴょんぴょん', '蹦蹦跳跳')],
}

/**
 * 罗马音输入变体（K2 题型⑤「输入罗马音」判分用）。
 *
 * **只登记例外**：未登记的音只有 `[romaji]` 一种合法写法。
 * 必须显式枚举，禁止模糊 / 前缀匹配（设计 §10.2 RK3）。
 *
 * 注意 `ぢ → di`、`づ → du`：采用训令式拼写而非赫本式 `ji` / `zu`，
 * 因为赫本式会让「假名选罗马音」出现**两个正确答案**（じ 与 ぢ 同为 `ji`）。
 * 变体表里同时收 `ji` / `zi` / `zu`，保证用户按赫本式输入也算对。
 */
export const KANA_ROMAJI_ALIASES: Record<string, string[]> = {
  shi: ['shi', 'si'],
  chi: ['chi', 'ti'],
  tsu: ['tsu', 'tu'],
  fu: ['fu', 'hu'],
  ji: ['ji', 'zi'],
  di: ['di', 'ji', 'zi'],
  du: ['du', 'zu'],
  n: ['n', 'nn'],

  sha: ['sha', 'sya'],
  shu: ['shu', 'syu'],
  sho: ['sho', 'syo'],
  cha: ['cha', 'tya', 'cya'],
  chu: ['chu', 'tyu'],
  cho: ['cho', 'tyo'],
  ja: ['ja', 'jya', 'zya'],
  ju: ['ju', 'jyu', 'zyu'],
  jo: ['jo', 'jyo', 'zyo'],
}

/**
 * 易混边表（对称闭包）。
 *
 * 三类来源：**形近**（シ/ツ、ソ/ン、ね/れ/わ）、**同音异形**（じ/ぢ、ず/づ）、
 * **拗音清浊对**（きゃ/ぎゃ、しゃ/じゃ、ひゃ/びゃ/ぴゃ）。
 *
 * 用途：① K2 选择题的干扰项优先级最高档；② P7「易混对比练习」的配对来源。
 */
export const KANA_CONFUSABLE_EDGES: Array<[string, string]> = [
  ['shi', 'tsu'],
  ['so', 'n'],
  ['ne', 're'],
  ['re', 'wa'],
  ['ne', 'wa'],
  ['nu', 'me'],
  ['ru', 'ro'],
  ['i', 'ri'],
  ['ha', 'ho'],
  ['ki', 'sa'],
  ['a', 'o'],
  ['ku', 'he'],
  ['te', 'chi'],
  ['fu', 'wa'],
  ['ji', 'di'],
  ['zu', 'du'],

  ['kya', 'gya'],
  ['sha', 'ja'],
  ['hya', 'bya'],
  ['bya', 'pya'],
  ['hya', 'pya'],
  ['kyu', 'gyu'],
  ['shu', 'ju'],
  ['hyu', 'byu'],
  ['byu', 'pyu'],
  ['hyu', 'pyu'],
  ['kyo', 'gyo'],
  ['sho', 'jo'],
  ['hyo', 'byo'],
  ['byo', 'pyo'],
  ['hyo', 'pyo'],
]
