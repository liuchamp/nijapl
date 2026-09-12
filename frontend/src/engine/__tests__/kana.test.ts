import { describe, expect, it } from 'vitest'

import {
  KANA_QUIZ_OPTION_COUNT,
  kanaProgressKey,
} from '../../constants/kana.js'
import { repository } from '../../data/index.js'
import type { Kana, KanaGroup } from '../../types/kana.js'
import type { Progress, SrsState } from '../../types/progress.js'
import {
  buildKanaGlyphIndex,
  buildKanaQuiz,
  firstUnmasteredIndex,
  isKanaFullyMastered,
  isKanaGroupUnlocked,
  isRomajiQuizSafe,
  kanaCompletion,
  kanaGroupCompletion,
  kanaGroupMasteredRatio,
  matchKanaRomaji,
  overallKanaCompletion,
  pickFinalQuizTargets,
  pickKanaDistractors,
  resolveQuizKind,
  splitKanaMora,
} from '../kana.js'
import { initialProgress } from '../srs.js'

/**
 * K 域引擎单测（设计 §12 验收项 A3 / A4 / A5 / A9 / A10）。
 *
 * 约定：
 * - 纯逻辑用例用**内联 fixture**，与数据解耦；
 * - 涉及出题与真实数据的用例走 `repository`（它无端口依赖，可在 node 环境直接跑），
 *   这样校验的是**真实数据**而不是理想化样本。
 */

/** 造一个假名 fixture（只填被测字段）。 */
function makeKana(
  id: string,
  groupId: string,
  romaji: string,
  aliases: string[] = [romaji],
): Kana {
  return {
    id,
    groupId,
    voiceType: '清音',
    row: 'a',
    vowel: 'a',
    romaji,
    romajiAliases: aliases,
    hiragana: id,
    katakana: id,
    strokePaths: [],
    confusable: [],
    examples: [{ text: id, accent: '⓪', kanji: '', meaning: 'fixture' }],
    source: 'human',
  }
}

function makeGroup(
  id: string,
  kanaIds: string[],
  prerequisites: string[] = [],
): KanaGroup {
  return {
    id,
    name: id,
    voiceType: '清音',
    order: 1,
    prerequisiteGroupIds: prerequisites,
    kanaIds,
    source: 'human',
  }
}

function progressOf(id: string, state: SrsState): Progress {
  return { ...initialProgress(id), state, seen: state !== '未学' }
}

/**
 * 造进度表：入参是 `[裸 id, 状态]`，key 自动加 `kana:` 前缀。
 *
 * 必须走前缀 —— `KanaGroup.kanaIds` 存裸 id，而 `progress` 的 key 带 `kana:`，
 * 引擎在读取处做转换。测试若手写裸 key，会得到"完成度恒为 0"的假绿。
 */
function pmOf(entries: Array<[string, SrsState]>): Record<string, Progress> {
  const pm: Record<string, Progress> = {}
  for (const [id, state] of entries) {
    pm[kanaProgressKey(id)] = progressOf(id, state)
  }
  return pm
}

describe('engine/kana · 完成度', () => {
  it('未出现（seen=false）与未定义均计 0', () => {
    expect(kanaCompletion(undefined)).toBe(0)
    expect(kanaCompletion(initialProgress('ka'))).toBe(0)
  })

  it('五态分值复用 STATE_SCORE（已掌握=1 / 模糊=0.5 / 学习中=0.25）', () => {
    expect(kanaCompletion(progressOf('ka', '已掌握'))).toBe(1)
    expect(kanaCompletion(progressOf('ka', '模糊'))).toBe(0.5)
    expect(kanaCompletion(progressOf('ka', '需强化'))).toBe(0.5)
    expect(kanaCompletion(progressOf('ka', '学习中'))).toBe(0.25)
  })

  it('关完成度为关内均值；空关为 0（不产生 NaN）', () => {
    const group = makeGroup('g', ['a', 'i'])
    expect(kanaGroupCompletion(group, {})).toBe(0)
    expect(
      kanaGroupCompletion(
        group,
        pmOf([
          ['a', '已掌握'],
          ['i', '未学'],
        ]),
      ),
    ).toBe(0.5)
    expect(kanaGroupCompletion(makeGroup('empty', []), {})).toBe(0)
  })

  it('总完成度为 12 关均值', () => {
    const groups = [makeGroup('g1', ['a']), makeGroup('g2', ['i'])]
    expect(overallKanaCompletion(groups, {})).toBe(0)
    expect(
      overallKanaCompletion(
        groups,
        pmOf([
          ['a', '已掌握'],
          ['i', '模糊'],
        ]),
      ),
    ).toBe(0.75)
  })
})

