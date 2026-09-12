import { stages as seedStages } from '../../data/source/seed/stages.js'
import type { Stage } from '../../src/types/domain.js'

/** 产出 stages 构建数据。 */
export function buildStages(): Stage[] {
  return seedStages.map((stage) => ({
    ...stage,
    weekRange: { ...stage.weekRange },
  }))
}
