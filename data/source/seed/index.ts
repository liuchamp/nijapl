import type { BuildData } from '../../../src/types/domain.js'
import { grammars } from './grammar.js'
import { modules } from './modules.js'
import { sentences } from './sentences.js'
import { stages } from './stages.js'
import { words } from './words.js'

/**
 * seed 种子数据汇总导出（构建输入，非运行时入口）。
 * 运行时唯一入口为 `data/build/*.json`。
 */
export const seedData: BuildData = {
  stages,
  modules,
  words,
  grammars,
  sentences,
}

export { grammars, modules, sentences, stages, words }
