import grammarJson from '../../data/build/grammar.json'
import kanaJson from '../../data/build/kana.json'
import modulesJson from '../../data/build/modules.json'
import sentencesJson from '../../data/build/sentences.json'
import stagesJson from '../../data/build/stages.json'
import wordsJson from '../../data/build/words.json'
import type {
  BuildData,
  Grammar,
  Module,
  Sentence,
  Stage,
  Word,
} from '../types/domain.js'
import type { Kana, KanaData, KanaGroup, KanaVoiceType } from '../types/kana.js'

/**
 * 运行时数据：`data/build/*.json` 的组装结果。
 * 这是唯一的数据入口；来源（seed/ai/human）对上层透明。
 */
const rawBuildData = {
  stages: stagesJson,
  modules: modulesJson,
  words: wordsJson,
  grammars: grammarJson,
  sentences: sentencesJson,
}

export const buildData = rawBuildData as unknown as BuildData

/**
 * K 域（五十音）运行时数据：独立文件 **不并入** `BuildData`
 * （`ARCH §8.7` W 域数据契约冻结，见设计 §7.2）。
 */
const rawKanaData = kanaJson as unknown as KanaData

export const kanaBuildData = rawKanaData

function indexBy<T>(
  items: readonly T[],
  key: (item: T) => string,
): Map<string, T> {
  const map = new Map<string, T>()
  for (const item of items) {
    map.set(key(item), item)
  }
  return map
}

function pushInto<T>(map: Map<string, T[]>, key: string, value: T): void {
  const list = map.get(key)
  if (list === undefined) {
    map.set(key, [value])
    return
  }
  list.push(value)
}

function groupBy<T>(
  items: readonly T[],
  key: (item: T) => string,
): Map<string, T[]> {
  const map = new Map<string, T[]>()
  for (const item of items) {
    pushInto(map, key(item), item)
  }
  return map
}

/**
 * 数据仓库：加载构建产物并建立索引，提供**纯查询**接口。
 * 不做任何来源分支（CSV/seed 等），真实数据替换仅改 JSON。
 */
export class DataRepository {
  private readonly data: BuildData
  private readonly stageById: Map<string, Stage>
  private readonly modulesByStageId: Map<string, Module[]>
  private readonly wordsByModuleId: Map<string, Word[]>
  private readonly wordsByStageId: Map<string, Word[]>
  private readonly wordById: Map<string, Word>
  private readonly grammarById: Map<string, Grammar>
  private readonly sentencesByWordId: Map<string, Sentence[]>
  private readonly sentencesByGrammarId: Map<string, Sentence[]>
  private readonly kana: KanaData
  private readonly kanaById: Map<string, Kana>
  private readonly kanaGroupById: Map<string, KanaGroup>
  private readonly kanaByGroupId: Map<string, Kana[]>
  private readonly kanaByVoiceType: Map<string, Kana[]>

  constructor(data: BuildData, kanaData: KanaData = rawKanaData) {
    this.data = data
    this.stageById = indexBy(data.stages, (s) => s.id)
    this.modulesByStageId = groupBy(data.modules, (m) => m.stageId)
    this.wordsByModuleId = groupBy(data.words, (w) => w.moduleId)
    this.wordsByStageId = groupBy(data.words, (w) => w.stageId)
    this.wordById = indexBy(data.words, (w) => w.id)
    this.grammarById = indexBy(data.grammars, (g) => g.id)

    this.sentencesByWordId = new Map<string, Sentence[]>()
    this.sentencesByGrammarId = new Map<string, Sentence[]>()
    for (const sentence of data.sentences) {
      for (const sw of sentence.words) {
        pushInto(this.sentencesByWordId, sw.wordId, sentence)
      }
      for (const sg of sentence.grammars) {
        pushInto(this.sentencesByGrammarId, sg.grammarId, sentence)
      }
    }

    this.kana = kanaData
    this.kanaById = indexBy(kanaData.kana, (k) => k.id)
    this.kanaGroupById = indexBy(kanaData.groups, (g) => g.id)
    this.kanaByGroupId = groupBy(kanaData.kana, (k) => k.groupId)
    this.kanaByVoiceType = groupBy(kanaData.kana, (k) => k.voiceType)
  }

  /** 全部阶段，按 order 升序。 */
  getStages(): Stage[] {
    return [...this.data.stages].sort((a, b) => a.order - b.order)
  }

  getStageById(id: string): Stage | undefined {
    return this.stageById.get(id)
  }

  /** 某阶段下的模块。 */
  getModules(stageId: string): Module[] {
    return [...(this.modulesByStageId.get(stageId) ?? [])]
  }

  /** 全部模块（图谱等需要）。 */
  getAllModules(): Module[] {
    return [...this.data.modules]
  }

  /** 某模块下的词条。 */
  getModuleWords(moduleId: string): Word[] {
    return [...(this.wordsByModuleId.get(moduleId) ?? [])]
  }

  /** 某阶段下的全部词条。 */
  getWordsByStage(stageId: string): Word[] {
    return [...(this.wordsByStageId.get(stageId) ?? [])]
  }

  getAllWords(): Word[] {
    return [...this.data.words]
  }

  getWordById(id: string): Word | undefined {
    return this.wordById.get(id)
  }

  getGrammarById(id: string): Grammar | undefined {
    return this.grammarById.get(id)
  }

  getAllGrammars(): Grammar[] {
    return [...this.data.grammars]
  }

  getAllSentences(): Sentence[] {
    return [...this.data.sentences]
  }

  /** 包含某词条的例句。 */
  getSentencesByWord(wordId: string): Sentence[] {
    return [...(this.sentencesByWordId.get(wordId) ?? [])]
  }

  /** 包含某语法点的例句。 */
  getSentencesByGrammar(grammarId: string): Sentence[] {
    return [...(this.sentencesByGrammarId.get(grammarId) ?? [])]
  }

  // —— K 域（五十音）查询。与 W 域方法完全并列、互不引用（设计 §3.2 P1 能力域隔离）——

  /** 全部关卡，按 order 升序。 */
  getKanaGroups(): KanaGroup[] {
    return [...this.kana.groups].sort((a, b) => a.order - b.order)
  }

  getKanaGroupById(id: string): KanaGroup | undefined {
    return this.kanaGroupById.get(id)
  }

  /** 某关下的假名（行声明序）。 */
  getKanaByGroup(groupId: string): Kana[] {
    return [...(this.kanaByGroupId.get(groupId) ?? [])]
  }

  /** 某音类（主 Tab）下的全部假名。 */
  getKanaByVoiceType(voiceType: KanaVoiceType): Kana[] {
    return [...(this.kanaByVoiceType.get(voiceType) ?? [])]
  }

  /** 全部假名（104 音）。 */
  getAllKana(): Kana[] {
    return [...this.kana.kana]
  }

  getKanaById(id: string): Kana | undefined {
    return this.kanaById.get(id)
  }

  /** 按 id 批量取假名（跳过不存在的 id，保持入参顺序）。 */
  getKanaByIds(ids: readonly string[]): Kana[] {
    const result: Kana[] = []
    for (const id of ids) {
      const item = this.kanaById.get(id)
      if (item !== undefined) {
        result.push(item)
      }
    }
    return result
  }
}
