import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { buildGrammar } from './build-grammar.js'
import { buildKana } from './build-kana.js'
import { buildModules } from './build-modules.js'
import { buildSentences } from './build-sentences.js'
import { buildStages } from './build-stages.js'
import { buildWords } from './build-words.js'
import { loadBuild, validateData } from './validate.js'
import {
  loadKanaBuild,
  loadWordIds,
  validateKanaData,
} from './validate-kana.js'

const here = dirname(fileURLToPath(import.meta.url))
const buildDir = resolve(here, '../../data/build')

/**
 * 一键入口：build → 写 `data/build/*.json` → validate。
 * 校验失败以退出码 1 结束（CI 可复现）。
 *
 * K 域（五十音）产出独立的 `kana.json`，**不并入** `BuildData`
 * （`ARCH §8.7` W 域数据契约冻结）；校验顺序在 W 域之后，便于先定位 W 域问题。
 */
async function main(): Promise<void> {
  await mkdir(buildDir, { recursive: true })

  const outputs: Array<[string, unknown]> = [
    ['stages', buildStages()],
    ['modules', buildModules()],
    ['words', buildWords()],
    ['grammar', buildGrammar()],
    ['sentences', buildSentences()],
    ['kana', buildKana()],
  ]

  for (const [name, value] of outputs) {
    const json = `${JSON.stringify(value, null, 2)}\n`
    await writeFile(resolve(buildDir, `${name}.json`), json, 'utf8')
    console.info(`[gen:data] wrote data/build/${name}.json`)
  }

  const data = await loadBuild()
  const result = validateData(data)
  if (!result.ok) {
    console.error('[gen:data] W 域校验失败：')
    for (const err of result.errors) {
      console.error(`  - ${err}`)
    }
    process.exitCode = 1
    return
  }

  const kanaData = await loadKanaBuild()
  const wordIds = await loadWordIds()
  const kanaResult = validateKanaData(kanaData, wordIds)
  if (!kanaResult.ok) {
    console.error('[gen:data] K 域（五十音）校验失败：')
    for (const err of kanaResult.errors) {
      console.error(`  - ${err}`)
    }
    process.exitCode = 1
    return
  }

  console.info('[gen:data] 校验通过 ✓')
}

await main()
