import { buildSegments, type HighlightRange } from '../../services/highlight.js'

/**
 * 例句高亮渲染（架构 §2.10 / J3）。
 *
 * 纯切分逻辑在 `services/highlight.ts`（可单测）；本组件只负责把片段渲染为
 * 嵌套 `<span>`（Lynx 富文本），词条命中加底色、语法命中加主题色 + 下划线。
 */

interface GrammarHighlightTextProps {
  /** 例句原文（日文）。 */
  text: string
  /** 高亮区间（词条 + 语法）。 */
  ranges: HighlightRange[]
  /** 点击语法片段回调（跳转 P5）。 */
  onTapGrammar?: (grammarId: string) => void
}

/** 例句高亮文本。 */
export function GrammarHighlightText(props: GrammarHighlightTextProps) {
  const segments = buildSegments(props.text, props.ranges)
  const handler = props.onTapGrammar
  return (
    <span className="Ght text-md leading-[1.6]">
      {segments.map((segment) => {
        const className = segment.grammar
          ? 'Ght-seg Ght-seg--grammar text-md text-primary underline'
          : segment.word
            ? 'Ght-seg Ght-seg--word text-md bg-primary-soft rounded-sm'
            : 'Ght-seg text-md'
        const grammarId = segment.grammarId
        const tappable = segment.grammar && grammarId !== undefined && handler
        return (
          <span
            key={segment.key}
            className={className}
            onClick={
              tappable
                ? () => {
                    handler?.(grammarId as string)
                  }
                : undefined
            }
          >
            {segment.text}
          </span>
        )
      })}
    </span>
  )
}
