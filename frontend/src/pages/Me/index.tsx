import { useMemo, useState } from 'react'
import { Icon } from '../../components/Icon/index.js'
import {
  type StatRow,
  StatTimeline,
} from '../../components/StatTimeline/index.js'
import { TtsButton } from '../../components/TtsButton/index.js'
import { KANA_TOTAL } from '../../constants/kana.js'
import {
  DAILY_GRAMMAR_GOAL,
  DAILY_NEW_GOAL,
  DAILY_REVIEW_GOAL,
} from '../../constants/srs.js'
import { STRINGS } from '../../constants/strings.js'
import { repository } from '../../data/index.js'
import { useNavigation } from '../../router/navigation.js'
import { copyText } from '../../services/clipboard.js'
import { appActions, useAppStore, useSettings } from '../../store/hooks.js'
import {
  selectKanaMasteredCount,
  selectTodayStats,
  selectWeakWords,
} from '../../store/selectors.js'

/**
 * P9 我的 / 设置（架构 §2.9 / T05 判据 5、6 + 设计 §5.6 衔接点）。
 *
 * - **发音设置**（语速 / 音调 / 卡片出现即读）：改即生效（`updateSettings`），
 *   随 `settings` 分片持久化；含**试听**（C1）；
 *   **不提供任何发音方案选择项**（朗读文本恒取假名，见 PRD §5.3 P9）；
 * - **数据导出**：生成学习数据 JSON 文本并复制（无剪贴板能力时展示文本，零静默失败）；
 * - **解锁规则开关**：`toggleUnlockRule`；
 * - **假名基础**：入门门控开关（`toggleKanaGate`）+ 清空假名进度（`resetKanaProgress`，
 *   **只摘 `kana:` 前缀条目**，不动词条 / 语法 / 打卡数据）；
 * - **学习统计**：今日配额 + 累计掌握（`StatTimeline`）。
 */

const RATE_MIN = 0.5
const RATE_MAX = 1.5
const RATE_STEP = 0.1

