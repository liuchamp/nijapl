/**
 * 全量 tsx 行为等价性校验。
 *
 * 把开发树（Web）的 tsx 规范化回 Lynx 形态后与参考树逐文件对比：
 * 机械转换（标签名 / 事件名 / import 来源 / CSS import）会被抹平，
 * 剩下的差异即为「需要人工确认的语义改动」。
 *
 * 用法：node compare-tsx.mjs <refSrc> <devSrc>
 */
import fs from 'node:fs'
import path from 'node:path'

const [REF, DEV] = [process.argv[2], process.argv[3]]

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else out.push(p)
  }
  return out
}

/** 开发树 tsx → 参考树（Lynx）形态 */
function normalizeDev(src) {
  return (
    src
      // 新增的组件样式 import（Web 专用）
      .split('\n')
      .filter((l) => !/^import\s+['"]\.\/index\.css['"]$/.test(l.trim()))
      .join('\n')
      // 标签名还原
      .replace(/<\/div>/g, '</view>')
      .replace(/<div\b/g, '<view')
      .replace(/<\/span>/g, '</text>')
      .replace(/<span\b/g, '<text')
      // 事件名还原（catchtap/bindtap 的区别在此被抹平，单独核查）
      .replace(/\bonClick=/g, 'bindtap=')
      // 运行时来源还原
      .replace(/from 'react'/g, "from '@lynx-js/react'")
      .replace(/from "react"/g, 'from "@lynx-js/react"')
      // Web 专属 API 注释差异
      .replace(/\bdangerouslySetInnerHTML=\{\{ __html: svg \}\}/g, 'content={svg}')
  )
}

/** 参考树 tsx（原样，仅去掉 Lynx 专属的 main-thread 指令差异） */
function normalizeRef(src) {
  return src
}

function lines(t) {
  return t.split('\n').map((l) => l.trim())
}

const refFiles = walk(REF).filter((f) => f.endsWith('.tsx'))
const rows = []

for (const rf of refFiles) {
  const rel = path.relative(REF, rf)
  const df = path.join(DEV, rel)
  if (!fs.existsSync(df)) {
    rows.push({ rel, status: 'MISSING_IN_DEV' })
    continue
  }
  const a = lines(normalizeRef(fs.readFileSync(rf, 'utf8')))
  const b = lines(normalizeDev(fs.readFileSync(df, 'utf8')))
  const setA = new Set(a)
  const setB = new Set(b)
  const onlyRef = [...setA].filter((l) => !setB.has(l) && l !== '')
  const onlyDev = [...setB].filter((l) => !setA.has(l) && l !== '')
  rows.push({ rel, onlyRef: onlyRef.length, onlyDev: onlyDev.length, sampleRef: onlyRef.slice(0, 6), sampleDev: onlyDev.slice(0, 6) })
}

rows.sort((x, y) => (y.onlyRef ?? 0) + (y.onlyDev ?? 0) - ((x.onlyRef ?? 0) + (x.onlyDev ?? 0)))

console.log('文件'.padEnd(46), '仅ref', '仅dev')
console.log('='.repeat(70))
for (const r of rows) {
  if (r.status) {
    console.log(r.rel.padEnd(46), r.status)
    continue
  }
  const flag = r.onlyRef + r.onlyDev > 0 ? ' ⚠' : ' ✓'
  console.log(r.rel.padEnd(46), String(r.onlyRef).padStart(4), String(r.onlyDev).padStart(5), flag)
}

console.log('\n\n===== 差异明细（仅列非零项）=====')
for (const r of rows) {
  if (r.status || r.onlyRef + r.onlyDev === 0) continue
  console.log(`\n───── ${r.rel} ─────`)
  if (r.onlyRef) console.log('  仅在参考树:')
  for (const l of r.sampleRef) console.log(`    - ${l.slice(0, 110)}`)
  if (r.onlyDev) console.log('  仅在开发树:')
  for (const l of r.sampleDev) console.log(`    + ${l.slice(0, 110)}`)
}
