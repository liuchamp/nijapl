import {
  KANA_FINAL_QUIZ_SIZE,
  KANA_FINAL_QUIZ_STRIDE,
  KANA_QUIZ_KINDS,
  KANA_QUIZ_OPTION_COUNT,
  KANA_SMALL_KANA,
  KANA_UNLOCK_RATIO,
  kanaProgressKey,
} from '../constants/kana.js'
import type {
  Kana,
  KanaGroup,
  KanaQuizKind,
  KanaQuizQuestion,
} from '../types/kana.js'
import type { Progress } from '../types/progress.js'
import { mean, STATE_SCORE } from './progress.js'

/**
 * K 域（五十音）纯引擎（设计 §8.1）。
 *
 * 约束（与 `srs.ts` / `progress.ts` 同规格）：
 * - **纯函数**：零框架、零端口、零时间依赖（`now` 由调用方注入）；
 * - **零随机**：出题、干扰项、选项摆放全部确定性（对齐 AGENTS.md「零随机 / 固定契约」红线）；
 * - **复用不重写**：完成度复用 `progress.ts` 的 `STATE_SCORE` 与 `mean`，
 *   状态推进复用 `srs.ts` 的五态机——本文件**不实现**任何状态迁移。
 */

// ——————————————————————————————————————
// 完成度 / 解锁
//
// **进度表寻址约定**：`KanaGroup.kanaIds` 存的是**裸 id**（`ka`），
// 而 `progress` 的 key 是**带前缀的** `kana:ka`。本文件统一在读取处调用
// {@link kanaProgressKey} 做前缀转换 —— 只有这一处需要记住这个映射，
// 调用方（页面 / selector）永远不会「忘记加前缀」而静默拿到 0 完成度。
// ——————————————————————————————————————

/** 单音完成度：0..1；未出现（`seen=false`）返回 0。 */
export function kanaCompletion(p: Progress | undefined): number {
  if (p === undefined || !p.seen) {
    return 0
  }
  return STATE_SCORE[p.state]
}

/** 关完成度：关内音完成度均值；空关返回 0。 */
export function kanaGroupCompletion(
  group: KanaGroup,
  pm: Record<string, Progress>,
): number {
  if (group.kanaIds.length === 0) {
    return 0
  }
  return mean(
    group.kanaIds.map((id) => kanaCompletion(pm[kanaProgressKey(id)])),
  )
}

/** 关已掌握率：`已掌握` 音数 / 总音数；空关返回 0。**解锁判据用此值。** */
export function kanaGroupMasteredRatio(
  group: KanaGroup,
  pm: Record<string, Progress>,
): number {
  if (group.kanaIds.length === 0) {
    return 0
  }
  let mastered = 0
  for (const id of group.kanaIds) {
    if (pm[kanaProgressKey(id)]?.state === '已掌握') {
      mastered += 1
    }
  }
  return mastered / group.kanaIds.length
}

/** 五十音总完成度：12 关完成度均值；无关卡返回 0。 */
export function overallKanaCompletion(
  groups: readonly KanaGroup[],
  pm: Record<string, Progress>,
): number {
  return mean(groups.map((group) => kanaGroupCompletion(group, pm)))
}

/**
 * 关是否解锁。
 *
 * - `unlockEnabled === false`（P9「假名基础 · 解锁规则」关闭）→ 全部解锁；
 * - 无前置关 → 解锁；
 * - 否则前置关**全部**满足 `kanaGroupMasteredRatio >= ratio` 才解锁。
 *
 * 与 `selectStageUnlocked` 口径一致（差集：此处无「冲刺期」这类哨兵阶段）。
 */
export function isKanaGroupUnlocked(
  group: KanaGroup,
  groups: readonly KanaGroup[],
  pm: Record<string, Progress>,
  unlockEnabled = true,
  ratio = KANA_UNLOCK_RATIO,
): boolean {
  if (!unlockEnabled) {
    return true
  }
  if (group.prerequisiteGroupIds.length === 0) {
    return true
  }
  const byId = new Map(groups.map((item) => [item.id, item]))
  for (const prerequisiteId of group.prerequisiteGroupIds) {
    const prerequisite = byId.get(prerequisiteId)
    // 前置关数据缺失时不"锁死"用户：视为已满足（与 selectStageUnlocked 的兜底同向）。
    if (prerequisite === undefined) {
      continue
    }
    if (kanaGroupMasteredRatio(prerequisite, pm) < ratio) {
      return false
    }
  }
  return true
}

