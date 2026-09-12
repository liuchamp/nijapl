import grammarJson from '../../data/build/grammar.json'
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

  constructor(data: BuildData) {
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
}
