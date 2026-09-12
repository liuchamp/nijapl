import { Route, Routes, useLocation } from 'react-router'
import { ROUTES } from '../constants/routes.js'
import { GrammarDetailPage } from '../pages/GrammarDetail/index.js'
import { GrammarListPage } from '../pages/GrammarList/index.js'
import { GraphPage } from '../pages/Graph/index.js'
import { HomePage } from '../pages/Home/index.js'
import { MePage } from '../pages/Me/index.js'
import { QuizPage } from '../pages/Quiz/index.js'
import { ReviewPage } from '../pages/Review/index.js'
import { StageMapPage } from '../pages/StageMap/index.js'
import { StudyPage } from '../pages/Study/index.js'
import { VocabDetailPage } from '../pages/VocabDetail/index.js'

/**
 * 路由表（架构 §1.2 / §2.8）。
 *
 * - T04 交付页面：P0 首页 / P1 阶段地图 / P2 词汇学习 / P3 词汇详解 / P7 复习；
 * - T05 交付页面：P4 语法列表 / P5 语法详解 / P6 知识图谱 / P8 自测 / P9 我的（已落地）；
 * - 不使用 `<Link>`（Lynx 无此组件），导航统一 `useNavigate()`（见 `navigation.ts`）。
 */

interface PlaceholderProps {
  title: string
  note: string
}

/** 占位页（仅用于未匹配路由的兜底）。 */
function PagePlaceholder(props: PlaceholderProps) {
  const location = useLocation()
  return (
    <div className="Page">
      <span className="Page-title">{props.title}</span>
      <span className="Page-path">{location.pathname}</span>
      <span className="Page-note">{props.note}</span>
    </div>
  )
}

/** 全部路由定义（5 Tab + 5 二级 + 兜底）。 */
export function AppRoutes() {
  return (
    <Routes>
      <Route path={ROUTES.home} element={<HomePage />} />
      <Route path={ROUTES.stages} element={<StageMapPage />} />
      <Route path={ROUTES.grammar} element={<GrammarListPage />} />
      <Route path={ROUTES.review} element={<ReviewPage />} />
      <Route path={ROUTES.me} element={<MePage />} />
      <Route path={ROUTES.study} element={<StudyPage />} />
      <Route path={ROUTES.vocab} element={<VocabDetailPage />} />
      <Route path={ROUTES.grammarDetail} element={<GrammarDetailPage />} />
      <Route path={ROUTES.graph} element={<GraphPage />} />
      <Route path={ROUTES.quiz} element={<QuizPage />} />
      <Route
        path="*"
        element={
          <PagePlaceholder title="页面不存在" note="未匹配到路由，请返回首页" />
        }
      />
    </Routes>
  )
}
