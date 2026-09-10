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
    <view className="StageMap">
      <text className="StageMap-title">{STRINGS.stage.title}</text>
      <text className="StageMap-subtitle">{STRINGS.stage.subtitle}</text>

      <view className="StageMap-rule" catchtap={appActions.toggleUnlockRule}>
        <text className="StageMap-ruleText">
          {unlockEnabled
            ? STRINGS.stage.lockedHint
            : STRINGS.stage.unlockRuleOff}
        </text>
        <text className="StageMap-ruleToggle">
          {`${STRINGS.stage.ruleLabel}·${
            unlockEnabled
              ? STRINGS.stage.ruleToggleOn
              : STRINGS.stage.ruleToggleOff
          }`}
        </text>
      </view>

      {stages.map((stage) => {
        const nodeState = selectStageNodeState(state, stage.id)
        const unlocked = selectStageUnlocked(state, stage.id)
        const modules = repository.getModules(stage.id)
        return (
          <view key={stage.id} className="StageMap-stage">
            <view className="StageMap-stageHead">
              <view className="StageMap-stageLeft">
                <text className="StageMap-stageName">{stage.name}</text>
                <text className="StageMap-stageMeta">
                  {`${STRINGS.stage.weekLabel} ${stage.weekRange.start}-${stage.weekRange.end}`}
                </text>
              </view>
              <NodeStateBadge state={nodeState} />
            </view>

            {stage.hasContent ? (
              <view className="StageMap-modules">
                {modules.map((module) => {
                  const summary = selectModuleProgress(state, module.id)
                  const moduleState = unlocked
                    ? selectModuleNodeState(state, module.id)
                    : 'locked'
                  return (
                    <view
                      key={module.id}
                      className={
                        unlocked
                          ? 'StageMap-module'
                          : 'StageMap-module StageMap-module--locked'
                      }
                      catchtap={() => {
                        if (unlocked) {
                          nav.goStudy(module.id)
                        }
                      }}
                    >
                      <view className="StageMap-moduleLeft">
                        <text className="StageMap-moduleName">
                          {module.name}
                        </text>
                        <text className="StageMap-moduleMeta">
                          {`${summary.learned}/${summary.total}${STRINGS.stage.wordCountUnit}`}
                        </text>
                      </view>
                      <NodeStateBadge state={moduleState} />
                    </view>
                  )
                })}
              </view>
            ) : (
              <text className="StageMap-sprint">
                {STRINGS.stage.sprintBody}
              </text>
            )}
          </view>
        )
      })}
    </view>
  )
}
