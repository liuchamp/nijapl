import { modules as seedModules } from '../../data/source/seed/modules.js'
import type { Module } from '../../src/types/domain.js'

/** 产出 modules 构建数据。 */
export function buildModules(): Module[] {
  return seedModules.map((m) => ({ ...m }))
}