describe('engine/kana · 解锁（A5：79% 锁定 / 80% 解锁）', () => {
  it('无前置关恒解锁', () => {
    const g1 = makeGroup('g1', ['a'])
    expect(isKanaGroupUnlocked(g1, [g1], {})).toBe(true)
  })

  it('前置关 4/5 已掌握（80%）解锁，3/5（60%）锁定', () => {
    const ids = ['a', 'i', 'u', 'e', 'o']
    const g1 = makeGroup('g1', ids)
    const g2 = makeGroup('g2', ['ka'], ['g1'])
    const atRatio = (masteredCount: number): Record<string, Progress> =>
      pmOf(
        ids
          .slice(0, masteredCount)
          .map((id): [string, SrsState] => [id, '已掌握']),
      )
    expect(isKanaGroupUnlocked(g2, [g1, g2], atRatio(4))).toBe(true)
    expect(isKanaGroupUnlocked(g2, [g1, g2], atRatio(3))).toBe(false)
  })

  it('门控开关关闭时全部解锁', () => {
    const g1 = makeGroup('g1', ['a'])
    const g2 = makeGroup('g2', ['ka'], ['g1'])
    expect(isKanaGroupUnlocked(g2, [g1, g2], {}, false)).toBe(true)
  })

  it('前置关数据缺失时不锁死用户', () => {
    const g2 = makeGroup('g2', ['ka'], ['ghost'])
    expect(isKanaGroupUnlocked(g2, [g2], {})).toBe(true)
  })

  it('多个前置关需**全部**达标', () => {
    const g1 = makeGroup('g1', ['a'])
    const g2 = makeGroup('g2', ['i'])
    const g3 = makeGroup('g3', ['ka'], ['g1', 'g2'])
    const pm = pmOf([['a', '已掌握']])
    expect(isKanaGroupUnlocked(g3, [g1, g2, g3], pm)).toBe(false)
    pm[kanaProgressKey('i')] = progressOf('i', '已掌握')
    expect(isKanaGroupUnlocked(g3, [g1, g2, g3], pm)).toBe(true)
  })

  it('已掌握率：仅统计「已掌握」，学习中不计入', () => {
    const group = makeGroup('g', ['a', 'i'])
    expect(kanaGroupMasteredRatio(group, pmOf([['a', '学习中']]))).toBe(0)
    expect(kanaGroupMasteredRatio(group, pmOf([['a', '已掌握']]))).toBe(0.5)
  })
})

describe('engine/kana · 续学定位与结业判据（A9）', () => {
  it('首个未掌握音的序号；全掌握返回越界哨兵（= 音数）', () => {
    const group = makeGroup('g', ['a', 'i', 'u'])
    expect(firstUnmasteredIndex(group, {})).toBe(0)
    expect(firstUnmasteredIndex(group, pmOf([['a', '已掌握']]))).toBe(1)
    // 全掌握**不回落 0**：0 与「第 0 个音未掌握」同值，漏判 isFull 的调用方会原地空转。
    expect(
      firstUnmasteredIndex(
        group,
        pmOf([
          ['a', '已掌握'],
          ['i', '已掌握'],
          ['u', '已掌握'],
        ]),
      ),
    ).toBe(3)
  })

  it('缺 1 音即未结业', () => {
    const groups = [makeGroup('g1', ['a']), makeGroup('g2', ['i'])]
    expect(isKanaFullyMastered(groups, pmOf([['a', '已掌握']]))).toBe(false)
    expect(
      isKanaFullyMastered(
        groups,
        pmOf([
          ['a', '已掌握'],
          ['i', '已掌握'],
        ]),
      ),
    ).toBe(true)
  })

  it('空数据不算结业', () => {
    expect(isKanaFullyMastered([], {})).toBe(false)
  })
})