/**
 * 关内首个未掌握音的序号（续学定位）。
 *
 * **全掌握时返回 `group.kanaIds.length`** —— 一个**越界哨兵**，明确表达
 * 「本关没有未掌握的音」，而不是回落 `0`：`0` 与「第 0 个音未掌握」同值，
 * 调用方一旦漏判 `isFull` 就会把「已学完」误读成「从头上」，表现为续学按钮点了原地空转。
 * 空关同样返回 `0`（`length === 0`）。
 *
 * 调用方**必须**先判「本关已满」（`kanaGroupMasteredRatio(...) >= 1`）；
 * 现有三处调用（`selectKanaContinueTarget` ×2、`selectKanaNextGroup`）均满足该前置。
 */
export function firstUnmasteredIndex(
  group: KanaGroup,
  pm: Record<string, Progress>,
): number {
  for (let index = 0; index < group.kanaIds.length; index += 1) {
    if (pm[kanaProgressKey(group.kanaIds[index])]?.state !== '已掌握') {
      return index
    }
  }
  return group.kanaIds.length
}

/** 是否 12 关假名**全部**已掌握（结业判据，用于首页徽章与 N5 引导）。 */
export function isKanaFullyMastered(
  groups: readonly KanaGroup[],
  pm: Record<string, Progress>,
): boolean {
  const ids = groups.flatMap((group) => group.kanaIds)
  if (ids.length === 0) {
    return false
  }
  for (const id of ids) {
    if (pm[kanaProgressKey(id)]?.state !== '已掌握') {
      return false
    }
  }
  return true
}

// ——————————————————————————————————————
// 罗马音判定
// ——————————————————————————————————————