function clampRange(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function round1(value: number): number {
  return Math.round(value * 10) / 10
}

/** P9 我的 / 设置页。 */
export function MePage() {
  const nav = useNavigation()
  const settings = useSettings()
  const state = useAppStore((snapshot) => snapshot)
  const [resetArmed, setResetArmed] = useState(false)
  const [kanaResetArmed, setKanaResetArmed] = useState(false)
  const [kanaNotice, setKanaNotice] = useState<string | null>(null)
  const [exportNotice, setExportNotice] = useState<string | null>(null)
  const [exportText, setExportText] = useState<string | null>(null)

  const kanaMastered = selectKanaMasteredCount(state)

  const statRows = useMemo(() => {
    const stats = selectTodayStats(state, Date.now())
    const allWords = repository.getAllWords()
    const allGrammars = repository.getAllGrammars()
    const seen = allWords.filter(
      (word) => state.progress[word.id]?.seen === true,
    ).length
    const mastered = allWords.filter(
      (word) => state.progress[word.id]?.state === '已掌握',
    ).length
    const weak = selectWeakWords(state).length
    const grammarSeen = allGrammars.filter(
      (grammar) => state.progress[grammar.id]?.seen === true,
    ).length
    const rows: StatRow[] = [
      {
        label: STRINGS.me.statTotalWords,
        value: allWords.length,
        display: `${allWords.length}`,
        ratio: allWords.length === 0 ? 0 : 1,
      },
      {
        label: STRINGS.me.statSeen,
        value: seen,
        display: `${seen}/${allWords.length}`,
        ratio: allWords.length === 0 ? 0 : seen / allWords.length,
      },
      {
        label: STRINGS.me.statMastered,
        value: mastered,
        display: `${mastered}/${allWords.length}`,
        ratio: allWords.length === 0 ? 0 : mastered / allWords.length,
      },
      {
        label: STRINGS.me.statWeak,
        value: weak,
        display: `${weak}`,
        ratio: allWords.length === 0 ? 0 : weak / allWords.length,
      },
      {
        label: STRINGS.me.statGrammar,
        value: grammarSeen,
        display: `${grammarSeen}/${allGrammars.length}`,
        ratio: allGrammars.length === 0 ? 0 : grammarSeen / allGrammars.length,
      },
      {
        label: STRINGS.me.todayNew,
        value: stats.newCount,
        display: `${stats.newCount}/${DAILY_NEW_GOAL}`,
        ratio: stats.newCount / DAILY_NEW_GOAL,
      },
      {
        label: STRINGS.me.todayReview,
        value: stats.reviewCount,
        display: `${stats.reviewCount}/${DAILY_REVIEW_GOAL}`,
        ratio: stats.reviewCount / DAILY_REVIEW_GOAL,
      },
      {
        label: STRINGS.me.todayGrammar,
        value: stats.grammarCount,
        display: `${stats.grammarCount}/${DAILY_GRAMMAR_GOAL}`,
        ratio: stats.grammarCount / DAILY_GRAMMAR_GOAL,
      },
    ]
    return rows
  }, [state])

  function adjustRate(delta: number): void {
    appActions.updateSettings({
      rate: round1(clampRange(settings.rate + delta, RATE_MIN, RATE_MAX)),
    })
  }

  function adjustPitch(delta: number): void {
    appActions.updateSettings({
      pitch: round1(clampRange(settings.pitch + delta, RATE_MIN, RATE_MAX)),
    })
  }

  function toggleAutoSpeak(): void {
    appActions.updateSettings({ autoSpeakOnCard: !settings.autoSpeakOnCard })
  }

  function exportData(): void {
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      progress: state.progress,
      session: state.session,
      settings: state.settings,
    }
    const text = JSON.stringify(payload)
    const ok = copyText(text)
    setExportNotice(ok ? STRINGS.me.exported : STRINGS.me.exportFailed)
    setExportText(text)
  }

  function onReset(): void {
    if (!resetArmed) {
      setResetArmed(true)
      return
    }
    appActions.resetAllProgress()
    setResetArmed(false)
    setExportNotice(null)
    setExportText(null)
  }

  /** 清空假名进度：两段式确认（与「清空学习进度」同交互，避免误触清掉 104 音的进度）。 */
  function onKanaReset(): void {
    if (!kanaResetArmed) {
      setKanaResetArmed(true)
      setKanaNotice(null)
      return
    }
    appActions.resetKanaProgress()
    setKanaResetArmed(false)
    setKanaNotice(STRINGS.kana.settingsResetDone)
  }

  return (
    <div className="Me flex flex-col flex-1 w-full p-md">
      <div className="Me-head flex flex-row items-center w-full mb-md">
        <div
          className="Me-back cursor-pointer select-none px-md py-xs bg-surface-alt rounded-pill flex items-center gap-8"
          onClick={nav.back}
        >
          <Icon name="chevron-left" size="28rpx" />
          <span className="Me-backLabel cursor-pointer select-none text-sm text-text">
            {STRINGS.common.back}
          </span>
        </div>
        <span className="Me-title flex-1 text-center text-lg font-bold">
          {STRINGS.me.title}
        </span>
      </div>

      <div className="Me-block flex flex-col w-full p-md mb-sm bg-surface rounded-md">
        <span className="Me-blockTitle text-sm text-text-muted mb-sm">
          {STRINGS.me.pronunciation}
        </span>

        <div className="Me-setting cursor-pointer select-none flex flex-row items-center justify-between w-full py-xs">
          <span className="Me-settingLabel cursor-pointer select-none text-md text-text">
            {STRINGS.me.rate}
          </span>
          <div className="Me-stepper flex flex-row items-center">
            <div
              className="Me-stepBtn cursor-pointer select-none flex flex-row items-center justify-center w-56 h-56 bg-surface-alt rounded-pill"
              onClick={() => {
                adjustRate(-RATE_STEP)
              }}
            >
              <span className="Me-stepLabel text-md text-text">−</span>
            </div>
            <span className="Me-stepValue w-100 text-center text-md text-text">
              {settings.rate.toFixed(1)}
            </span>
            <div
              className="Me-stepBtn cursor-pointer select-none flex flex-row items-center justify-center w-56 h-56 bg-surface-alt rounded-pill"
              onClick={() => {
                adjustRate(RATE_STEP)
              }}
            >
              <span className="Me-stepLabel text-md text-text">＋</span>
            </div>
          </div>
        </div>

        <div className="Me-setting cursor-pointer select-none flex flex-row items-center justify-between w-full py-xs">
          <span className="Me-settingLabel cursor-pointer select-none text-md text-text">
            {STRINGS.me.pitch}
          </span>
          <div className="Me-stepper flex flex-row items-center">
            <div
              className="Me-stepBtn cursor-pointer select-none flex flex-row items-center justify-center w-56 h-56 bg-surface-alt rounded-pill"
              onClick={() => {
                adjustPitch(-RATE_STEP)
              }}
            >
              <span className="Me-stepLabel text-md text-text">−</span>
            </div>
            <span className="Me-stepValue w-100 text-center text-md text-text">
              {settings.pitch.toFixed(1)}
            </span>
            <div
              className="Me-stepBtn cursor-pointer select-none flex flex-row items-center justify-center w-56 h-56 bg-surface-alt rounded-pill"
              onClick={() => {
                adjustPitch(RATE_STEP)
              }}
            >
              <span className="Me-stepLabel text-md text-text">＋</span>
            </div>
          </div>
        </div>

        <div
          className="Me-setting cursor-pointer select-none flex flex-row items-center justify-between w-full py-xs"
          onClick={toggleAutoSpeak}
        >
          <span className="Me-settingLabel cursor-pointer select-none text-md text-text">
            {STRINGS.me.autoSpeak}
          </span>
          <span className="Me-settingValue cursor-pointer select-none text-md text-primary font-bold">
            {settings.autoSpeakOnCard ? STRINGS.me.on : STRINGS.me.off}
          </span>
        </div>

        <div className="Me-preview flex flex-row w-full mt-sm">
          <TtsButton
            text={STRINGS.me.previewText}
            settings={settings}
            label={STRINGS.me.preview}
          />
        </div>
      </div>

      <div className="Me-block flex flex-col w-full p-md mb-sm bg-surface rounded-md">
        <span className="Me-blockTitle text-sm text-text-muted mb-sm">
          {STRINGS.me.unlockSection}
        </span>
        <div
          className="Me-setting cursor-pointer select-none flex flex-row items-center justify-between w-full py-xs"
          onClick={appActions.toggleUnlockRule}
        >
          <span className="Me-settingLabel cursor-pointer select-none text-md text-text">
            {STRINGS.me.unlockRule}
          </span>
          <span className="Me-settingValue cursor-pointer select-none text-md text-primary font-bold">
            {settings.unlockRuleEnabled ? STRINGS.me.on : STRINGS.me.off}
          </span>
        </div>
      </div>

      {/* 假名基础（设计 §5.6）：门控开关（Q1 裁决默认开、此处可关）+ 只清 K 域进度 */}
      <div className="Me-block flex flex-col w-full p-md mb-sm bg-surface rounded-md">
        <span className="Me-blockTitle text-sm text-text-muted mb-sm">
          {STRINGS.kana.settingsSection}
        </span>
        <div
          className="Me-setting cursor-pointer select-none flex flex-row items-center justify-between w-full py-xs"
          onClick={appActions.toggleKanaGate}
        >
          <span className="Me-settingLabel cursor-pointer select-none text-md text-text">
            {STRINGS.kana.settingsGate}
          </span>
          <span className="Me-settingValue cursor-pointer select-none text-md text-primary font-bold">
            {settings.kanaGateEnabled ? STRINGS.me.on : STRINGS.me.off}
          </span>
        </div>
        <span className="Me-hint text-xs text-text-muted mt-xs">
          {STRINGS.kana.settingsGateHint}
        </span>
        <span className="Me-hint text-xs text-text-muted mt-xs">
          {`${STRINGS.kana.overallLabel} ${kanaMastered}/${KANA_TOTAL}`}
        </span>
        <div
          className={
            kanaResetArmed
              ? 'Me-reset Me-reset--armed flex flex-row items-center justify-center w-full py-sm mt-md rounded-pill border-[calc(1*var(--rpx))] border-danger bg-[rgba(255,95,109,0.2)]'
              : 'Me-reset flex flex-row items-center justify-center w-full py-sm mt-md rounded-pill border-[calc(1*var(--rpx))] border-danger bg-surface-alt'
          }
          onClick={onKanaReset}
        >
          <span className="Me-resetLabel text-md text-danger">
            {kanaResetArmed
              ? STRINGS.kana.settingsResetConfirm
              : STRINGS.kana.settingsReset}
          </span>
        </div>
        {kanaNotice !== null ? (
          <span className="Me-notice text-sm text-warning mt-xs">
            {kanaNotice}
          </span>
        ) : null}
      </div>

      <div className="Me-block flex flex-col w-full p-md mb-sm bg-surface rounded-md">
        <span className="Me-blockTitle text-sm text-text-muted mb-sm">
          {STRINGS.me.statsSection}
        </span>
        <StatTimeline rows={statRows} />
      </div>

      <div className="Me-block flex flex-col w-full p-md mb-sm bg-surface rounded-md">
        <span className="Me-blockTitle text-sm text-text-muted mb-sm">
          {STRINGS.me.dataSection}
        </span>
        <div
          className="Me-export cursor-pointer select-none flex flex-row items-center justify-center w-full py-sm bg-primary rounded-pill"
          onClick={exportData}
        >
          <span className="Me-exportLabel cursor-pointer select-none text-md font-bold text-bg">
            {STRINGS.me.exportData}
          </span>
        </div>
        <span className="Me-hint text-xs text-text-muted mt-xs">
          {STRINGS.me.exportHint}
        </span>
        {exportNotice !== null ? (
          <span className="Me-notice text-sm text-warning mt-xs">
            {exportNotice}
          </span>
        ) : null}
        {exportText !== null ? (
          <span className="Me-exportText cursor-pointer select-none text-xs text-text-muted mt-xs">
            {exportText}
          </span>
        ) : null}
        <div
          className={
            resetArmed
              ? 'Me-reset Me-reset--armed flex flex-row items-center justify-center w-full py-sm mt-md rounded-pill border-[calc(1*var(--rpx))] border-danger bg-[rgba(255,95,109,0.2)]'
              : 'Me-reset flex flex-row items-center justify-center w-full py-sm mt-md rounded-pill border-[calc(1*var(--rpx))] border-danger bg-surface-alt'
          }
          onClick={onReset}
        >
          <span className="Me-resetLabel text-md text-danger">
            {resetArmed ? STRINGS.me.resetConfirm : STRINGS.me.resetData}
          </span>
        </div>
      </div>
    </div>
  )
}
