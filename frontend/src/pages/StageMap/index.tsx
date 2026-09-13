import { NodeStateBadge } from '../../components/NodeStateBadge/index.js'
import { KANA_TOTAL } from '../../constants/kana.js'
import { STRINGS } from '../../constants/strings.js'
import { repository } from '../../data/index.js'
import { useNavigation } from '../../router/navigation.js'
import { appActions, useAppStore } from '../../store/hooks.js'
import {
  selectKanaMasteredCount,
  selectKanaNodeState,
  selectModuleNodeState,
  selectModuleProgress,
  selectStageNodeState,
  selectStageUnlocked,
} from '../../store/selectors.js'

/**
 * P1 阶段地图（架构 §7 T04 判据 7 + 设计 §5.6 衔接点）。
 *
 * - 4 阶段树：每阶段展示其下模块；
 * - **树顶 K 节点**：「K · 五十音入门」——N5 词汇的前置能力，与模块节点**同构**（五态徽章 + 完成度）；
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
    <div className="StageMap flex flex-col flex-1 w-full p-md">
      <span className="StageMap-title text-lg font-bold">
        {STRINGS.stage.title}
      </span>
      <span className="StageMap-subtitle mt-xs text-xs text-text-muted">
        {STRINGS.stage.subtitle}
      </span>

      {/* 树顶 K 节点：不占阶段编号，排在 s1 之前（它是「能不能开始学词」的前置） */}
      <div className="StageMap-stage flex flex-col w-full mt-md p-md bg-surface rounded-lg">
        <div className="StageMap-stageHead flex flex-row items-center justify-between w-full">
          <div className="StageMap-stageLeft flex flex-col">
            <span className="StageMap-stageName text-md font-bold">
              {STRINGS.kana.nodeTitle}
            </span>
            <span className="StageMap-stageMeta mt-xs text-xs text-text-muted">
              {`${selectKanaMasteredCount(state)}/${KANA_TOTAL}${STRINGS.kana.kanaUnit} · ${STRINGS.kana.nodeMeta}`}
            </span>
          </div>
          <NodeStateBadge state={selectKanaNodeState(state)} />
        </div>
        <div className="StageMap-modules flex flex-col w-full mt-sm">
          <div
            className="StageMap-module flex flex-row items-center justify-between w-full p-sm mt-xs bg-surface-alt rounded-md"
            onClick={nav.goKana}
          >
            <div className="StageMap-moduleLeft flex flex-col">
              <span className="StageMap-moduleName text-sm">
                {STRINGS.kana.title}
              </span>
              <span className="StageMap-moduleMeta mt-xs text-xs text-text-muted">
                {STRINGS.kana.subtitle}
              </span>
            </div>
            <NodeStateBadge state={selectKanaNodeState(state)} />
          </div>
        </div>
      </div>

      <div
        className="StageMap-rule cursor-pointer select-none flex flex-row items-center justify-between w-full mt-md p-sm bg-surface-alt rounded-md"
        onClick={appActions.toggleUnlockRule}
      >
        <span className="StageMap-ruleText cursor-pointer select-none flex-1 text-xs text-text-muted">
          {unlockEnabled
            ? STRINGS.stage.lockedHint
            : STRINGS.stage.unlockRuleOff}
        </span>
        <span className="StageMap-ruleToggle cursor-pointer select-none ml-sm text-xs text-primary">
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
          <div
            key={stage.id}
            className="StageMap-stage flex flex-col w-full mt-md p-md bg-surface rounded-lg"
          >
            <div className="StageMap-stageHead flex flex-row items-center justify-between w-full">
              <div className="StageMap-stageLeft flex flex-col">
                <span className="StageMap-stageName text-md font-bold">
                  {stage.name}
                </span>
                <span className="StageMap-stageMeta mt-xs text-xs text-text-muted">
                  {`${STRINGS.stage.weekLabel} ${stage.weekRange.start}-${stage.weekRange.end}`}
                </span>
              </div>
              <NodeStateBadge state={nodeState} />
            </div>

            {stage.hasContent ? (
              <div className="StageMap-modules flex flex-col w-full mt-sm">
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
                          ? 'StageMap-module flex flex-row items-center justify-between w-full p-sm mt-xs bg-surface-alt rounded-md'
                          : 'StageMap-module StageMap-module--locked opacity-50 flex flex-row items-center justify-between w-full p-sm mt-xs bg-surface-alt rounded-md'
                      }
                      onClick={() => {
                        if (unlocked) {
                          nav.goStudy(module.id)
                        }
                      }}
                    >
                      <div className="StageMap-moduleLeft flex flex-col">
                        <span className="StageMap-moduleName text-sm">
                          {module.name}
                        </span>
                        <span className="StageMap-moduleMeta mt-xs text-xs text-text-muted">
                          {`${summary.learned}/${summary.total}${STRINGS.stage.wordCountUnit}`}
                        </span>
                      </div>
                      <NodeStateBadge state={moduleState} />
                    </div>
                  )
                })}
              </div>
            ) : (
              <span className="StageMap-sprint mt-sm text-xs text-text-muted">
                {STRINGS.stage.sprintBody}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}
