import './index.css'
import { Icon } from '../../components/Icon/index.js'
import { NodeStateBadge } from '../../components/NodeStateBadge/index.js'
import { ProgressRing } from '../../components/ProgressRing/index.js'
import { KANA_TOTAL } from '../../constants/kana.js'
import {
  DAILY_GRAMMAR_GOAL,
  DAILY_NEW_GOAL,
  DAILY_REVIEW_GOAL,
} from '../../constants/srs.js'
import { STRINGS } from '../../constants/strings.js'
import { repository } from '../../data/index.js'
import { useNavigation } from '../../router/navigation.js'
import { enterKanaGroup } from '../../services/kanaWriteSession.js'
import { useAppStore } from '../../store/hooks.js'
import {
  selectContinueTarget,
  selectIsKanaMastered,
  selectKanaContinueTarget,
  selectKanaGateActive,
  selectKanaMasteredCount,
  selectKanaOverallCompletion,
  selectStageCompletion,
  selectStageNodeState,
  selectTodayStats,
  selectWeakTop,
} from '../../store/selectors.js'

/**
 * P0 首页仪表盘（架构 §7 T04 判据 1 + 设计 §5.6 衔接点）。
 *
 * - **≤3 次点击到 P2**：主按钮「继续学习 / 开始学习」直达 `studyPath(moduleId)`（1 击）；
 * - **断点续学**：目标来自 `selectContinueTarget`（读 `session.moduleId` / `lastWordIndex`）；
 * - **假名门控**（Q1 裁决：默认开，P9 可关）：清音 5 关未达标时，主按钮**改指向 K 域**——
 *   零基础用户不会一进门就撞上读不出的词条。达标后自动放行，不需要用户手动关开关。
 * - 今日目标进度环、今日统计、薄弱预警、假名基础卡、阶段进度一览、知识图谱入口（P6）。
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

  const kanaGate = selectKanaGateActive(state)
  const kanaTarget = selectKanaContinueTarget(state)
  const kanaMastered = selectKanaMasteredCount(state)
  const kanaRatio = selectKanaOverallCompletion(state)
  const kanaGraduated = selectIsKanaMastered(state)

  const hasSession = state.session.moduleId !== ''
  const newRatio = stats.newCount / DAILY_NEW_GOAL

  /** 进 K 域：有续学目标就直达那一关那一音，否则回到 K0 总览。 */
  function goKana(): void {
    if (kanaTarget === null) {
      nav.goKana()
      return
    }
    enterKanaGroup(kanaTarget.groupId, kanaTarget.index)
    nav.goKanaStudy(kanaTarget.groupId)
  }

  /** 主按钮：门控生效时进 K 域，否则进词汇学习。 */
  function onPrimary(): void {
    if (kanaGate) {
      goKana()
      return
    }
    if (target !== null) {
      nav.goStudy(target.moduleId)
    } else {
      nav.goStages()
    }
  }

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

      {/* 假名基础卡（设计 §5.6）：门控未解除时它是首页的第一优先级动作 */}
      <div className="Home-kana">
        <ProgressRing
          value={kanaRatio}
          label={`${kanaMastered}/${KANA_TOTAL}`}
          size={120}
          stroke={12}
        />
        <div className="Home-kanaSide">
          <div className="Home-kanaHead">
            <span className="Home-kanaTitle">{STRINGS.kana.title}</span>
            {kanaGraduated ? (
              <span className="Home-kanaBadge">{STRINGS.kana.gateBadge}</span>
            ) : null}
          </div>
          <span className="Home-kanaMeta">
            {kanaGraduated
              ? STRINGS.kana.graduationBody
              : kanaGate
                ? STRINGS.kana.gateHint
                : `${STRINGS.kana.overallLabel} ${kanaMastered}/${KANA_TOTAL}`}
          </span>
          <div className="Home-kanaActions">
            <div className="Home-kanaBtn" onClick={goKana}>
              <span className="Home-kanaBtnLabel">
                {kanaMastered === 0
                  ? STRINGS.kana.startEntry
                  : STRINGS.kana.continueEntry}
              </span>
            </div>
            <div
              className="Home-kanaBtn Home-kanaBtn--ghost"
              onClick={nav.goKana}
            >
              <span className="Home-kanaBtnLabel">
                {STRINGS.kana.openTable}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="Home-stats">
        <div className="Home-stat">
          <span
            className="Home-statValue"
            style={{ display: 'flex', alignItems: 'center', gap: '6rpx' }}
          >
            <Icon name="trophy" size="24rpx" />
            {stats.newCount}
          </span>
          <span className="Home-statLabel">{STRINGS.home.newLearned}</span>
        </div>
        <div className="Home-stat">
          <span
            className="Home-statValue"
            style={{ display: 'flex', alignItems: 'center', gap: '6rpx' }}
          >
            <Icon name="star" size="24rpx" />
            {stats.reviewCount}
          </span>
          <span className="Home-statLabel">{STRINGS.home.reviewed}</span>
        </div>
        <div className="Home-stat">
          <span
            className="Home-statValue"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6rpx',
              color: '#F5A8BC',
            }}
          >
            <Icon name="flame" size="24rpx" />
            {`${stats.streakDays}${STRINGS.home.dayUnit}`}
          </span>
          <span className="Home-statLabel">{STRINGS.home.streak}</span>
        </div>
        <div className="Home-stat">
          <span
            className="Home-statValue"
            style={{ display: 'flex', alignItems: 'center', gap: '6rpx' }}
          >
            <Icon name="calendar" size="24rpx" />
            {stats.dueCount}
          </span>
          <span className="Home-statLabel">{STRINGS.home.dueToday}</span>
        </div>
      </div>

      <div className="Home-primary" onClick={onPrimary}>
        <span className="Home-primaryLabel">
          {kanaGate
            ? kanaMastered === 0
              ? STRINGS.kana.startEntry
              : STRINGS.kana.continueEntry
            : hasSession
              ? STRINGS.home.continueLearning
              : STRINGS.home.startLearning}
        </span>
      </div>
      {kanaGate ? (
        <span className="Home-hint">{STRINGS.kana.gateHint}</span>
      ) : hasSession ? null : (
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
