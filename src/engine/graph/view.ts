import type { Grammar, Word } from '../../types/domain.js'
import type {
  GraphEdge,
  GraphNode,
  GraphNodeKind,
  GraphSourceData,
  GraphView,
} from '../../types/graph.js'

const WORD_RADIUS = 14
const GRAMMAR_RADIUS = 14
const MODULE_RADIUS = 18
const STAGE_RADIUS = 22

function makeNode(
  id: string,
  kind: GraphNodeKind,
  label: string,
  r: number,
): GraphNode {
  return { id, kind, label, x: 0, y: 0, r }
}

function wordNodeId(wordId: string): string {
  return `word:${wordId}`
}

function grammarNodeId(grammarId: string): string {
  return `grammar:${grammarId}`
}

/** 全景脑图：阶段 → 模块。 */
export function buildOverview(data: GraphSourceData): GraphView {
  const nodes: GraphNode[] = []
  const edges: GraphEdge[] = []

  const stages = [...data.stages].sort((a, b) => a.order - b.order)
  for (const stage of stages) {
    nodes.push(makeNode(`stage:${stage.id}`, 'stage', stage.name, STAGE_RADIUS))
  }

  for (const module of data.modules) {
    nodes.push(
      makeNode(`module:${module.id}`, 'module', module.name, MODULE_RADIUS),
    )
    edges.push({
      fromId: `stage:${module.stageId}`,
      toId: `module:${module.id}`,
      type: 'contains',
    })
  }

  return { mode: 'overview', nodes, edges }
}

/** 收集某词条的关联词（含反向关联，去重）。 */
function collectRelatedWords(
  word: Word,
  data: GraphSourceData,
): Array<{ word: Word; type: string }> {
  const result: Array<{ word: Word; type: string }> = []
  const seen = new Set<string>()

  // O(1) 查表：优先用调用方预建的 Map，回退 O(n) 以兼容单测 / 直接构造的 source。
  const lookupWord = (id: string): Word | undefined =>
    data.wordById?.get(id) ?? data.words.find((w) => w.id === id)

  for (const rel of word.related ?? []) {
    const target = lookupWord(rel.toId)
    if (target !== undefined && !seen.has(target.id)) {
      seen.add(target.id)
      result.push({ word: target, type: rel.type })
    }
  }

  for (const other of data.words) {
    if (other.id === word.id) {
      continue
    }
    for (const rel of other.related ?? []) {
      if (rel.toId === word.id && !seen.has(other.id)) {
        seen.add(other.id)
        result.push({ word: other, type: rel.type })
      }
    }
  }

  return result
}

/** 词条局部图：中心词 → 近义/反义/同模块/派生 + 相关语法。 */
export function buildWordView(word: Word, data: GraphSourceData): GraphView {
  const nodesById = new Map<string, GraphNode>()
  const edges: GraphEdge[] = []

  // O(1) 查表（见 collectRelatedWords 注释）。
  const lookupWord = (id: string): Word | undefined =>
    data.wordById?.get(id) ?? data.words.find((w) => w.id === id)
  const lookupGrammar = (id: string): Grammar | undefined =>
    data.grammarById?.get(id) ?? data.grammars.find((g) => g.id === id)

  const centerId = wordNodeId(word.id)
  nodesById.set(
    centerId,
    makeNode(centerId, 'word', word.kanji || word.kana, WORD_RADIUS),
  )

  for (const { word: relatedWord, type } of collectRelatedWords(word, data)) {
    const id = wordNodeId(relatedWord.id)
    if (!nodesById.has(id)) {
      nodesById.set(
        id,
        makeNode(
          id,
          'word',
          relatedWord.kanji || relatedWord.kana,
          WORD_RADIUS,
        ),
      )
    }
    edges.push({ fromId: centerId, toId: id, type })
  }

  const grammarIds = new Set<string>()
  for (const sentence of data.sentences) {
    if (sentence.words.some((sw) => sw.wordId === word.id)) {
      for (const sg of sentence.grammars) {
        grammarIds.add(sg.grammarId)
      }
    }
  }
  for (const grammarId of grammarIds) {
    const grammar = lookupGrammar(grammarId)
    if (grammar === undefined) {
      continue
    }
    const id = grammarNodeId(grammar.id)
    if (!nodesById.has(id)) {
      nodesById.set(
        id,
        makeNode(id, 'grammar', grammar.pattern, GRAMMAR_RADIUS),
      )
    }
    edges.push({ fromId: centerId, toId: id, type: 'relatedGrammar' })
  }

  return { mode: 'word', nodes: [...nodesById.values()], edges }
}

/** 语法关系图：句型 → 上位/下位/近义/对立 + 涉及词汇。 */
export function buildGrammarView(
  grammar: Grammar,
  data: GraphSourceData,
): GraphView {
  const nodesById = new Map<string, GraphNode>()
  const edges: GraphEdge[] = []

  // O(1) 查表（见 collectRelatedWords 注释）。
  const lookupWord = (id: string): Word | undefined =>
    data.wordById?.get(id) ?? data.words.find((w) => w.id === id)
  const lookupGrammar = (id: string): Grammar | undefined =>
    data.grammarById?.get(id) ?? data.grammars.find((g) => g.id === id)

  const centerId = grammarNodeId(grammar.id)
  nodesById.set(
    centerId,
    makeNode(centerId, 'grammar', grammar.pattern, GRAMMAR_RADIUS),
  )

  for (const rel of grammar.related ?? []) {
    const target = lookupGrammar(rel.toId)
    if (target === undefined) {
      continue
    }
    const id = grammarNodeId(target.id)
    if (!nodesById.has(id)) {
      nodesById.set(id, makeNode(id, 'grammar', target.pattern, GRAMMAR_RADIUS))
    }
    edges.push({ fromId: centerId, toId: id, type: rel.type })
  }

  for (const other of data.grammars) {
    if (other.id === grammar.id) {
      continue
    }
    for (const rel of other.related ?? []) {
      if (rel.toId === grammar.id) {
        const id = grammarNodeId(other.id)
        if (!nodesById.has(id)) {
          nodesById.set(
            id,
            makeNode(id, 'grammar', other.pattern, GRAMMAR_RADIUS),
          )
        }
        edges.push({ fromId: id, toId: centerId, type: rel.type })
      }
    }
  }

  const wordIds = new Set<string>()
  for (const sentence of data.sentences) {
    if (sentence.grammars.some((sg) => sg.grammarId === grammar.id)) {
      for (const sw of sentence.words) {
        wordIds.add(sw.wordId)
      }
    }
  }
  for (const wordId of wordIds) {
    const word = lookupWord(wordId)
    if (word === undefined) {
      continue
    }
    const id = wordNodeId(word.id)
    if (!nodesById.has(id)) {
      nodesById.set(
        id,
        makeNode(id, 'word', word.kanji || word.kana, WORD_RADIUS),
      )
    }
    edges.push({ fromId: centerId, toId: id, type: 'relatedWord' })
  }

  return { mode: 'grammar', nodes: [...nodesById.values()], edges }
}