describe('engine/kana · 罗马音判定（A11 容错表）', () => {
  const shi = makeKana('shi', 'g', 'shi', ['shi', 'si'])

  it('接受全部登记变体，忽略大小写与分隔符', () => {
    for (const input of ['shi', 'SHI', ' si ', 'Si', 's-h-i']) {
      expect(matchKanaRomaji(input, shi)).toBe(true)
    }
    expect(matchKanaRomaji('tsu', shi)).toBe(false)
  })

  it('空输入判错（不把空串当成"跳过"）', () => {
    expect(matchKanaRomaji('', shi)).toBe(false)
    expect(matchKanaRomaji('   ', shi)).toBe(false)
  })

  it('同音异形对（じ ↔ ぢ）在真实数据中被判定为罗马音不安全', () => {
    const ji = repository.getKanaById('ji')
    const di = repository.getKanaById('di')
    const zu = repository.getKanaById('zu')
    const du = repository.getKanaById('du')
    expect(ji).toBeDefined()
    expect(di).toBeDefined()
    expect(isRomajiQuizSafe(ji!, repository.getAllKana())).toBe(false)
    expect(isRomajiQuizSafe(di!, repository.getAllKana())).toBe(false)
    expect(isRomajiQuizSafe(zu!, repository.getAllKana())).toBe(false)
    expect(isRomajiQuizSafe(du!, repository.getAllKana())).toBe(false)
  })

  it('常规音与を 的罗马音是安全的（不误伤）', () => {
    for (const id of ['a', 'o', 'wo', 'n', 'ka', 'shi', 'cha']) {
      const item = repository.getKanaById(id)
      expect(item, id).toBeDefined()
      expect(isRomajiQuizSafe(item!, repository.getAllKana()), id).toBe(true)
    }
  })
})

describe('engine/kana · 干扰项与出题（A3 / A4）', () => {
  it('干扰项优先取易混集，且不含题干自身、不超量', () => {
    const shi = repository.getKanaById('shi')!
    const picked = pickKanaDistractors(shi, repository.getAllKana(), 3)
    expect(picked).toHaveLength(3)
    expect(picked.map((item) => item.id)).toContain('tsu')
    expect(picked.map((item) => item.id)).not.toContain('shi')
  })

  it('关内每音恰好一题，题型按序轮转', () => {
    const group = repository.getKanaGroupById('g01')!
    const quiz = buildKanaQuiz(group, repository.getAllKana())
    expect(quiz).toHaveLength(group.kanaIds.length)
    expect(new Set(quiz.map((item) => item.targetId)).size).toBe(quiz.length)
    expect(quiz[0].kind).toBe('listenToKana')
    expect(quiz[1].kind).toBe('kanaToRomaji')
  })

  it('同一状态下反复出题结果完全一致（零随机契约）', () => {
    const group = repository.getKanaGroupById('g01')!
    const first = buildKanaQuiz(group, repository.getAllKana())
    const second = buildKanaQuiz(group, repository.getAllKana())
    expect(JSON.stringify(first)).toBe(JSON.stringify(second))
  })

  it('选择题选项数达标、含正确答案、无重复；答案不恒在首位', () => {
    const all = repository.getAllKana()
    for (const group of repository.getKanaGroups()) {
      for (const question of buildKanaQuiz(group, all)) {
        if (question.kind === 'typeRomaji') {
          expect(question.options).toHaveLength(0)
          continue
        }
        expect(question.options).toHaveLength(KANA_QUIZ_OPTION_COUNT)
        expect(question.options).toContain(question.answer)
        expect(new Set(question.options).size).toBe(question.options.length)
      }
    }
    // 答案位置随题序左移：至少存在一题答案不在首位。
    const g01 = buildKanaQuiz(repository.getKanaGroupById('g01')!, all)
    const positions: number[] = []
    for (const item of g01) {
      if (item.kind === 'typeRomaji') {
        continue
      }
      positions.push(item.options.indexOf(item.answer))
    }
    expect(positions.some((position) => position !== 0)).toBe(true)
  })

  it('罗马音不安全的音自动降级为听音题（不会出现双正确答案）', () => {
    const all = repository.getAllKana()
    const ji = repository.getKanaById('ji')!
    // 直接请求罗马音类题型也必须被降级
    expect(resolveQuizKind('kanaToRomaji', ji, all)).toBe('listenToKana')
    expect(resolveQuizKind('romajiToKana', ji, all)).toBe('listenToKana')
    expect(resolveQuizKind('typeRomaji', ji, all)).toBe('listenToKana')
    // 听音 / 平片互译不受影响
    expect(resolveQuizKind('listenToKana', ji, all)).toBe('listenToKana')
    expect(resolveQuizKind('scriptSwap', ji, all)).toBe('scriptSwap')

    // 真实出题路径：が・ざ行（含 じ）中不应出现依赖罗马音的选择题
    const za = repository.getKanaGroupById('g06')!
    for (const question of buildKanaQuiz(za, all)) {
      if (
        question.kind === 'kanaToRomaji' ||
        question.kind === 'romajiToKana'
      ) {
        const target = repository.getKanaById(question.targetId)!
        expect(isRomajiQuizSafe(target, all), question.targetId).toBe(true)
      }
    }
  })

  it('平片互译按题序交替方向', () => {
    const group = repository.getKanaGroupById('g01')!
    const quiz = buildKanaQuiz(group, repository.getAllKana(), ['scriptSwap'])
    expect(quiz[0].prompt).toBe('あ')
    expect(quiz[0].answer).toBe('ア')
    expect(quiz[1].prompt).toBe('イ')
    expect(quiz[1].answer).toBe('い')
  })
})

