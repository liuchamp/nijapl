import { isVerb } from '../constants/pos.js'
import type { Word } from '../types/domain.js'

/** 一行变形。 */
export interface ConjugationRow {
  /** 形名，如「ます形」。 */
  form: string
  /** 该形的值（kana）。 */
  value: string
}

/** 五段动词：う段 → い段（用于ます形 / ない形）。 */
const GODAN_I_ROW: Record<string, string> = {
  う: 'い',
  く: 'き',
  ぐ: 'ぎ',
  す: 'し',
  つ: 'ち',
  ぬ: 'に',
  ぶ: 'び',
  む: 'み',
  る: 'り',
}

/** 五段动词：て形 / た形 词尾。 */
const GODAN_TE_FORM: Record<string, string> = {
  う: 'って',
  つ: 'って',
  る: 'って',
  む: 'んで',
  ぶ: 'んで',
  ぬ: 'んで',
  く: 'いて',
  ぐ: 'いで',
  す: 'して',
}

function stem(kana: string): string {
  return kana.length === 0 ? '' : kana.slice(0, -1)
}

function lastChar(kana: string): string {
  return kana.length === 0 ? '' : (kana[kana.length - 1] ?? '')
}

function rows(
  dictionary: string,
  masu: string,
  te: string,
  ta: string,
  nai: string,
): ConjugationRow[] {
  return [
    { form: '辞書形', value: dictionary },
    { form: 'ます形', value: masu },
    { form: 'て形', value: te },
    { form: 'た形', value: ta },
    { form: 'ない形', value: nai },
  ]
}

/**
 * 按 `pos` 规则生成动词变形表（纯函数）。
 * 非动词或无法识别的词性返回空数组。
 */
export function buildConjugationTable(word: Word): ConjugationRow[] {
  if (!isVerb(word.pos)) {
    return []
  }

  const kana = word.kana

  switch (word.pos) {
    case '一段動詞': {
      const base = stem(kana)
      return rows(kana, `${base}ます`, `${base}て`, `${base}た`, `${base}ない`)
    }
    case 'サ変動詞': {
      const base = kana.endsWith('する') ? kana.slice(0, -2) : stem(kana)
      return rows(
        kana,
        `${base}します`,
        `${base}して`,
        `${base}した`,
        `${base}しない`,
      )
    }
    case 'カ変動詞': {
      return rows('くる', 'きます', 'きて', 'きた', 'こない')
    }
    case '五段動詞': {
      const base = stem(kana)
      const last = lastChar(kana)
      const iRow = GODAN_I_ROW[last] ?? ''
      const te = `${base}${GODAN_TE_FORM[last] ?? ''}`
      const ta = te.endsWith('て')
        ? `${te.slice(0, -1)}た`
        : te.endsWith('で')
          ? `${te.slice(0, -1)}だ`
          : te
      return rows(kana, `${base}${iRow}ます`, te, ta, `${base}${iRow}ない`)
    }
    default:
      return []
  }
}
