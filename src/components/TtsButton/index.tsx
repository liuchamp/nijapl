import { useSyncExternalStore } from '@lynx-js/react'
import { STRINGS } from '../../constants/strings.js'
import { COLORS, FONT, RADIUS, SPACING } from '../../constants/theme.js'
import { ttsController } from '../../services/ttsController.js'
import type { StudySettings } from '../../types/progress.js'

/**
 * 发音按钮 / 整卡热区的语音入口（架构 §2.10 / §4.2）。
 *
 * - 点击后由 `ttsController` **同步**置视觉反馈（≤100ms），再走能力检测与出声；
 * - 无 TTS 能力时展示**明确提示 + 复制假名 + 假名文本**，零静默失败；
 * - 用 `catchtap` 阻止事件冒泡，避免触发整卡热区（发音不会执行两次）。
 */

interface TtsButtonProps {
  /** 朗读文本（恒为 `word.kana`）。 */
  text: string
  settings: StudySettings
  label?: string
  /** `solid` = 主按钮；`ghost` = 整卡热区提示。 */
  variant?: 'solid' | 'ghost'
}

/** 阻止事件冒泡至整卡热区（避免发音被执行两次）。 */
function stopBubble(): void {
  return
}

/** 发音按钮。 */
export function TtsButton(props: TtsButtonProps) {
  const state = useSyncExternalStore(
    ttsController.subscribe,
    ttsController.getState,
    ttsController.getState,
  )
  const speaking = state.speakingText === props.text
  const notice = state.lastText === props.text ? state.notice : null
  const copyNotice = state.fallbackText === props.text ? state.copyNotice : null
  const variant = props.variant ?? 'solid'
  const background = speaking
    ? COLORS.primary
    : variant === 'solid'
      ? COLORS.primarySoft
      : 'rgba(91, 140, 255, 0.10)'

  return (
    <view className="TtsButton" catchtap={stopBubble}>
      <view
        className="TtsButton-main"
        style={{
          backgroundColor: background,
          borderRadius: RADIUS.pill,
          paddingLeft: SPACING.md,
          paddingRight: SPACING.md,
          paddingTop: SPACING.sm,
          paddingBottom: SPACING.sm,
        }}
        catchtap={() => {
          void ttsController.speak(props.text, props.settings)
        }}
      >
        <text
          className="TtsButton-label"
          style={{
            color: speaking ? COLORS.bg : COLORS.primary,
            fontSize: FONT.sm,
            fontWeight: '700',
          }}
        >
          {props.label ?? STRINGS.tts.replay}
        </text>
      </view>

      {notice !== null ? (
        <view className="TtsButton-notice">
          <text
            className="TtsButton-noticeText"
            style={{ color: COLORS.warning }}
          >
            {notice}
          </text>
          <view
            className="TtsButton-copy"
            style={{
              backgroundColor: COLORS.surfaceAlt,
              borderRadius: RADIUS.sm,
              paddingLeft: SPACING.sm,
              paddingRight: SPACING.sm,
              paddingTop: SPACING.xs,
              paddingBottom: SPACING.xs,
            }}
            catchtap={() => {
              ttsController.copyKana(props.text)
            }}
          >
            <text
              className="TtsButton-copyLabel"
              style={{ color: COLORS.text, fontSize: FONT.xs }}
            >
              {STRINGS.tts.copyKana}
            </text>
          </view>
          <text
            className="TtsButton-kana"
            style={{ color: COLORS.text, fontSize: FONT.md }}
          >
            {`${STRINGS.tts.copyTitle}：${props.text}`}
          </text>
          {copyNotice !== null ? (
            <text
              className="TtsButton-copyNotice"
              style={{ color: COLORS.textMuted, fontSize: FONT.xs }}
            >
              {copyNotice}
            </text>
          ) : null}
        </view>
      ) : null}
    </view>
  )
}
