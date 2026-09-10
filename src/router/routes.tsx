import { Route, Routes, useLocation } from 'react-router'
import { ROUTES } from '../constants/routes.js'
import { HomePage } from '../pages/Home/index.js'
import { ReviewPage } from '../pages/Review/index.js'
import { StageMapPage } from '../pages/StageMap/index.js'
import { StudyPage } from '../pages/Study/index.js'
import { VocabDetailPage } from '../pages/VocabDetail/index.js'

/**
 * 路由表（架构 §1.2 / §2.8）。
 *
 * - T04 交付页面：P0 首页 / P1 阶段地图 / P2 词汇学习 / P3 词汇详解 / P7 复习；
 * - P4 / P5 / P6 / P8 / P9 属 T05 交付范围，暂用占位组件接通路由（可切换、可构建），
 *   T05 落地时替换对应 `element` 即可；
 * - 不使用 `<Link>`（Lynx 无此组件），导航统一 `useNavigate()`（见 `navigation.ts`）。
 */

interface PlaceholderProps {
  title: string
  note: string
}

/** 占位页（T05 页面未落地前保证路由可切换）。 */
function PagePlaceholder(props: PlaceholderProps) {
  const location = useLocation()
  return (
    <view className='Page'>
      <text className='Page-title'>{props.title}</text>
      <text className='Page-path'>{location.pathname}</text>
      <text className='Page-note'>{props.note}</text>
    </view>
  )
}

/** 全部路由定义（5 Tab + 5 二级 + 兜底）。 */
export function AppRoutes() {
  return (
    <Routes>
      <Route path={ROUTES.home} element={<HomePage />} />
      <Route path={ROUTES.stages} element={<StageMapPage />} />
      <Route
        path={ROUTES.grammar}
        element={
          <PagePlaceholder title='语法列表' note='P4 语法列表（T05 交付）' />
        }
      />
      <Route path={ROUTES.review} element={<ReviewPage />} />
      <Route
        path={ROUTES.me}
        element={<PagePlaceholder title='我的' note='P9 我的（T05 交付）' />}
      />
      <Route path={ROUTES.study} element={<StudyPage />} />
      <Route path={ROUTES.vocab} element={<VocabDetailPage />} />
      <Route
        path={ROUTES.grammarDetail}
        element={
          <PagePlaceholder title='语法详解' note='P5 语法详解（T05 交付）' />
        }
      />
      <Route
        path={ROUTES.graph}
        element={
          <PagePlaceholder title='知识图谱' note='P6 知识图谱（T05 交付）' />
        }
      />
      <Route
        path={ROUTES.quiz}
        element={<PagePlaceholder title='自测' note='P8 自测（T05 交付）' />}
      />
      <Route
        path='*'
        element={
          <PagePlaceholder title='页面不存在' note='未匹配到路由，请返回首页' />
        }
      />
    </Routes>
  )
}
