/**
 * 详细报告：对每个「div 无 flex 但含行内子元素」的点，
 * dump 出 div 自身 CSS 声明 + 各直接子元素（span 等）的 CSS 声明，
 * 并标记哪些属性依赖 Lynx <view> 的 flex-column/blockify 语义。
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

/** 类名 -> 声明体数组 */
const classDecl = new Map()
for (const f of cssFiles) {
  const css = fs.readFileSync(f, 'utf8')
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const sel = m[1].trim()
    const body = m[2].trim()
    for (const cm of sel.matchAll(/\.([A-Za-z0-9_-]+)/g)) {
      const cls = cm[1]
      if (!classDecl.has(cls)) classDecl.set(cls, [])
      classDecl.get(cls).push({ file: path.relative(SRC, f), sel, body })
    }
  }
}

const hasFlex = (cls) =>
  (classDecl.get(cls) ?? []).some((d) => /display\s*:\s*flex/.test(d.body))

function declOf(cls) {
  const ds = classDecl.get(cls)
  if (!ds) return '(无 CSS 定义)'
  return ds.map((d) => `${d.file} {${d.body.replace(/\s+/g, ' ')}}`).join(' | ')
}

/** 判断 CSS 声明体是否含「依赖 flex item 身份」的属性 */
function needsFlexItem(body) {
  const hits = []
  if (/(^|[;{\s])width\s*:/.test(body) && !/width\s*:\s*(100%|auto)/.test(body))
    hits.push('width')
  if (/text-align\s*:/.test(body)) hits.push('text-align')
  if (/(^|[;{\s])flex\s*:/.test(body)) hits.push('flex')
  if (/align-self\s*:/.test(body)) hits.push('align-self')
  if (/margin-(left|right)\s*:\s*auto/.test(body)) hits.push('margin:auto')
  if (/background-color\s*:/.test(body)) hits.push('background-color')
  if (/(^|[;{\s])border\s*:/.test(body)) hits.push('border')
  return hits
}

function attrValue(node, name) {
  for (const a of node.attributes?.properties ?? []) {
    if (ts.isJsxAttribute(a) && a.name.getText() === name) {
      const init = a.initializer
      if (init && ts.isStringLiteral(init))
        return { value: init.text, literal: true }
      if (init && ts.isJsxExpression(init)) {
        const e = init.expression
        if (e && ts.isStringLiteral(e)) return { value: e.text, literal: true }
        if (e && ts.isNoSubstitutionTemplateLiteral(e))
          return { value: e.text, literal: true }
        return { value: null, literal: false }
      }
      return { value: null, literal: false }
    }
  }
  return null
}

/** 收集直接子元素（tag, className） */
function directChildren(node) {
  const out = []
  const rec = (n, depth) => {
    for (const c of n.children ?? []) {
      if (ts.isJsxElement(c)) {
        const tag = c.openingElement.tagName.getText()
        const cn = attrValue(c.openingElement, 'className')
        if (cn && cn.literal) {
          cn.value
            .split(/\s+/)
            .filter(Boolean)
            .forEach((k) => out.push({ tag, cls: k }))
        } else {
          out.push({ tag, cls: null })
        }
      } else if (ts.isJsxSelfClosingElement(c)) {
        const tag = c.tagName.getText()
        const cn = attrValue(c, 'className')
        if (cn && cn.literal) {
          cn.value
            .split(/\s+/)
            .filter(Boolean)
            .forEach((k) => out.push({ tag, cls: k }))
        } else {
          out.push({ tag, cls: null })
        }
      } else if (ts.isJsxExpression(c)) {
        const e = c.expression
        if (!e) continue
        const sub = (x) => {
          let found = false
          ts.forEachChild(x, (y) => {
            if (ts.isJsxElement(y) || ts.isJsxSelfClosingElement(y)) {
              found = true
              rec({ children: [y] }, depth + 1)
              return
            }
            sub(y)
          })
          return found
        }
        sub(e)
      } else if (ts.isJsxText(c) && c.getText().trim() !== '') {
        out.push({ tag: '#text', cls: null })
      }
    }
  }
  rec(node, 0)
  return out
}

const findings = []
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
    const open = ts.isJsxElement(node)
      ? node.openingElement
      : ts.isJsxSelfClosingElement(node)
        ? node
        : null
    if (open && open.tagName.getText() === 'div') {
      const cn = attrValue(open, 'className')
      const clsList = cn?.literal ? cn.value.split(/\s+/).filter(Boolean) : []
      const covered = clsList.some(hasFlex)
      if (!covered) {
        const kids = directChildren(node)
        const inlineKids = kids.filter(
          (k) => k.tag === 'span' || k.tag === 'svg' || k.tag === '#text',
        )
        if (inlineKids.length > 0) {
          const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf))
          // 检查子 span 是否真的需要 flex item 身份
          const risky = []
          for (const k of inlineKids) {
            if (!k.cls) continue
            const ds = classDecl.get(k.cls) ?? []
            for (const d of ds) {
              const n = needsFlexItem(d.body)
              if (n.length) risky.push({ cls: k.cls, props: n })
            }
          }
          findings.push({
            file: path.relative(SRC, f),
            line: line + 1,
            divClass: cn ? (cn.literal ? cn.value : '<dynamic>') : '<none>',
            divDecl: clsList.map((c) => `${c}: ${declOf(c)}`),
            inlineKids,
            risky,
            multi: inlineKids.length > 1,
          })
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
}

// 只输出「有明确风险」的：子元素依赖 flex item，或 多个 inline 相邻
const real = findings.filter((r) => r.risky.length > 0 || r.multi)
console.log(`\n全部候选 ${findings.length} 处；真实风险 ${real.length} 处\n`)
console.log('='.repeat(100))
for (const r of real) {
  console.log(`\n▶ ${r.file}:${r.line}  div[${r.divClass}]`)
  for (const d of r.divDecl) console.log(`    div-css  ${d}`)
  for (const k of r.inlineKids) {
    console.log(
      `    kid ${k.tag}[${k.cls ?? '-'}]  ${k.cls ? declOf(k.cls) : ''}`,
    )
  }
  if (r.risky.length) {
    console.log(
      `    !! 子元素依赖 flex item: ${r.risky.map((x) => `${x.cls}(${x.props.join(',')})`).join(', ')}`,
    )
  }
  if (r.multi) console.log(`    !! 多个 inline 相邻（${r.inlineKids.length}）`)
}

console.log('\n' + '='.repeat(100))
console.log('\n【其余候选（子元素无 width/text-align/flex，判定无害）】')
for (const r of findings.filter((x) => !(x.risky.length > 0 || x.multi))) {
  console.log(
    `  ${r.file}:${r.line}  div[${r.divClass}]  kids={${[...new Set(r.inlineKids.map((k) => k.tag))].join(',')}}`,
  )
}
