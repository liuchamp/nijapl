/**
 * 检查 Lynx「默认不继承 CSS」与 Web「默认继承」造成的字号漂移。
 *
 * Lynx 文档：CSS inheritance is not enabled by default —— 子元素不继承父元素的 font-size。
 * 因此未显式设置 font-size 的 <text> 一律取 UA 默认 14px。
 * Web 则会把父元素 font-size 继承下去。
 *
 * 本脚本找出：「自身类无 font-size」但「存在带 font-size 的祖先类」的元素 —— 这些在
 * Lynx/Web 下会取到不同字号（Lynx: 14px，Web: 祖先值）。
 */

import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

const SRC = path.resolve('src')

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else out.push(p)
  }
  return out
}

const files = walk(SRC)
const cssFiles = files.filter((f) => f.endsWith('.css'))
const tsxFiles = files.filter(
  (f) => f.endsWith('.tsx') && !f.includes('__tests__'),
)

/** 类名 -> 是否有 font-size（含 text-align 之类可选扩展） */
const clsHasFontSize = new Map()
for (const f of cssFiles) {
  const css = fs.readFileSync(f, 'utf8')
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const sel = m[1].trim()
    const body = m[2]
    for (const cm of sel.matchAll(/\.([A-Za-z0-9_-]+)/g)) {
      const cls = cm[1]
      if (/font-size\s*:/.test(body)) clsHasFontSize.set(cls, true)
      else if (!clsHasFontSize.has(cls)) clsHasFontSize.set(cls, false)
    }
  }
}

function attrs(open) {
  const out = {}
  for (const a of open.attributes?.properties ?? []) {
    if (ts.isJsxAttribute(a)) out[a.name.getText()] = a
  }
  return out
}

function classesOf(open) {
  const a = attrs(open).className
  if (!a?.initializer) return null
  const i = a.initializer
  if (ts.isStringLiteral(i)) return i.text.split(/\s+/).filter(Boolean)
  if (ts.isJsxExpression(i)) {
    const e = i.expression
    if (e && ts.isStringLiteral(e)) return e.text.split(/\s+/).filter(Boolean)
    if (e && ts.isNoSubstitutionTemplateLiteral(e))
      return e.text.split(/\s+/).filter(Boolean)
    return null // dynamic
  }
  return null
}

/** 元素是否自带 font-size（className 任一类命中，或内联 style 里写了 fontSize） */
function selfFontSize(open) {
  const cls = classesOf(open)
  if (cls && cls.some((c) => clsHasFontSize.get(c) === true))
    return { has: true, via: `class:${cls.join('.')}` }
  const a = attrs(open).style
  if (
    a?.initializer &&
    ts.isJsxExpression(a.initializer) &&
    a.initializer.expression
  ) {
    const txt = a.initializer.expression.getText()
    if (/fontSize/.test(txt)) return { has: true, via: 'inline' }
  }
  return { has: false, via: '' }
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

  const visit = (node, fontAncestors) => {
    const open = ts.isJsxElement(node)
      ? node.openingElement
      : ts.isJsxSelfClosingElement(node)
        ? node
        : null
    let next = fontAncestors
    if (open) {
      const tag = open.tagName.getText()
      const self = selfFontSize(open)
      if (!self.has && fontAncestors.length > 0 && tag !== 'svg') {
        const cls = classesOf(open)
        const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf))
        report.push({
          file: path.relative(SRC, f),
          line: line + 1,
          tag,
          cls: cls ? cls.join(' ') : '<none/dynamic>',
          via: fontAncestors[fontAncestors.length - 1],
        })
      }
      if (self.has)
        next = [
          ...fontAncestors,
          `${tag}[${(classesOf(open) ?? ['?']).join('.')}] → ${self.via}`,
        ]
    }
    ts.forEachChild(node, (c) => visit(c, next))
  }
  visit(sf, [])
}

console.log(`\n「自身无 font-size，但祖先有」的元素：${report.length}\n`)
console.log('='.repeat(100))
for (const r of report) {
  console.log(`${r.file}:${r.line}  <${r.tag} class="${r.cls}">`)
  console.log(`    最近带字号的祖先： ${r.via}`)
}
