import './index.css'
import { useMemo, useState } from '@lynx-js/react'
import { useLocation } from 'react-router'
import { GraphCanvas } from '../../components/GraphCanvas/index.js'
import { STRINGS } from '../../constants/strings.js'
import { layout } from '../../engine/graph/layout.js'
import {
  buildGrammarView,
  buildOverview,
  buildWordView,
} from '../../engine/graph/view.js'
import { useNavigation } from '../../router/navigation.js'
import {
  type GraphQuery,
  graphNodeTarget,
  parseGraphQuery,
} from '../../services/graphNav.js'
import { selectGraphSource } from '../../store/selectors.js'
import type {
  GraphMode,
  GraphNode,
  GraphSourceData,
  GraphView,
} from '../../types/graph.js'

/**
 * P6 知识图谱（架构 §1.4 / §2.9 / T05 判据 3）。
 *
 * - **三视图**：overview（阶段→模块）/ word（词条局部）/ grammar（语法关系），
 *   数据来自 T02 图谱引擎（`buildOverview` / `buildWordView` / `buildGrammarView`）；
 * - **布局**：纯函数 `layout`（径向、确定性）；背景由 `toSvg` 生成静态 SVG 串；
 * - **交互**：节点 `bindtap` 聚焦（重算边色 + 降 opacity），再次点击进入
 *   （词→P3 / 语法→P5 / 模块→P2）；点空白取消聚焦；
 * - **缩放**：`GraphCanvas` 外层 `transform: scale(k) translate(dx,dy)`（手势在主线程）。
 */

/** 画布尺寸（rpx）。 */
const GRAPH_WIDTH = 640
const GRAPH_HEIGHT = 640

/** 三视图切换顺序。 */
const VIEW_ORDER: GraphMode[] = ['overview', 'word', 'grammar']

/** 视图标题。 */
function viewLabel(mode: GraphMode): string {
  if (mode === 'word') {
    return STRINGS.graph.viewWord
  }
  if (mode === 'grammar') {
    return STRINGS.graph.viewGrammar
  }
  return STRINGS.graph.viewOverview
}

/** 图例项。 */
const LEGEND: Array<{ label: string; color: string }> = [
  { label: STRINGS.graph.legendStage, color: '#f0b44a' },
  { label: STRINGS.graph.legendModule, color: '#5b8cff' },
  { label: STRINGS.graph.legendWord, color: '#39c47a' },
  { label: STRINGS.graph.legendGrammar, color: '#ff5f6d' },
]

/** 由查询 + 数据源解析出要渲染的视图。 */
function resolveView(query: GraphQuery, source: GraphSourceData): GraphView {
  if (query.view === 'word') {
    const focused =
      query.focus === null
        ? undefined
        : source.words.find((word) => word.id === query.focus)
    const target = focused ?? source.words[0]
    if (target !== undefined) {
      return buildWordView(target, source)
    }
    return buildOverview(source)
  }
  if (query.view === 'grammar') {
    const focused =
      query.focus === null
        ? undefined
        : source.grammars.find((grammar) => grammar.id === query.focus)
    const target = focused ?? source.grammars[0]
    if (target !== undefined) {
      return buildGrammarView(target, source)
    }
    return buildOverview(source)
  }
  return buildOverview(source)
}

/** P6 知识图谱页。 */
export function GraphPage() {
  const nav = useNavigation()
  const location = useLocation()
  const query = useMemo(
    () => parseGraphQuery(location.search),
    [location.search],
  )
  const source = useMemo(() => selectGraphSource(), [])
  const view = useMemo(() => resolveView(query, source), [query, source])
  const layoutResult = useMemo(
    () =>
      layout(view, {
        width: GRAPH_WIDTH,
        height: GRAPH_HEIGHT,
        baseRadius: 230,
      }),
    [view],
  )

  const [focusId, setFocusId] = useState<string | null>(query.focus)
  const [selected, setSelected] = useState<GraphNode | null>(null)

  function enterNode(node: GraphNode): void {
    const target = graphNodeTarget(node)
    if (target.kind === 'word') {
      nav.goVocab(target.id)
    } else if (target.kind === 'grammar') {
      nav.goGrammarDetail(target.id)
    } else if (target.kind === 'module') {
      nav.goStudy(target.id)
    }
  }

  function onNodeTap(node: GraphNode): void {
    if (focusId === node.id) {
      enterNode(node)
      return
    }
    setFocusId(node.id)
    setSelected(node)
  }

  function onBackgroundTap(): void {
    setFocusId(null)
    setSelected(null)
  }

  const selectedTarget = selected === null ? null : graphNodeTarget(selected)
  const canEnter =
    selectedTarget !== null &&
    selectedTarget.kind !== 'none' &&
    selectedTarget.kind !== 'stage'

  return (
    <view className="Graph">
      <view className="Graph-head">
        <view className="Graph-back" catchtap={nav.back}>
          <text className="Graph-backLabel">{STRINGS.common.back}</text>
        </view>
        <text className="Graph-title">{STRINGS.graph.title}</text>
      </view>

      <view className="Graph-tabs">
        {VIEW_ORDER.map((mode) => (
          <view
            key={mode}
            className={
              query.view === mode ? 'Graph-tab Graph-tab--on' : 'Graph-tab'
            }
            catchtap={() => nav.goGraph({ view: mode })}
          >
            <text className="Graph-tabLabel">{viewLabel(mode)}</text>
          </view>
        ))}
      </view>

      <text className="Graph-hint">{STRINGS.graph.focusHint}</text>

      <view className="Graph-legend">
        {LEGEND.map((item) => (
          <view key={item.label} className="Graph-legendItem">
            <view
              className="Graph-legendDot"
              style={{ backgroundColor: item.color }}
            />
            <text className="Graph-legendLabel">{item.label}</text>
          </view>
        ))}
      </view>

      {layoutResult.nodes.length === 0 ? (
        <text className="Graph-empty">{STRINGS.graph.empty}</text>
      ) : (
        <GraphCanvas
          view={view}
          layout={layoutResult}
          focusId={focusId}
          onNodeTap={onNodeTap}
          onBackgroundTap={onBackgroundTap}
        />
      )}

      {selected !== null ? (
        <view className="Graph-detail">
          <text className="Graph-detailLabel">{selected.label}</text>
          {canEnter ? (
            <view
              className="Graph-detailBtn"
              catchtap={() => enterNode(selected)}
            >
              <text className="Graph-detailBtnLabel">
                {STRINGS.graph.enter}
              </text>
            </view>
          ) : null}
        </view>
      ) : null}
    </view>
  )
}