describe('engine/kana · 真实数据完整性（A10）', () => {
  it('104 音 / 12 关 / id 唯一 / 每音至少 1 条应用实例', () => {
    const all = repository.getAllKana()
    const groups = repository.getKanaGroups()
    expect(all).toHaveLength(104)
    expect(groups).toHaveLength(12)
    expect(new Set(all.map((item) => item.id)).size).toBe(104)
    expect(new Set(all.map((item) => item.hiragana)).size).toBe(104)
    expect(new Set(all.map((item) => item.katakana)).size).toBe(104)
    for (const item of all) {
      expect(item.examples.length, item.id).toBeGreaterThanOrEqual(1)
      expect(item.romajiAliases.length, item.id).toBeGreaterThanOrEqual(1)
    }
  })

  it('关卡覆盖全部假名且不重叠', () => {
    const ids = repository.getKanaGroups().flatMap((group) => group.kanaIds)
    expect(ids).toHaveLength(104)
    expect(new Set(ids).size).toBe(104)
  })

  it('关内音序与数据行声明序一致（清音行先于浊音行）', () => {
    expect(repository.getKanaByGroup('g01').map((item) => item.id)).toEqual([
      'a',
      'i',
      'u',
      'e',
      'o',
      'ka',
      'ki',
      'ku',
      'ke',
      'ko',
    ])
  })

  it('字源：清音有、浊音与拗音无（构成关系不伪装成独立字源）', () => {
    expect(repository.getKanaById('a')?.origin?.hiragana.char).toBe('安')
    expect(repository.getKanaById('a')?.origin?.katakana.char).toBe('阿')
    for (const id of ['ga', 'pa', 'kya']) {
      expect(repository.getKanaById(id)?.origin, id).toBeUndefined()
    }
  })

  it('拗音基准音指向本行大書き假名（きゃ → き，じゃ → じ）', () => {
    expect(repository.getKanaById('kya')?.baseKanaId).toBe('ki')
    expect(repository.getKanaById('ja')?.baseKanaId).toBe('ji')
    expect(repository.getKanaById('pya')?.baseKanaId).toBe('pi')
    expect(repository.getKanaById('ga')?.baseKanaId).toBe('ka')
    expect(repository.getKanaById('di')?.baseKanaId).toBe('chi')
  })
})

describe('K 域 · 行（音表横轴）数据完整性', () => {
  /** 按 `row` 分组的音。 */
  function rowsOf(): Map<string, Kana[]> {
    const byRow = new Map<string, Kana[]>()
    for (const item of repository.getAllKana()) {
      const list = byRow.get(item.row)
      if (list === undefined) {
        byRow.set(item.row, [item])
        continue
      }
      list.push(item)
    }
    return byRow
  }

  it('共 27 行，同一行不跨关、不跨音类', () => {
    const byRow = rowsOf()
    expect(byRow.size).toBe(27)
    for (const [row, items] of byRow) {
      // 跨关 → 音表会把同一行画到两处；跨音类 → 浊音混进清音行，行首完成度分母失真。
      expect(new Set(items.map((item) => item.groupId)).size, row).toBe(1)
      expect(new Set(items.map((item) => item.voiceType)).size, row).toBe(1)
    }
  })

  it('行内 `vowel` 互不重复（每行每个段至多一格）', () => {
    for (const [row, items] of rowsOf()) {
      expect(new Set(items.map((item) => item.vowel)).size, row).toBe(
        items.length,
      )
    }
  })

  it('段列固定为 a/i/u/e/o/n，ん 是唯一的 n 段', () => {
    const vowels = new Set(repository.getAllKana().map((item) => item.vowel))
    expect([...vowels].sort()).toEqual(['a', 'e', 'i', 'n', 'o', 'u'])
    const nRow = repository.getAllKana().filter((item) => item.vowel === 'n')
    expect(nRow.map((item) => item.id)).toEqual(['n'])
  })
})

