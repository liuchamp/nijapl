import './index.css'
import { useMemo, useState } from '@lynx-js/react'
import {
  type StatRow,
  StatTimeline,
} from '../../components/StatTimeline/index.js'
import { TtsButton } from '../../components/TtsButton/index.js'
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
import { selectTodayStats, selectWeakWords } from '../../store/selectors.js'

/**
 * P9 我的 / 设置（架构 §2.9 / T05 判据 5、6）。
 *
 * - **发音设置**（语速 / 音调 / 卡片出现即读）：改即生效（`updateSettings`），
 *   随 `settings` 分片持久化；含**试听**（C1）；
 *   **不提供任何发音方案选择项**（朗读文本恒取假名，见 PRD §5.3 P9）；
 * - **数据导出**：生成学习数据 JSON 文本并复制（无剪贴板能力时展示文本，零静默失败）；
 * - **解锁规则开关**：`toggleUnlockRule`；
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
  const [exportNotice, setExportNotice] = useState<string | null>(null)
  const [exportText, setExportText] = useState<string | null>(null)

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

  return (
    <view className="Me">
      <view className="Me-head">
        <view className="Me-back" catchtap={nav.back}>
          <text className="Me-backLabel">{STRINGS.common.back}</text>
        </view>
        <text className="Me-title">{STRINGS.me.title}</text>
      </view>

      <view className="Me-block">
        <text className="Me-blockTitle">{STRINGS.me.pronunciation}</text>

        <view className="Me-setting">
          <text className="Me-settingLabel">{STRINGS.me.rate}</text>
          <view className="Me-stepper">
            <view
              className="Me-stepBtn"
              catchtap={() => {
                adjustRate(-RATE_STEP)
              }}
            >
              <text className="Me-stepLabel">−</text>
            </view>
            <text className="Me-stepValue">{settings.rate.toFixed(1)}</text>
            <view
              className="Me-stepBtn"
              catchtap={() => {
                adjustRate(RATE_STEP)
              }}
            >
              <text className="Me-stepLabel">＋</text>
            </view>
          </view>
        </view>

        <view className="Me-setting">
          <text className="Me-settingLabel">{STRINGS.me.pitch}</text>
          <view className="Me-stepper">
            <view
              className="Me-stepBtn"
              catchtap={() => {
                adjustPitch(-RATE_STEP)
              }}
            >
              <text className="Me-stepLabel">−</text>
            </view>
            <text className="Me-stepValue">{settings.pitch.toFixed(1)}</text>
            <view
              className="Me-stepBtn"
              catchtap={() => {
                adjustPitch(RATE_STEP)
              }}
            >
              <text className="Me-stepLabel">＋</text>
            </view>
          </view>
        </view>

        <view className="Me-setting" catchtap={toggleAutoSpeak}>
          <text className="Me-settingLabel">{STRINGS.me.autoSpeak}</text>
          <text className="Me-settingValue">
            {settings.autoSpeakOnCard ? STRINGS.me.on : STRINGS.me.off}
          </text>
        </view>

        <view className="Me-preview">
          <TtsButton
            text={STRINGS.me.previewText}
            settings={settings}
            label={STRINGS.me.preview}
          />
        </view>
      </view>

      <view className="Me-block">
        <text className="Me-blockTitle">{STRINGS.me.unlockSection}</text>
        <view className="Me-setting" catchtap={appActions.toggleUnlockRule}>
          <text className="Me-settingLabel">{STRINGS.me.unlockRule}</text>
          <text className="Me-settingValue">
            {settings.unlockRuleEnabled ? STRINGS.me.on : STRINGS.me.off}
          </text>
        </view>
      </view>

      <view className="Me-block">
        <text className="Me-blockTitle">{STRINGS.me.statsSection}</text>
        <StatTimeline rows={statRows} />
      </view>

      <view className="Me-block">
        <text className="Me-blockTitle">{STRINGS.me.dataSection}</text>
        <view className="Me-export" catchtap={exportData}>
          <text className="Me-exportLabel">{STRINGS.me.exportData}</text>
        </view>
        <text className="Me-hint">{STRINGS.me.exportHint}</text>
        {exportNotice !== null ? (
          <text className="Me-notice">{exportNotice}</text>
        ) : null}
        {exportText !== null ? (
          <text className="Me-exportText">{exportText}</text>
        ) : null}
        <view
          className={resetArmed ? 'Me-reset Me-reset--armed' : 'Me-reset'}
          catchtap={onReset}
        >
          <text className="Me-resetLabel">
            {resetArmed ? STRINGS.me.resetConfirm : STRINGS.me.resetData}
          </text>
        </view>
      </view>
    </view>
  )
}
