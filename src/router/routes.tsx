import { Route, Routes, useLocation } from 'react-router'
import { ROUTES } from '../constants/routes.js'

/**
 * 路由表（架构 §1.2 / §2.8）。
 *
 * 说明：P0–P9 页面属于 T04 / T05 交付范围，本任务（T03）只负责**路由外壳**，
 * 故此处先用占位组件把 10 条路径接通（可运行、可切换、可构建）；
 * T04 / T05 落地页面时，将对应 `element` 替换为真实页面组件即可。
 */

interface PlaceholderProps {
  title: string
  note: string
}

/** 占位页：显示标题、所属页面编号与当前路径，便于验证路由切换。 */
function PagePlaceholder(props: PlaceholderProps) {
  const location = useLocation()
  return (
    <view className="Page">
      <text className="Page-title">{props.title}</text>
      <text className="Page-path">{location.pathname}</text>
      <text className="Page-note">{props.note}</text>
    </view>
  )
}

/** 全部路由定义（5 Tab + 5 二级 + 兜底）。 */
export function AppRoutes() {
  return (
    <Routes>
      <Route
        path={ROUTES.home}
        element={
          <PagePlaceholder title="首页" note="P0 首页仪表盘（T04 交付）" />
        }
      />
      <Route
        path={ROUTES.stages}
        element={
          <PagePlaceholder title="阶段地图" note="P1 阶段地图（T04 交付）" />
        }
      />
      <Route
        path={ROUTES.grammar}
        element={
          <PagePlaceholder title="语法列表" note="P4 语法列表（T05 交付）" />
        }
      />
      <Route
        path={ROUTES.review}
        element={<PagePlaceholder title="复习" note="P7 复习（T04 交付）" />}
      />
      <Route
        path={ROUTES.me}
        element={<PagePlaceholder title="我的" note="P9 我的（T05 交付）" />}
      />
      <Route
        path={ROUTES.study}
        element={
          <PagePlaceholder title="词汇学习" note="P2 词汇学习（T04 交付）" />
        }
      />
      <Route
        path={ROUTES.vocab}
        element={
          <PagePlaceholder title="词汇详解" note="P3 词汇详解（T04 交付）" />
        }
      />
      <Route
        path={ROUTES.grammarDetail}
        element={
          <PagePlaceholder title="语法详解" note="P5 语法详解（T05 交付）" />
        }
      />
      <Route
        path={ROUTES.graph}
        element={
          <PagePlaceholder title="知识图谱" note="P6 知识图谱（T05 交付）" />
        }
      />
      <Route
        path={ROUTES.quiz}
        element={<PagePlaceholder title="自测" note="P8 自测（T05 交付）" />}
      />
      <Route
        path="*"
        element={
          <PagePlaceholder title="页面不存在" note="未匹配到路由，请返回首页" />
        }
      />
    </Routes>
  )
}
