import type { Stage } from '../../../src/types/domain.js'

/**
 * seed 种子数据：4 个阶段。
 * 每个阶段 `source` 概念由词条/语法承载；阶段自身无 source 字段。
 * 冲刺期 `hasContent=false`：完成度短路为「不参与」。
 */
export const stages: Stage[] = [
  {
    id: 's1',
    name: 'N5 基础期',
    order: 1,
    weekRange: { start: 1, end: 6 },
    hasContent: true,
  },
  {
    id: 's2',
    name: 'N4 强化期',
    order: 2,
    weekRange: { start: 7, end: 13 },
    hasContent: true,
  },
  {
    id: 's3',
    name: 'N3 强化期',
    order: 3,
    weekRange: { start: 14, end: 22 },
    hasContent: true,
  },
  {
    id: 's4',
    name: '冲刺期',
    order: 4,
    weekRange: { start: 23, end: 26 },
    hasContent: false,
  },
]
