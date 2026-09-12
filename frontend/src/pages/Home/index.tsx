import './index.css'
import { NodeStateBadge } from '../../components/NodeStateBadge/index.js'
import { ProgressRing } from '../../components/ProgressRing/index.js'
import {
  DAILY_GRAMMAR_GOAL,
  DAILY_NEW_GOAL,
  DAILY_REVIEW_GOAL,
} from '../../constants/srs.js'
import { STRINGS } from '../../constants/strings.js'
import { repository } from '../../data/index.js'
import { useNavigation } from '../../router/navigation.js'
import { useAppStore } from '../../store/hooks.js'
import {
  selectContinueTarget,
  selectStageCompletion,
  selectStageNodeState,
  selectTodayStats,
  selectWeakTop,
} from '../../store/selectors.js'

/**
 * P0 首页仪表盘（架构 §7 T04 判据 1）。
 *
 * - **≤3 次点击到 P2**：主按钮「继续学习 / 开始学习」直达 `studyPath(moduleId)`（1 击）；
 * - **断点续学**：目标来自 `selectContinueTarget`（读 `session.moduleId` / `lastWordIndex`）；
 * - 今日目标进度环、今日统计、薄弱预警、阶段进度一览、知识图谱入口（P6）。
 */

/** P0 首页。 */
export function HomePage() {
  const state = useAppStore((snapshot) => snapshot)
  const nav = useNavigation()

  const now = Date.now()
  const stats = selectTodayStats(state, now)
  const target = selectContinueTarget(state)
  const weakTop = selectWeakTop(state, 3)
  const stages = repository.getStages()

  const hasSession = state.session.moduleId !== ''
  const newRatio = stats.newCount / DAILY_NEW_GOAL

  return (
    <div className="Home">
      <div className="Home-head">
        <span className="Home-greeting">{STRINGS.home.greeting}</span>
        <span className="Home-appName">{STRINGS.app.name}</span>
      </div>

      <div className="Home-goal">
        <ProgressRing
          value={newRatio}
          label={`${stats.newCount}/${DAILY_NEW_GOAL}`}
        />
        <div className="Home-goalSide">
          <span className="Home-goalTitle">{STRINGS.home.todayGoal}</span>
          <span className="Home-goalLine">
            {`${STRINGS.home.newLearned} ${stats.newCount}/${DAILY_NEW_GOAL}`}
          </span>
          <span className="Home-goalLine">
            {`${STRINGS.home.reviewed} ${stats.reviewCount}/${DAILY_REVIEW_GOAL}`}
          </span>
          <span className="Home-goalLine">
            {`${STRINGS.home.grammarLearned} ${stats.grammarCount}/${DAILY_GRAMMAR_GOAL}`}
          </span>
        </div>
      </div>

      <div className="Home-stats">
        <div className="Home-stat">
          <span className="Home-statValue">{stats.newCount}</span>
          <span className="Home-statLabel">{STRINGS.home.newLearned}</span>
        </div>
        <div className="Home-stat">
          <span className="Home-statValue">{stats.reviewCount}</span>
          <span className="Home-statLabel">{STRINGS.home.reviewed}</span>
        </div>
        <div className="Home-stat">
          <span className="Home-statValue">
            {`${stats.streakDays}${STRINGS.home.dayUnit}`}
          </span>
          <span className="Home-statLabel">{STRINGS.home.streak}</span>
        </div>
        <div className="Home-stat">
          <span className="Home-statValue">{stats.dueCount}</span>
          <span className="Home-statLabel">{STRINGS.home.dueToday}</span>
        </div>
      </div>

      <div
        className="Home-primary"
        onClick={() => {
          if (target !== null) {
            nav.goStudy(target.moduleId)
          } else {
            nav.goStages()
          }
        }}
      >
        <span className="Home-primaryLabel">
          {hasSession
            ? STRINGS.home.continueLearning
            : STRINGS.home.startLearning}
        </span>
      </div>
      {hasSession ? null : (
        <span className="Home-hint">{STRINGS.home.noSessionHint}</span>
      )}

      <div className="Home-section">
        <span className="Home-sectionTitle">{STRINGS.home.weakWarning}</span>
        {weakTop.length === 0 ? (
          <span className="Home-sectionEmpty">{STRINGS.home.weakEmpty}</span>
        ) : (
          <div className="Home-weakList">
            {weakTop.map((word) => (
              <div
                key={word.id}
                className="Home-weakItem"
                onClick={() => nav.goVocab(word.id)}
              >
                <span className="Home-weakKana">{word.kana}</span>
                <span className="Home-weakMeaning">{word.meaning}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="Home-section">
        <div className="Home-sectionHead">
          <span className="Home-sectionTitle">
            {STRINGS.home.stageProgress}
          </span>
          <div className="Home-graphEntry" onClick={() => nav.goGraph()}>
            <span className="Home-graphLabel">{STRINGS.home.graphEntry}</span>
          </div>
        </div>
        <div className="Home-stageList">
          {stages.map((stage) => {
            const completion = selectStageCompletion(state, stage.id)
            const nodeState = selectStageNodeState(state, stage.id)
            const percent = completion < 0 ? 0 : Math.round(completion * 100)
            return (
              <div key={stage.id} className="Home-stageItem">
                <div className="Home-stageLeft">
                  <span className="Home-stageName">{stage.name}</span>
                  <span className="Home-stagePercent">
                    {stage.hasContent
                      ? `${percent}%`
                      : STRINGS.stage.sprintTitle}
                  </span>
                </div>
                <NodeStateBadge state={nodeState} />
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
