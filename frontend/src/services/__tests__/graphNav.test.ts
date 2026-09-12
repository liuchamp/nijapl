import { describe, expect, it } from 'vitest'

import type { GraphNode } from '../../types/graph.js'
import {
  graphNodeEntityId,
  graphNodeKind,
  graphNodeTarget,
  parseGraphQuery,
} from '../graphNav.js'

function makeNode(id: string): GraphNode {
  return { id, kind: 'word', label: id, x: 0, y: 0, r: 14 }
}

describe('graphNav · 节点解析', () => {
  it('去前缀取实体 id', () => {
    expect(graphNodeEntityId('word:w-01')).toBe('w-01')
    expect(graphNodeEntityId('grammar:G001')).toBe('G001')
    expect(graphNodeEntityId('module:m01')).toBe('m01')
    expect(graphNodeEntityId('stage:s1')).toBe('s1')
    expect(graphNodeEntityId('nodash')).toBe('')
  })

  it('取 kind 前缀', () => {
    expect(graphNodeKind('word:w-01')).toBe('word')
    expect(graphNodeKind('nodash')).toBe('nodash')
  })

  it('节点 → 跳转目标（词/语法/模块/阶段）', () => {
    expect(graphNodeTarget(makeNode('word:w-01'))).toEqual({
      kind: 'word',
      id: 'w-01',
    })
    expect(graphNodeTarget(makeNode('grammar:G001'))).toEqual({
      kind: 'grammar',
      id: 'G001',
    })
    expect(graphNodeTarget(makeNode('module:m01'))).toEqual({
      kind: 'module',
      id: 'm01',
    })
    expect(graphNodeTarget(makeNode('stage:s1'))).toEqual({
      kind: 'stage',
      id: 's1',
    })
    expect(graphNodeTarget(makeNode('unknown:x'))).toEqual({
      kind: 'none',
      id: '',
    })
  })
})

describe('graphNav · parseGraphQuery', () => {
  it('默认 overview、无聚焦', () => {
    expect(parseGraphQuery('')).toEqual({ view: 'overview', focus: null })
    expect(parseGraphQuery('?')).toEqual({ view: 'overview', focus: null })
  })

  it('解析 view 与 focus', () => {
    expect(parseGraphQuery('?view=word&focus=w-01')).toEqual({
      view: 'word',
      focus: 'w-01',
    })
    expect(parseGraphQuery('view=grammar&focus=G001')).toEqual({
      view: 'grammar',
      focus: 'G001',
    })
  })

  it('非法 view 回落 overview', () => {
    expect(parseGraphQuery('?view=xxx')).toEqual({
      view: 'overview',
      focus: null,
    })
  })

  it('focus 进行 URL 解码；空 focus 归一为 null', () => {
    expect(parseGraphQuery('?view=word&focus=a%3Ab')).toEqual({
      view: 'word',
      focus: 'a:b',
    })
    expect(parseGraphQuery('?view=word&focus=')).toEqual({
      view: 'word',
      focus: null,
    })
  })
})
