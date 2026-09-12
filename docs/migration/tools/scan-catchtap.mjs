/**
 * 分析 Lynx 的 catchtap / bindtap 语义，定位 Web 迁移中必须补 stopPropagation 的点。
 *
 * Lynx 中：
 *   bindtap  = 绑定 tap，允许冒泡（≈ Web 的 onClick）
 *   catchtap = 绑定 tap 并**阻止冒泡**（≈ onClick + e.stopPropagation()）
 *
 * 只有在「存在带 tap 的祖先」时，catch 的阻断才产生实际影响。
 * 本脚本解析 JSX 树，标出每个 catchtap 元素及其祖先链中的 bindtap/catchtap，
 * 从而区分「必须补 stopPropagation」与「阻断无实际作用」。
 */

import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

const ROOT = process.argv[2] || '.'
const SRC = path.resolve(ROOT, 'src')

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else out.push(p)
  }
  return out
}

const tsxFiles = walk(SRC).filter(
  (f) => f.endsWith('.tsx') && !f.includes('__tests__'),
)

function attrs(open) {
  const out = {}
  for (const a of open.attributes?.properties ?? []) {
    if (ts.isJsxAttribute(a)) out[a.name.getText()] = a
  }
  return out
}

function classNameOf(open) {
  const a = attrs(open).className
  if (!a?.initializer) return null
  const i = a.initializer
  if (ts.isStringLiteral(i)) return i.text
  if (ts.isJsxExpression(i)) {
    const e = i.expression
    if (e && ts.isStringLiteral(e)) return e.text
    if (e && ts.isNoSubstitutionTemplateLiteral(e)) return e.text
    return '<dynamic>'
  }
  return null
}

const report = []

for (const f of tsxFiles) {
  const text = fs.readFileSync(f, 'utf8')
  const sf = ts.createSourceFile(
    f,
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  )

  const visit = (node, ancestors) => {
    const open = ts.isJsxElement(node)
      ? node.openingElement
      : ts.isJsxSelfClosingElement(node)
        ? node
        : null

    let nextAncestors = ancestors
    if (open) {
      const a = attrs(open)
      const tag = open.tagName.getText()
      const cls = classNameOf(open)
      const hasCatch = 'catchtap' in a
      const hasBind = 'bindtap' in a
      const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf))

      if (hasCatch) {
        const tapAncestors = ancestors.filter(
          (x) => x.kind === 'bindtap' || x.kind === 'catchtap',
        )
        report.push({
          file: path.relative(SRC, f),
          line: line + 1,
          tag,
          cls,
          tapAncestors: tapAncestors.map((x) => `${x.kind}:${x.cls ?? x.tag}`),
        })
      }
      if (hasCatch || hasBind) {
        nextAncestors = [
          ...ancestors,
          { kind: hasCatch ? 'catchtap' : 'bindtap', cls, tag },
        ]
      }
    }
    ts.forEachChild(node, (c) => visit(c, nextAncestors))
  }
  visit(sf, [])
}

const mustFix = report.filter((r) => r.tapAncestors.length > 0)
console.log(`\ncatchtap 总数：${report.length}`)
console.log(
  `其中「存在 tap 祖先」→ Web 端必须补 stopPropagation：${mustFix.length}\n`,
)
console.log('='.repeat(100))
for (const r of mustFix) {
  console.log(`▶ ${r.file}:${r.line}  <${r.tag} class="${r.cls}">`)
  console.log(`    tap 祖先链： ${r.tapAncestors.join('  ←  ')}`)
}
console.log('\n' + '='.repeat(100))
console.log('\n【阻断无实际作用（无 tap 祖先，可不改）】')
const safe = report.filter((r) => r.tapAncestors.length === 0)
const byFile = new Map()
for (const r of safe) {
  if (!byFile.has(r.file)) byFile.set(r.file, [])
  byFile.get(r.file).push(`${r.line}:${r.cls}`)
}
for (const [f, list] of byFile)
  console.log(`  ${f}  (${list.length})  ${list.join(', ')}`)