describe('K 域 · 结业测验抽样（设计 §5.4）', () => {
  it('抽 20 题、两两不同、且跨关铺开', () => {
    const picked = pickFinalQuizTargets(repository.getAllKana())
    expect(picked).toHaveLength(20)
    expect(new Set(picked.map((item) => item.id)).size).toBe(20)
    // 步长 5 与 104 互质 → 取到的音分散在清音/浊音/半浊音/拗音各区。
    // 这条断言是为了防止有人把步长改成 1（那样前 20 题全落在清音 5 关内，
    // 「结业测验」会悄悄退化成「清音测验」）。
    expect(new Set(picked.map((item) => item.groupId)).size).toBeGreaterThan(5)
  })

  it('确定性：同一输入两次调用结果完全一致（零随机红线）', () => {
    const all = repository.getAllKana()
    const first = pickFinalQuizTargets(all).map((item) => item.id)
    const second = pickFinalQuizTargets(all).map((item) => item.id)
    expect(second).toEqual(first)
  })

  it('步长与总数不互质时按原顺序补齐：不重复、也不短题', () => {
    const all = repository.getAllKana().slice(0, 10)
    // 10 与 4 不互质：`i*4 % 10` 只会命中 {0,2,4,6,8} 五个下标。
    const picked = pickFinalQuizTargets(all, 6, 4)
    expect(picked).toHaveLength(6)
    expect(new Set(picked.map((item) => item.id)).size).toBe(6)
    // 补齐项必须是「按顺序的第一个未取者」（确定性，不是随机挑的）。
    expect(picked[5]?.id).toBe(all[1]?.id)
  })

  it('count 超过总数时取满全表，不越界不重复', () => {
    const all = repository.getAllKana().slice(0, 3)
    const picked = pickFinalQuizTargets(all, 20)
    expect(picked.map((item) => item.id)).toEqual(all.map((item) => item.id))
  })

  it('空表返回空数组（不抛错）', () => {
    expect(pickFinalQuizTargets([])).toEqual([])
  })
})

describe('K 域 · 拆音（P3 衔接，设计 §5.6）', () => {
  it('拗音合为一拍；促音 / 长音 / 拨音各自成拍', () => {
    expect(splitKanaMora('ぎゃく')).toEqual(['ぎゃ', 'く'])
    expect(splitKanaMora('きょう')).toEqual(['きょ', 'う'])
    expect(splitKanaMora('がっこう')).toEqual(['が', 'っ', 'こ', 'う'])
    expect(splitKanaMora('コーヒー')).toEqual(['コ', 'ー', 'ヒ', 'ー'])
    expect(splitKanaMora('ほん')).toEqual(['ほ', 'ん'])
  })

  it('片假名拗音同样合并', () => {
    expect(splitKanaMora('キャ')).toEqual(['キャ'])
  })

  it('非假名字符各自成拍，不与相邻假名合并', () => {
    expect(splitKanaMora('a・きゃ')).toEqual(['a', '・', 'きゃ'])
  })

  it('连续小写假名不链式合并（守卫按上一拍**末字符**判定）', () => {
    // 合并过一拍后 previous 是 2 个字符，若拿整拍去查 KANA_SMALL_KANA（单字符表）
    // 守卫恒失效，会把 `きゃゃ` 并成 1 拍。回归锁定。
    expect(splitKanaMora('きゃゃ')).toEqual(['きゃ', 'ゃ'])
    expect(splitKanaMora('キャャ')).toEqual(['キャ', 'ャ'])
    // 三段非法输入同理：只并前两拍，第三个仍独立。
    expect(splitKanaMora('きゃゃゃ')).toEqual(['きゃ', 'ゃ', 'ゃ'])
  })

  it('合拗音 ゎ / ヮ 参与合并（刻意保留，不是漏项）', () => {
    expect(splitKanaMora('くゎ')).toEqual(['くゎ'])
    expect(splitKanaMora('クヮ')).toEqual(['クヮ'])
  })

  it('空串返回空数组', () => {
    expect(splitKanaMora('')).toEqual([])
  })

  it('字形索引：平片两写字形指向同一个音；促音 / 长音无对应音', () => {
    const index = buildKanaGlyphIndex(repository.getAllKana())
    expect(index.get('きゃ')?.id).toBe('kya')
    expect(index.get('キャ')?.id).toBe('kya')
    expect(index.get('ん')?.id).toBe('n')
    // っ（促音）与 ー（长音）不是独立音，拆音格子里应表现为不可点。
    expect(index.get('っ')).toBeUndefined()
    expect(index.get('ー')).toBeUndefined()
  })
})
