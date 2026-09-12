import type { GraphMode, GraphNode } from '../types/graph.js'

/**
 * P6 知识图谱的导航解析（纯函数，架构 §2.9 / T05 判据 3）。
 *
 * 图谱节点 id 形如 `word:w-01` / `grammar:G001` / `module:m01` / `stage:s1`；
 * 点节点需映射到目标页面（词→P3 / 语法→P5 / 模块→P2 / 阶段→仅聚焦）。
 * 抽为纯函数以便单测，避免在页面里散落 `split(':')` 之类的解析。
 */

/** 图谱节点可跳转的目标类型。 */
export type GraphNavKind = 'word' | 'grammar' | 'module' | 'stage' | 'none'

/** 跳转目标。 */
export interface GraphNavTarget {
  kind: GraphNavKind
  /** 去除前缀后的实体 id（`none` 时为空串）。 */
  id: string
}

/** 去掉 `kind:` 前缀，返回实体 id。 */
export function graphNodeEntityId(nodeId: string): string {
  const separator = nodeId.indexOf(':')
  return separator >= 0 ? nodeId.slice(separator + 1) : ''
}

/** 节点 id 的 `kind` 前缀。 */
export function graphNodeKind(nodeId: string): string {
  const separator = nodeId.indexOf(':')
  return separator >= 0 ? nodeId.slice(0, separator) : nodeId
}

/** 由节点解析跳转目标。 */
export function graphNodeTarget(node: GraphNode): GraphNavTarget {
  const kind = graphNodeKind(node.id)
  const id = graphNodeEntityId(node.id)
  switch (kind) {
    case 'word':
      return { kind: 'word', id }
    case 'grammar':
      return { kind: 'grammar', id }
    case 'module':
      return { kind: 'module', id }
    case 'stage':
      return { kind: 'stage', id }
    default:
      return { kind: 'none', id: '' }
  }
}

/** P6 路由查询解析结果。 */
export interface GraphQuery {
  view: GraphMode
  focus: string | null
}

/** 解析 `?view=overview|word|grammar&focus=:id`（宽松：非法值回落默认）。 */
export function parseGraphQuery(search: string): GraphQuery {
  const raw = search.startsWith('?') ? search.slice(1) : search
  let viewParam = ''
  let focusParam: string | null = null
  for (const pair of raw.split('&')) {
    if (pair === '') {
      continue
    }
    const eq = pair.indexOf('=')
    const key = eq >= 0 ? pair.slice(0, eq) : pair
    const value = eq >= 0 ? decodeURIComponent(pair.slice(eq + 1)) : ''
    if (key === 'view') {
      viewParam = value
    } else if (key === 'focus') {
      focusParam = value
    }
  }
  const view: GraphMode =
    viewParam === 'word' || viewParam === 'grammar' ? viewParam : 'overview'
  return { view, focus: focusParam === '' ? null : focusParam }
}
