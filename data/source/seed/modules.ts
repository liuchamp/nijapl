import type { Module } from '../../../src/types/domain.js'

/**
 * seed 种子数据：10 个模块（分布于 s1–s3，共 50 词）。
 * 模块自身同样标注 `source: 'seed'`（PRD §7.2）。
 */
export const modules: Module[] = [
  { id: 'm01', stageId: 's1', name: '生活基础名词', wordCount: 5, source: 'seed' },
  { id: 'm02', stageId: 's1', name: '日常动词（一）', wordCount: 5, source: 'seed' },
  { id: 'm03', stageId: 's1', name: '基础形容词', wordCount: 5, source: 'seed' },
  { id: 'm04', stageId: 's2', name: '场所与交通', wordCount: 5, source: 'seed' },
  { id: 'm05', stageId: 's2', name: '常用动词（二）', wordCount: 5, source: 'seed' },
  { id: 'm06', stageId: 's2', name: '时间与频率', wordCount: 5, source: 'seed' },
  { id: 'm07', stageId: 's3', name: '抽象名词', wordCount: 5, source: 'seed' },
  { id: 'm08', stageId: 's3', name: '复合表达', wordCount: 5, source: 'seed' },
  { id: 'm09', stageId: 's3', name: '进阶形容词', wordCount: 5, source: 'seed' },
  { id: 'm10', stageId: 's3', name: '副词与接续', wordCount: 5, source: 'seed' },
]
