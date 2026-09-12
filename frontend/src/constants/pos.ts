/** 全量词性枚举（唯一来源）。 */
export const POS_LIST = [
  '名詞',
  '代名詞',
  '五段動詞',
  '一段動詞',
  'サ変動詞',
  'カ変動詞',
  '不規則動詞',
  'い形容詞',
  'な形容詞',
  '副詞',
  '連体詞',
  '接続詞',
  '感動詞',
  '助詞',
  '助動詞',
  '接頭辞',
  '接尾辞',
  'その他',
] as const

export type Pos = (typeof POS_LIST)[number]

/**
 * 动词词性显式枚举数组（J5 变形表判定依据）。
 *
 * 红线：必须使用**显式枚举**，禁止用「五 / 一 / サ / 不」单字匹配（会漏判/误判）。
 */
export const POS_VERB = [
  '五段動詞',
  '一段動詞',
  'サ変動詞',
  'カ変動詞',
  '不規則動詞',
] as const

export type VerbPos = (typeof POS_VERB)[number]

/** 判断某词性是否为动词（基于 {@link POS_VERB} 显式枚举）。 */
export function isVerb(pos: string): boolean {
  return (POS_VERB as readonly string[]).includes(pos)
}