/** 归一化罗马音输入：去首尾空白、转小写、去掉分隔符。 */
function normalizeRomaji(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[\s\-'.]/g, '')
}

/** 该音的全部合法罗马音写法（含变体）的归一化集合。 */
function aliasSet(item: Kana): Set<string> {
  const set = new Set<string>()
  for (const alias of item.romajiAliases) {
    set.add(normalizeRomaji(alias))
  }
  return set
}

/**
 * 该音是否适合出「罗马音类」题（假名选罗马音 / 罗马音选假名 / 输入罗马音）。
 *
 * 判据：与**任何其它音**的合法写法集合无交集。
 * 典型不安全项：`じ`(ji) ↔ `ぢ`(di/ji) 、`ず`(zu) ↔ `づ`(du/zu)——
 * 它们同音异形，出选择题会出现**两个正确答案**，必须降级为听音题。
 *
 * 这是**数据驱动**的判定，不维护黑名单：一旦变体表调整，安全性自动跟随。
 */
export function isRomajiQuizSafe(target: Kana, all: readonly Kana[]): boolean {
  const mine = aliasSet(target)
  for (const other of all) {
    if (other.id === target.id) {
      continue
    }
    for (const alias of aliasSet(other)) {
      if (mine.has(alias)) {
        return false
      }
    }
  }
  return true
}

/** 罗马音作答判定（大小写不敏感、去分隔符、接受变体）。 */
export function matchKanaRomaji(input: string, target: Kana): boolean {
  const normalized = normalizeRomaji(input)
  if (normalized === '') {
    return false
  }
  for (const alias of target.romajiAliases) {
    if (normalizeRomaji(alias) === normalized) {
      return true
    }
  }
  return false
}

// ——————————————————————————————————————
// 出题
// ——————————————————————————————————————

/** 该题型是否依赖罗马音文本（用于歧义降级判定）。 */
function needsRomaji(kind: KanaQuizKind): boolean {
  return (
    kind === 'kanaToRomaji' || kind === 'romajiToKana' || kind === 'typeRomaji'
  )
}

/** 题型 → 选项文本取法。 */
function optionTextOf(kind: KanaQuizKind, item: Kana, index: number): string {
  switch (kind) {
    case 'listenToKana':
      return item.hiragana
    case 'kanaToRomaji':
      return item.romaji
    case 'romajiToKana':
      return item.hiragana
    case 'scriptSwap':
      // 偶数题「平 → 片」，奇数题「片 → 平」
      return index % 2 === 0 ? item.katakana : item.hiragana
    case 'typeRomaji':
      return item.romaji
  }
}

/** 题型 → 题干文本。`listenToKana` 无文本（靠播放发音），返回空串。 */
function promptOf(kind: KanaQuizKind, item: Kana, index: number): string {
  switch (kind) {
    case 'listenToKana':
      return ''
    case 'kanaToRomaji':
      return item.hiragana
    case 'romajiToKana':
      return item.romaji
    case 'scriptSwap':
      return index % 2 === 0 ? item.hiragana : item.katakana
    case 'typeRomaji':
      return item.hiragana
  }
}

/**
 * 干扰项候选（优先级由高到低，**固定顺序**）：
 * ① 易混集（数据里的 `confusable`，已按人工核定顺序）→ ② 同关同段 →
 * ③ 同关（数据行序）→ ④ 同音类（数据序）。
 *
 * 返回条数不超过 `count`，顺序完全由数据序决定，**不含随机**。
 */
export function pickKanaDistractors(
  target: Kana,
  all: readonly Kana[],
  count: number,
): Kana[] {
  const picked: Kana[] = []
  const seen = new Set<string>([target.id])
  const take = (candidate: Kana): void => {
    if (picked.length >= count || seen.has(candidate.id)) {
      return
    }
    seen.add(candidate.id)
    picked.push(candidate)
  }

  const byId = new Map(all.map((item) => [item.id, item]))
  for (const id of target.confusable) {
    const item = byId.get(id)
    if (item !== undefined) {
      take(item)
    }
  }
  for (const item of all) {
    if (item.groupId === target.groupId && item.vowel === target.vowel) {
      take(item)
    }
  }
  for (const item of all) {
    if (item.groupId === target.groupId) {
      take(item)
    }
  }
  for (const item of all) {
    if (item.voiceType === target.voiceType) {
      take(item)
    }
  }
  return picked
}

/** 确定性选项摆放：把答案按题序左移，避免正确答案恒在第 1 位。 */
function rotateOptions(options: string[], shift: number): string[] {
  if (options.length === 0) {
    return options
  }
  const offset = ((shift % options.length) + options.length) % options.length
  return [...options.slice(offset), ...options.slice(0, offset)]
}

/** 收集至多 `count - 1` 个干扰文本（去重、排除与答案同文本）。 */
function collectDistractorTexts(
  kind: KanaQuizKind,
  target: Kana,
  all: readonly Kana[],
  index: number,
  answer: string,
  count: number,
): string[] {
  const texts: string[] = []
  const consider = (candidate: Kana): void => {
    if (texts.length >= count - 1) {
      return
    }
    const text = optionTextOf(kind, candidate, index)
    if (text === answer || texts.includes(text)) {
      return
    }
    texts.push(text)
  }
  // 先按优先级要一批候选（多要一些，给去重留余量），再从全量兜底补位。
  for (const candidate of pickKanaDistractors(target, all, count * 4)) {
    consider(candidate)
  }
  for (const candidate of all) {
    consider(candidate)
  }
  return texts
}

/** 解析实际可用的题型：罗马音不安全时降级为听音选假名。 */
export function resolveQuizKind(
  requested: KanaQuizKind,
  target: Kana,
  all: readonly Kana[],
): KanaQuizKind {
  if (needsRomaji(requested) && !isRomajiQuizSafe(target, all)) {
    return 'listenToKana'
  }
  return requested
}

// ——————————————————————————————————————
// 假名词拆音（P3 词汇详解的「拆音」入口）
// ——————————————————————————————————————

/** 是否为假名字符（平假名 / 片假名 Unicode 区段）。 */
function isKanaChar(char: string): boolean {
  const code = char.codePointAt(0) ?? 0
  // ひらがな U+3041..U+3096、かたかな U+30A1..U+30FA。
  // 刻意不含 U+30FC（長音符「ー」）：它是「拍内元素」不是假名，但按本设计的规则各自成拍，
  // 与 `KANA_SMALL_KANA` 的合并判断无关，故不必也不应算作「可被合并的假名」。
  return (
    (code >= 0x3041 && code <= 0x3096) || (code >= 0x30a1 && code <= 0x30fa)
  )
}

/**
 * 把假名词按「音拍（mora）」切分（P3 拆音，设计 §5.6）。
 *
 * 规则（纯字符判定，零词典、零随机）：
 * - **小写假名与前一个假名合并成一拍**（`きゃ` = 1 拍）；前一个不是假名时不合并，
 *   避免把标点粘进音里；
 * - **不链式合并**：合并后的这一拍不再吞下一个后续小写假名 ——
 *   `きゃゃ` → `['きゃ','ゃ']`（2 拍）。判定看上一拍的**末字符**，见下方实现注释；
 * - 其余字符各成**独立一拍**：`っ`（促音）、`ー`（长音）、`ん`（拨音）都算一拍；
 * - 非假名字符（`・`、拉丁字母等）各自成拍，交由调用方决定是否可点。
 *
 * 例：`ぎゃく` → `['ぎゃ','く']`；`がっこう` → `['が','っ','こ','う']`；`コーヒー` → `['コ','ー','ヒ','ー']`。
 */
export function splitKanaMora(text: string): string[] {
  const mora: string[] = []
  for (const char of text) {
    const previous = mora[mora.length - 1]
    // 判定必须落在上一拍的**末字符**上：`previous` 合并一次后是 2 个字符（`きゃ`），
    // 而 `KANA_SMALL_KANA` 与 `isKanaChar` 都是**单字符**口径 ——
    // 直接传 `previous` 会让 `includes('きゃ')` 恒为 false、`codePointAt(0)` 恒取到 `き`：
    // 守卫「永远为真」与「永远为假」各一处，结果是 `きゃゃ` 被并成一拍，
    // 与「不链式合并」的规则相悖（靠错得一致才没炸，属于偶然而非正确）。
    const tail = previous === undefined ? '' : previous.slice(-1)
    if (
      tail !== '' &&
      KANA_SMALL_KANA.includes(char) &&
      isKanaChar(tail) &&
      // 上一拍末尾本身是小写假名时不再链式合并（`きゃゃ` 这种非法输入不该并成一拍）。
      !KANA_SMALL_KANA.includes(tail)
    ) {
      mora[mora.length - 1] = `${previous}${char}`
      continue
    }
    mora.push(char)
  }
  return mora
}

/**
 * 「平 / 片假名字形 → Kana」索引（拆音格子在 `repository` 里反查用）。
 *
 * 同一个字形可能同时是别的音的别名（`じ` / `ぢ` 的罗马音相同但字形不同，不冲突），
 * 而 `hiragana` / `katakana` 在数据层已被校验为**全局唯一**，故映射无歧义。
 */
export function buildKanaGlyphIndex(all: readonly Kana[]): Map<string, Kana> {
  const index = new Map<string, Kana>()
  for (const item of all) {
    index.set(item.hiragana, item)
    index.set(item.katakana, item)
  }
  return index
}

/**
 * 生成一组测验题（**确定性**：同一输入反复调用结果完全一致）。
 *
 * - 题数 = `targets.length`，**每个音恰好一题**（保证覆盖度，不重复出题）；
 * - 题型按 `kinds[index % kinds.length]` 轮转，因此题型分布均匀；
 * - 干扰项从 `all` 里挑（可用全表，跨关干扰更难）；
 * - 题型⑤「输入罗马音」无选项（`options: []`），由页面渲染输入框。
 *
 * 这是「一关的测验」与「结业测验」的**共同底座**：两者只差 `targets` 的取法。
 */
export function buildKanaQuestions(
  targets: readonly Kana[],
  all: readonly Kana[],
  kinds: readonly KanaQuizKind[] = KANA_QUIZ_KINDS,
): KanaQuizQuestion[] {
  const kindsSafe = kinds.length > 0 ? kinds : KANA_QUIZ_KINDS
  return targets.map((target, index) => {
    const kind = resolveQuizKind(
      kindsSafe[index % kindsSafe.length],
      target,
      all,
    )
    const answer = optionTextOf(kind, target, index)
    if (kind === 'typeRomaji') {
      return {
        kind,
        targetId: target.id,
        prompt: promptOf(kind, target, index),
        answer,
        options: [],
      }
    }
    const distractors = collectDistractorTexts(
      kind,
      target,
      all,
      index,
      answer,
      KANA_QUIZ_OPTION_COUNT,
    )
    return {
      kind,
      targetId: target.id,
      prompt: promptOf(kind, target, index),
      answer,
      options: rotateOptions([answer, ...distractors], index),
    }
  })
}

/** 生成一关的测验题（每关音数 = 题数）。 */
export function buildKanaQuiz(
  group: KanaGroup,
  all: readonly Kana[],
  kinds: readonly KanaQuizKind[] = KANA_QUIZ_KINDS,
): KanaQuizQuestion[] {
  return buildKanaQuestions(
    all.filter((item) => item.groupId === group.id),
    all,
    kinds,
  )
}

/**
 * 结业测验的抽样：从全表按 `i * stride % length` **确定性**取样（设计 §5.4）。
 *
 * 抽样而非全考：104 题太长，20 题足以在 80% 阈值下暴露「哪几个音没记牢」。
 * 步长与总数不互质时会绕回已取过的音，此时按**原顺序补齐**剩余的位，
 * 保证「题数达标」与「确定性」两个契约同时成立。
 */
export function pickFinalQuizTargets(
  all: readonly Kana[],
  count: number = KANA_FINAL_QUIZ_SIZE,
  stride: number = KANA_FINAL_QUIZ_STRIDE,
): Kana[] {
  const total = all.length
  if (total === 0) {
    return []
  }
  const target = Math.min(Math.max(count, 0), total)
  // 要与全表一样多时**按原顺序**返回：抽样步长是为了「跨关铺开」，
  // 已经覆盖全表时按步长打乱顺序只会让题目顺序变得莫名其妙（且不利于对照排查）。
  if (target >= total) {
    return [...all]
  }
  const picked: Kana[] = []
  const used = new Set<number>()
  const take = (index: number): void => {
    if (used.has(index)) {
      return
    }
    used.add(index)
    const item = all[index]
    if (item !== undefined) {
      picked.push(item)
    }
  }
  for (let step = 0; step < total && picked.length < target; step += 1) {
    take((step * stride) % total)
  }
  for (let index = 0; index < total && picked.length < target; index += 1) {
    take(index)
  }
  return picked
}
