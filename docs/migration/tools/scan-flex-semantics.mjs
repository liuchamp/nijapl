/**
 * 扫描 Lynx <view> → Web <div> 的布局语义漂移。
 *
 * 原理：Lynx 的 <view> 默认 display:flex; flex-direction:column，
 * 会把子元素 blockify 成 flex item（相邻 <text> 各占一行、width/text-align 生效）。
 * Web 的 <div> 默认 display:block，行内 span 会挤在一行。
 *
 * 本脚本找出：className 在 CSS 中**没有** display:flex 的 div，
 * 且其直接子节点里含有 inline 级元素（span / svg / 裸文本）—— 这些就是漂移点。
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

// ---- 1. 收集 CSS 中带 display:flex 的类名 ----
const flexClasses = new Set()
const classRules = new Map() // 类名 -> 该类的所有声明体（用于调试）
for (const f of cssFiles) {
  const css = fs.readFileSync(f, 'utf8')
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const sel = m[1].trim()
    const body = m[2]
    const hasFlex = /display\s*:\s*flex/.test(body)
    for (const cm of sel.matchAll(/\.([A-Za-z0-9_-]+)/g)) {
      const cls = cm[1]
      if (!classRules.has(cls)) classRules.set(cls, [])
      classRules
        .get(cls)
        .push({ file: path.relative(SRC, f), hasFlex, body: body.trim() })
      if (hasFlex) flexClasses.add(cls)
    }
  }
}

// ---- 2. 解析 tsx，找出风险 div ----
const findings = []

function getClassName(node) {
  const attrs = node.attributes?.properties ?? []
  for (const a of attrs) {
    if (ts.isJsxAttribute(a) && a.name.getText() === 'className') {
      if (a.initializer && ts.isStringLiteral(a.initializer)) {
        return { value: a.initializer.text, literal: true }
      }
      // 模板字符串 / 表达式
      if (a.initializer && ts.isJsxExpression(a.initializer)) {
        const e = a.initializer.expression
        if (e && ts.isStringLiteral(e)) return { value: e.text, literal: true }
        // 纯模板字面量且无插值
        if (e && ts.isNoSubstitutionTemplateLiteral(e))
          return { value: e.text, literal: true }
        return { value: null, literal: false }
      }
      return { value: null, literal: false }
    }
  }
  return null // 无 className
}

function childSummary(node) {
  // 返回直接子节点里的元素 tag 列表 + 是否有非空裸文本
  const tags = []
  let hasText = false
  const visit = (n) => {
    for (const c of n.children ?? []) {
      if (ts.isJsxElement(c)) {
        tags.push(c.openingElement.tagName.getText())
      } else if (ts.isJsxSelfClosingElement(c)) {
        tags.push(c.tagName.getText())
      } else if (ts.isJsxExpression(c)) {
        // 表达式子节点：可能是 .map 返回元素，无法静态判断 tag
        const e = c.expression
        if (e) {
          let saw = false
          const rec = (x) => {
            if (ts.isJsxElement(x)) {
              tags.push(x.openingElement.tagName.getText())
              saw = true
            } else if (ts.isJsxSelfClosingElement(x)) {
              tags.push(x.tagName.getText())
              saw = true
            } else {
              ts.forEachChild(x, rec)
            }
          }
          rec(e)
          if (!saw) tags.push('<expr>')
        }
      } else if (ts.isJsxText(c)) {
        if (c.getText().trim() !== '') hasText = true
      }
    }
  }
  visit(node)
  return { tags, hasText }
}

const INLINE = new Set(['span', 'svg'])
const nested = (file, node) => {
  if (ts.isJsxElement(node)) {
    // 对 div / view 检查
    const open = node.openingElement
    const tag = open.tagName.getText()
    return { tag, attrs: open, children: node.children, node, open }
  }
  if (ts.isJsxSelfClosingElement(node)) {
    return {
      tag: node.tagName.getText(),
      attrs: node,
      children: [],
      node,
      open: node,
    }
  }
  return null
}

for (const f of tsxFiles) {
  const text = fs.readFileSync(f, 'utf8')
  const sf = ts.createSourceFile(
    f,
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  )

  const visit = (node) => {
    const info = nested(f, node)
    if (info && (info.tag === 'div' || info.tag === 'div ')) {
      const cn = getClassName(info.open)
      const clsList = cn?.literal ? cn.value.split(/\s+/).filter(Boolean) : []
      const covered = clsList.some((c) => flexClasses.has(c))
      const unknown = cn === null || !cn.literal
      const { tags, hasText } = childSummary(info)
      const inlineKids = tags.filter((t) => INLINE.has(t) || t === '<expr>')
      if ((inlineKids.length > 0 || hasText) && !covered) {
        const { line } = sf.getLineAndCharacterOfPosition(
          info.node.getStart(sf),
        )
        findings.push({
          file: path.relative(SRC, f),
          line: line + 1,
          classes: cn ? (cn.literal ? cn.value : '<dynamic>') : '<none>',
          unknown,
          inlineKids,
          hasText,
        })
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
}

// ---- 3. 输出 ----
console.log(`\nCSS 中声明了 display:flex 的类：${flexClasses.size} 个\n`)
console.log(
  `=== 风险点：div 无 flex 且含行内子元素（${findings.length} 处）===\n`,
)
for (const r of findings) {
  const kids = [...new Set(r.inlineKids)].join(',')
  console.log(
    `${r.file}:${r.line}  [${r.classes}]${r.unknown ? ' (dynamic/none)' : ''}  kids={${kids}}${r.hasText ? ' +text' : ''}`,
  )
}
