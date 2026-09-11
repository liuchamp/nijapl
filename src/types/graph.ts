import type { BuildData } from './domain.js'

/** 图谱节点类型。 */
export type GraphNodeKind = 'stage' | 'module' | 'word' | 'grammar'

/** 图谱三种视图。 */
export type GraphMode = 'overview' | 'word' | 'grammar'

/** 图谱节点。`x`/`y`/`r` 由布局阶段写入。 */
export interface GraphNode {
  id: string
  kind: GraphNodeKind
  label: string
  x: number
  y: number
  r: number
}

/** 图谱边。 */
export interface GraphEdge {
  fromId: string
  toId: string
  type: string
}

/** 图谱视图数据。 */
export interface GraphView {
  mode: GraphMode
  nodes: GraphNode[]
  edges: GraphEdge[]
}

/** 布局配置。 */
export interface LayoutConfig {
  width: number
  height: number
  padding?: number
  baseRadius?: number
}

/** 布局结果（含画布尺寸）。 */
export interface LayoutResult {
  nodes: GraphNode[]
  edges: GraphEdge[]
  width: number
  height: number
}

/**
 * 图谱构造所需的数据源（结构同 `BuildData`，引擎据此保持零端口依赖）。
 *
 * 可选 `wordById` / `grammarById` 由 `selectGraphSource` 在调用方预建，供引擎
 * 把 `all.find` / `data.grammars.find` 等 O(n) 查找降为 O(1)，数据规模扩大时
 * 不会退化。引擎本身仍不依赖 `DataRepository`（架构红线：保持零端口依赖）。
 */
export type GraphSourceData = BuildData & {
  wordById?: Map<string, BuildData['words'][number]>
  grammarById?: Map<string, BuildData['grammars'][number]>
}
