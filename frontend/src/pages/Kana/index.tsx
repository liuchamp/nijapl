import { useState } from 'react'
import { KanaTable } from '../../components/KanaTable/index.js'
import { NodeStateBadge } from '../../components/NodeStateBadge/index.js'
import { ProgressRing } from '../../components/ProgressRing/index.js'
import {
  KANA_SCRIPTS,
  KANA_TOTAL,
  KANA_VOICE_TYPES,
} from '../../constants/kana.js'
import { STRINGS } from '../../constants/strings.js'
import { repository } from '../../data/index.js'
import { useNavigation } from '../../router/navigation.js'
import { enterKanaGroup } from '../../services/kanaWriteSession.js'
import { useAppStore } from '../../store/hooks.js'
import {
  selectIsKanaMastered,
  selectKanaContinueTarget,
  selectKanaGateActive,
  selectKanaGroupNodeState,
  selectKanaGroupProgress,
  selectKanaMasteredCount,
  selectKanaOverallCompletion,
  selectKanaUnlocked,
} from '../../store/selectors.js'
import type { KanaScript, KanaVoiceType } from '../../types/kana.js'

/**
 * K0 五十音总览（设计 §5.1）。
 *
 * 三件用户必须在 3 秒内看懂的事：
 * 1. **五十音是什么、有多少** —— 4 个主 Tab 的计数（清音 46 / 浊音 20 / 半浊音 5 / 拗音 33）；
 * 2. **我在哪** —— 总进度环 `n/104` + 12 关列表的逐关五态徽章；
 * 3. **下一步做什么** —— 唯一主 CTA（开始 / 继续 / 结业测验）。
 *
 * 音表是**浏览面**，不是学习面：格子点进去只是「从这一格开始学」的快捷方式，
 * 真正的学习闭环在 K1。学习模式开关（§5.1）只负责「浏览态 ↔ 可点学习区」的切换，
 * 不过滤任何内容——与参考产品语义一致。
 */
