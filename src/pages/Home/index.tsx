import './index.css'
import { NodeStateBadge } from '../../components/NodeStateBadge/index.js'
import { ProgressRing } from '../../components/ProgressRing/index.js'
import { DAILY_NEW_GOAL, DAILY_REVIEW_GOAL } from '../../constants/srs.js'
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
  const reviewRatio = stats.reviewCount / DAILY_REVIEW_GOAL

  return (
    <view className="Home">
      <view className="Home-head">
        <text className="Home-greeting">{STRINGS.home.greeting}</text>
        <text className="Home-appName">{STRINGS.app.name}</text>
      </view>

      <view className="Home-goal">
        <ProgressRing
          value={newRatio}
          label={`${stats.newCount}/${DAILY_NEW_GOAL}`}
        />
        <view className="Home-goalSide">
          <text className="Home-goalTitle">{STRINGS.home.todayGoal}</text>
          <text className="Home-goalLine">
            {`${STRINGS.home.newLearned} ${stats.newCount}`}
          </text>
          <text className="Home-goalLine">
            {`${STRINGS.home.reviewed} ${stats.reviewCount}`}
          </text>
          <text className="Home-goalLine">
            {`${STRINGS.home.reviewed} ${Math.round(reviewRatio * 100)}%`}
          </text>
        </view>
      </view>

      <view className="Home-stats">
        <view className="Home-stat">
          <text className="Home-statValue">{stats.newCount}</text>
          <text className="Home-statLabel">{STRINGS.home.newLearned}</text>
        </view>
        <view className="Home-stat">
          <text className="Home-statValue">{stats.reviewCount}</text>
          <text className="Home-statLabel">{STRINGS.home.reviewed}</text>
        </view>
        <view className="Home-stat">
          <text className="Home-statValue">
            {`${stats.streakDays}${STRINGS.home.dayUnit}`}
          </text>
          <text className="Home-statLabel">{STRINGS.home.streak}</text>
        </view>
        <view className="Home-stat">
          <text className="Home-statValue">{stats.dueCount}</text>
          <text className="Home-statLabel">{STRINGS.home.dueToday}</text>
        </view>
      </view>

      <view
        className="Home-primary"
        catchtap={() => {
          if (target !== null) {
            nav.goStudy(target.moduleId)
          } else {
            nav.goStages()
          }
        }}
      >
        <text className="Home-primaryLabel">
          {hasSession
            ? STRINGS.home.continueLearning
            : STRINGS.home.startLearning}
        </text>
      </view>
      {hasSession ? null : (
        <text className="Home-hint">{STRINGS.home.noSessionHint}</text>
      )}

      <view className="Home-section">
        <text className="Home-sectionTitle">{STRINGS.home.weakWarning}</text>
        {weakTop.length === 0 ? (
          <text className="Home-sectionEmpty">{STRINGS.home.weakEmpty}</text>
        ) : (
          <view className="Home-weakList">
            {weakTop.map((word) => (
              <view
                key={word.id}
                className="Home-weakItem"
                catchtap={() => nav.goVocab(word.id)}
              >
                <text className="Home-weakKana">{word.kana}</text>
                <text className="Home-weakMeaning">{word.meaning}</text>
              </view>
            ))}
          </view>
        )}
      </view>

      <view className="Home-section">
        <view className="Home-sectionHead">
          <text className="Home-sectionTitle">
            {STRINGS.home.stageProgress}
          </text>
          <view className="Home-graphEntry" catchtap={() => nav.goGraph()}>
            <text className="Home-graphLabel">{STRINGS.home.graphEntry}</text>
          </view>
        </view>
        <view className="Home-stageList">
          {stages.map((stage) => {
            const completion = selectStageCompletion(state, stage.id)
            const nodeState = selectStageNodeState(state, stage.id)
            const percent = completion < 0 ? 0 : Math.round(completion * 100)
            return (
              <view key={stage.id} className="Home-stageItem">
                <view className="Home-stageLeft">
                  <text className="Home-stageName">{stage.name}</text>
                  <text className="Home-stagePercent">
                    {stage.hasContent
                      ? `${percent}%`
                      : STRINGS.stage.sprintTitle}
                  </text>
                </view>
                <NodeStateBadge state={nodeState} />
              </view>
            )
          })}
        </view>
      </view>
    </view>
  )
}
