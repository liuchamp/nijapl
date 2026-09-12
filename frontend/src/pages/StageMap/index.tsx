import './index.css'
import { NodeStateBadge } from '../../components/NodeStateBadge/index.js'
import { STRINGS } from '../../constants/strings.js'
import { repository } from '../../data/index.js'
import { useNavigation } from '../../router/navigation.js'
import { appActions, useAppStore } from '../../store/hooks.js'
import {
  selectModuleNodeState,
  selectModuleProgress,
  selectStageNodeState,
  selectStageUnlocked,
} from '../../store/selectors.js'

/**
 * P1 阶段地图（架构 §7 T04 判据 7）。
 *
 * - 4 阶段树：每阶段展示其下模块；
 * - **解锁规则**：上一含词阶段完成度 ≥ 80% 才解锁（可开关）；
 * - **五态节点**：未解锁 / 未学 / 学习中 / 已掌握 / 需强化；
 * - **冲刺期短路**：`hasContent=false` 阶段显示说明、不参与完成度计算。
 */

/** P1 阶段地图。 */
export function StageMapPage() {
  const state = useAppStore((snapshot) => snapshot)
  const nav = useNavigation()
  const stages = repository.getStages()
  const unlockEnabled = state.settings.unlockRuleEnabled

  return (
    <div className="StageMap">
      <span className="StageMap-title">{STRINGS.stage.title}</span>
      <span className="StageMap-subtitle">{STRINGS.stage.subtitle}</span>

      <div className="StageMap-rule" onClick={appActions.toggleUnlockRule}>
        <span className="StageMap-ruleText">
          {unlockEnabled
            ? STRINGS.stage.lockedHint
            : STRINGS.stage.unlockRuleOff}
        </span>
        <span className="StageMap-ruleToggle">
          {`${STRINGS.stage.ruleLabel}·${
            unlockEnabled
              ? STRINGS.stage.ruleToggleOn
              : STRINGS.stage.ruleToggleOff
          }`}
        </span>
      </div>

      {stages.map((stage) => {
        const nodeState = selectStageNodeState(state, stage.id)
        const unlocked = selectStageUnlocked(state, stage.id)
        const modules = repository.getModules(stage.id)
        return (
          <div key={stage.id} className="StageMap-stage">
            <div className="StageMap-stageHead">
              <div className="StageMap-stageLeft">
                <span className="StageMap-stageName">{stage.name}</span>
                <span className="StageMap-stageMeta">
                  {`${STRINGS.stage.weekLabel} ${stage.weekRange.start}-${stage.weekRange.end}`}
                </span>
              </div>
              <NodeStateBadge state={nodeState} />
            </div>

            {stage.hasContent ? (
              <div className="StageMap-modules">
                {modules.map((module) => {
                  const summary = selectModuleProgress(state, module.id)
                  const moduleState = unlocked
                    ? selectModuleNodeState(state, module.id)
                    : 'locked'
                  return (
                    <div
                      key={module.id}
                      className={
                        unlocked
                          ? 'StageMap-module'
                          : 'StageMap-module StageMap-module--locked'
                      }
                      onClick={() => {
                        if (unlocked) {
                          nav.goStudy(module.id)
                        }
                      }}
                    >
                      <div className="StageMap-moduleLeft">
                        <span className="StageMap-moduleName">
                          {module.name}
                        </span>
                        <span className="StageMap-moduleMeta">
                          {`${summary.learned}/${summary.total}${STRINGS.stage.wordCountUnit}`}
                        </span>
                      </div>
                      <NodeStateBadge state={moduleState} />
                    </div>
                  )
                })}
              </div>
            ) : (
              <span className="StageMap-sprint">
                {STRINGS.stage.sprintBody}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}
