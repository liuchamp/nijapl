import './index.css'
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
      <div className="Kana">
        <div className="Kana-head">
          <div className="Kana-back" onClick={nav.back}>
            <span className="Kana-backLabel">{STRINGS.common.back}</span>
          </div>
          <span className="Kana-title">{STRINGS.kana.title}</span>
        </div>
        <div className="Kana-empty">
          <span className="Kana-emptyLabel">{STRINGS.kana.empty}</span>
        </div>
      </div>
    )
  }

  return (
    <div className="Kana">
      <div className="Kana-head">
        <div className="Kana-back" onClick={nav.back}>
          <span className="Kana-backLabel">{STRINGS.common.back}</span>
        </div>
        <span className="Kana-title">{STRINGS.kana.title}</span>
      </div>

      <span className="Kana-subtitle">{STRINGS.kana.subtitle}</span>

      {/* 总进度 + 主 CTA */}
      <div className="Kana-overall">
        <ProgressRing
          value={overall}
          label={`${mastered}/${KANA_TOTAL}`}
          size={160}
        />
        <div className="Kana-overallRight">
          <span className="Kana-overallLabel">{STRINGS.kana.overallLabel}</span>
          {graduated ? (
            <>
              <span className="Kana-badge">{STRINGS.kana.gateBadge}</span>
              <span className="Kana-overallBody">
                {STRINGS.kana.graduationBody}
              </span>
              <div className="Kana-primary" onClick={nav.goStages}>
                <span className="Kana-primaryLabel">
                  {STRINGS.kana.goVocab}
                </span>
              </div>
            </>
          ) : (
            <>
              {gateActive ? (
                <span className="Kana-overallBody">
                  {STRINGS.kana.gateHint}
                </span>
              ) : null}
              <div className="Kana-primary" onClick={onPrimary}>
                <span className="Kana-primaryLabel">
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
      <div className="Kana-tabs">
        {KANA_VOICE_TYPES.map((item) => (
          <div
            key={item}
            className={
              voiceType === item ? 'Kana-tab Kana-tab--on' : 'Kana-tab'
            }
            onClick={() => setVoiceType(item)}
          >
            <span className="Kana-tabLabel">
              {STRINGS.kana.voiceLabels[item]}
            </span>
            <span className="Kana-tabCount">
              {repository.getKanaByVoiceType(item).length}
            </span>
          </div>
        ))}
      </div>

      {/* 子 Tab：书写体系（多选）+ 罗马音层 */}
      <div className="Kana-subTabs">
        {KANA_SCRIPTS.map((item) => (
          <div
            key={item}
            className={
              scripts.includes(item)
                ? 'Kana-subTab Kana-subTab--on'
                : 'Kana-subTab'
            }
            onClick={() => toggleScript(item)}
          >
            <span className="Kana-subTabLabel">
              {item === 'hiragana'
                ? STRINGS.kana.scriptHiragana
                : STRINGS.kana.scriptKatakana}
            </span>
          </div>
        ))}
        <div
          className={showRomaji ? 'Kana-subTab Kana-subTab--on' : 'Kana-subTab'}
          onClick={() => setShowRomaji((prev) => !prev)}
        >
          <span className="Kana-subTabLabel">{STRINGS.kana.scriptRomaji}</span>
        </div>
        <div
          className={studyMode ? 'Kana-mode Kana-mode--on' : 'Kana-mode'}
          onClick={() => setStudyMode((prev) => !prev)}
        >
          <span className="Kana-modeLabel">
            {studyMode ? STRINGS.kana.studyModeOn : STRINGS.kana.studyModeOff}
          </span>
        </div>
      </div>
      <span className="Kana-modeHint">{STRINGS.kana.studyModeHint}</span>

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
      <span className="Kana-sectionTitle">{STRINGS.kana.groupSection}</span>
      <div className="Kana-groups">
        {groups.map((group) => {
          const unlocked = selectKanaUnlocked(state, group.id)
          const progress = selectKanaGroupProgress(state, group.id)
          return (
            <div
              key={group.id}
              className={
                unlocked ? 'Kana-group' : 'Kana-group Kana-group--locked'
              }
              onClick={() => {
                if (unlocked) {
                  nav.goKanaStudy(group.id)
                }
              }}
            >
              <div className="Kana-groupLeft">
                <span className="Kana-groupName">{group.name}</span>
                <span className="Kana-groupMeta">
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