export function KanaPage() {
  const state = useAppStore((snapshot) => snapshot)
  const nav = useNavigation()

  const [voiceType, setVoiceType] = useState<KanaVoiceType>('清音')
  const [scripts, setScripts] = useState<KanaScript[]>(['hiragana', 'katakana'])
  const [showRomaji, setShowRomaji] = useState(true)
  const [studyMode, setStudyMode] = useState(false)

  const groups = repository.getKanaGroups()
  const kana = repository.getKanaByVoiceType(voiceType)
  const mastered = selectKanaMasteredCount(state)
  const overall = selectKanaOverallCompletion(state)
  const graduated = selectIsKanaMastered(state)
  const target = selectKanaContinueTarget(state)
  const gateActive = selectKanaGateActive(state)
  const lockedGroupIds = groups
    .filter((group) => !selectKanaUnlocked(state, group.id))
    .map((group) => group.id)

  /**
   * 进入某关并从指定音开始。
   *
   * 写 store 的部分收敛在 `services/kanaWriteSession.enterKanaGroup`（四个入口共用），
   * 本页只负责导航。
   */
  function enterKana(groupId: string, index: number): void {
    enterKanaGroup(groupId, index)
    nav.goKanaStudy(groupId)
  }

  function toggleScript(script: KanaScript): void {
    setScripts((prev) => {
      const next = prev.includes(script)
        ? prev.filter((item) => item !== script)
        : [...prev, script]
      // 固定回 canonical 顺序：勾选顺序不同不应让「平假名/片假名」的显示层级来回跳。
      return KANA_SCRIPTS.filter((item) => next.includes(item))
    })
  }

  function onPickKana(kanaId: string): void {
    const item = repository.getKanaById(kanaId)
    if (item === undefined) {
      return
    }
    const index = repository
      .getKanaByGroup(item.groupId)
      .findIndex((member) => member.id === kanaId)
    if (index < 0) {
      return
    }
    enterKana(item.groupId, index)
  }

  function onPrimary(): void {
    if (target === null) {
      nav.goKanaQuiz()
      return
    }
    enterKana(target.groupId, target.index)
  }

  if (groups.length === 0) {
    return (
      <div className="Kana flex flex-col flex-1 w-full p-md">
        <div className="Kana-head flex flex-row items-center justify-between w-full">
          <div
            className="Kana-back cursor-pointer select-none px-md py-xs bg-surface-alt rounded-pill"
            onClick={nav.back}
          >
            <span className="Kana-backLabel text-sm text-text">
              {STRINGS.common.back}
            </span>
          </div>
          <span className="Kana-title text-lg font-bold">
            {STRINGS.kana.title}
          </span>
        </div>
        <div className="Kana-empty flex flex-row items-center justify-center flex-1">
          <span className="Kana-emptyLabel text-md text-text-muted">
            {STRINGS.kana.empty}
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="Kana flex flex-col flex-1 w-full p-md">
      <div className="Kana-head flex flex-row items-center justify-between w-full">
        <div
          className="Kana-back cursor-pointer select-none px-md py-xs bg-surface-alt rounded-pill"
          onClick={nav.back}
        >
          <span className="Kana-backLabel text-sm text-text">
            {STRINGS.common.back}
          </span>
        </div>
        <span className="Kana-title text-lg font-bold">
          {STRINGS.kana.title}
        </span>
      </div>

      <span className="Kana-subtitle mt-xs text-xs text-text-muted">
        {STRINGS.kana.subtitle}
      </span>

      {/* 总进度 + 主 CTA */}
      <div className="Kana-overall flex flex-row items-center gap-md w-full mt-md p-md bg-surface rounded-lg">
        <ProgressRing
          value={overall}
          label={`${mastered}/${KANA_TOTAL}`}
          size={160}
        />
        <div className="Kana-overallRight flex flex-col flex-1">
          <span className="Kana-overallLabel text-md font-bold">
            {STRINGS.kana.overallLabel}
          </span>
          {graduated ? (
            <>
              <span className="Kana-badge mt-xs text-xs text-success">
                {STRINGS.kana.gateBadge}
              </span>
              <span className="Kana-overallBody mt-xs text-xs text-text-muted">
                {STRINGS.kana.graduationBody}
              </span>
              <div
                className="Kana-primary cursor-pointer select-none flex flex-row items-center justify-center mt-sm py-sm bg-primary rounded-pill"
                onClick={nav.goStages}
              >
                <span className="Kana-primaryLabel text-sm font-bold text-text">
                  {STRINGS.kana.goVocab}
                </span>
              </div>
            </>
          ) : (
            <>
              {gateActive ? (
                <span className="Kana-overallBody mt-xs text-xs text-text-muted">
                  {STRINGS.kana.gateHint}
                </span>
              ) : null}
              <div
                className="Kana-primary cursor-pointer select-none flex flex-row items-center justify-center mt-sm py-sm bg-primary rounded-pill"
                onClick={onPrimary}
              >
                <span className="Kana-primaryLabel text-sm font-bold text-text">
                  {target === null
                    ? STRINGS.kana.graduationEntry
                    : mastered === 0
                      ? STRINGS.kana.startEntry
                      : STRINGS.kana.continueEntry}
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* 主 Tab：音类（4 个，半浊音独立成类，不混进浊音） */}
      <div className="Kana-tabs flex flex-row gap-xs w-full mt-md">
        {KANA_VOICE_TYPES.map((item) => (
          <div
            key={item}
            className={
              voiceType === item
                ? 'Kana-tab Kana-tab--on cursor-pointer select-none flex flex-col items-center justify-center flex-1 py-sm rounded-md bg-primary-soft border-[calc(1*var(--rpx))] border-primary'
                : 'Kana-tab cursor-pointer select-none flex flex-col items-center justify-center flex-1 py-sm rounded-md bg-surface-alt border-[calc(1*var(--rpx))] border-border'
            }
            onClick={() => setVoiceType(item)}
          >
            <span className="Kana-tabLabel text-sm text-text">
              {STRINGS.kana.voiceLabels[item]}
            </span>
            <span className="Kana-tabCount mt-2 text-xs text-text-muted">
              {repository.getKanaByVoiceType(item).length}
            </span>
          </div>
        ))}
      </div>

      {/* 子 Tab：书写体系（多选）+ 罗马音层 */}
      <div className="Kana-subTabs flex flex-row items-center gap-xs w-full mt-sm">
        {KANA_SCRIPTS.map((item) => (
          <div
            key={item}
            className={
              scripts.includes(item)
                ? 'Kana-subTab Kana-subTab--on cursor-pointer select-none flex flex-row items-center justify-center px-sm py-xs rounded-pill bg-primary-soft opacity-100'
                : 'Kana-subTab cursor-pointer select-none flex flex-row items-center justify-center px-sm py-xs rounded-pill bg-surface-alt opacity-55'
            }
            onClick={() => toggleScript(item)}
          >
            <span className="Kana-subTabLabel text-xs text-text">
              {item === 'hiragana'
                ? STRINGS.kana.scriptHiragana
                : STRINGS.kana.scriptKatakana}
            </span>
          </div>
        ))}
        <div
          className={
            showRomaji
              ? 'Kana-subTab Kana-subTab--on cursor-pointer select-none flex flex-row items-center justify-center px-sm py-xs rounded-pill bg-primary-soft opacity-100'
              : 'Kana-subTab cursor-pointer select-none flex flex-row items-center justify-center px-sm py-xs rounded-pill bg-surface-alt opacity-55'
          }
          onClick={() => setShowRomaji((prev) => !prev)}
        >
          <span className="Kana-subTabLabel text-xs text-text">
            {STRINGS.kana.scriptRomaji}
          </span>
        </div>
        <div
          className={
            studyMode
              ? 'Kana-mode Kana-mode--on cursor-pointer select-none flex flex-row items-center justify-center ml-auto px-sm py-xs rounded-pill bg-primary'
              : 'Kana-mode cursor-pointer select-none flex flex-row items-center justify-center ml-auto px-sm py-xs rounded-pill bg-surface-alt'
          }
          onClick={() => setStudyMode((prev) => !prev)}
        >
          <span className="Kana-modeLabel text-xs text-text">
            {studyMode ? STRINGS.kana.studyModeOn : STRINGS.kana.studyModeOff}
          </span>
        </div>
      </div>
      <span className="Kana-modeHint mt-xs mb-xs text-xs text-text-muted">
        {STRINGS.kana.studyModeHint}
      </span>

      <KanaTable
        kana={kana}
        scripts={scripts}
        showRomaji={showRomaji}
        studyMode={studyMode}
        lockedGroupIds={lockedGroupIds}
        progress={state.progress}
        onPickKana={onPickKana}
      />

      {/* 12 关列表 */}
      <span className="Kana-sectionTitle mt-md mb-xs text-sm font-bold">
        {STRINGS.kana.groupSection}
      </span>
      <div className="Kana-groups flex flex-col w-full">
        {groups.map((group) => {
          const unlocked = selectKanaUnlocked(state, group.id)
          const progress = selectKanaGroupProgress(state, group.id)
          return (
            <div
              key={group.id}
              className={
                unlocked
                  ? 'Kana-group cursor-pointer select-none flex flex-row items-center justify-between w-full mt-xs p-sm rounded-md bg-surface-alt'
                  : 'Kana-group Kana-group--locked cursor-default opacity-50 select-none flex flex-row items-center justify-between w-full mt-xs p-sm rounded-md bg-surface-alt'
              }
              onClick={() => {
                if (unlocked) {
                  nav.goKanaStudy(group.id)
                }
              }}
            >
              <div className="Kana-groupLeft flex flex-col flex-1">
                <span className="Kana-groupName text-sm">{group.name}</span>
                <span className="Kana-groupMeta mt-xs text-xs text-text-muted">
                  {unlocked
                    ? `${progress.mastered}/${progress.total}${STRINGS.kana.kanaUnit}`
                    : STRINGS.kana.lockedHint}
                </span>
              </div>
              <NodeStateBadge
                state={selectKanaGroupNodeState(state, group.id)}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
