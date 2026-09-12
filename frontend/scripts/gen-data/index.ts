import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { buildGrammar } from './build-grammar.js'
import { buildModules } from './build-modules.js'
import { buildSentences } from './build-sentences.js'
import { buildStages } from './build-stages.js'
import { buildWords } from './build-words.js'
import { loadBuild, validateData } from './validate.js'

const here = dirname(fileURLToPath(import.meta.url))
const buildDir = resolve(here, '../../data/build')

/**
 * 一键入口：build → 写 `data/build/*.json` → validate。
 * 校验失败以退出码 1 结束（CI 可复现）。
 */
async function main(): Promise<void> {
  await mkdir(buildDir, { recursive: true })

  const outputs: Array<[string, unknown]> = [
    ['stages', buildStages()],
    ['modules', buildModules()],
    ['words', buildWords()],
    ['grammar', buildGrammar()],
    ['sentences', buildSentences()],
  ]

  for (const [name, value] of outputs) {
    const json = `${JSON.stringify(value, null, 2)}\n`
    await writeFile(resolve(buildDir, `${name}.json`), json, 'utf8')
    console.info(`[gen:data] wrote data/build/${name}.json`)
  }

  const data = await loadBuild()
  const result = validateData(data)
  if (!result.ok) {
    console.error('[gen:data] 校验失败：')
    for (const err of result.errors) {
      console.error(`  - ${err}`)
    }
    process.exitCode = 1
    return
  }

  console.info('[gen:data] 校验通过 ✓')
}

await main()
