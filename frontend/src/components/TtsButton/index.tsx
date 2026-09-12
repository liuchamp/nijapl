import './index.css'
import { useSyncExternalStore } from 'react'
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

/**
 * 阻止事件冒泡至整卡热区（避免发音被执行两次）。
 *
 * 迁移说明：原 Lynx 用 `catchtap={stopBubble}`——`catch` 前缀本身即「绑定 + 阻断冒泡」，
 * 故函数体为空也能生效。Web 的 `onClick` **不会**自动阻断，必须显式 `stopPropagation()`，
 * 否则 `WordCard` 根节点的整卡发音热区会与本按钮叠加，导致一次点击朗读两次。
 */
function stopBubble(event: React.MouseEvent<HTMLDivElement>): void {
  event.stopPropagation()
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
    <div className="TtsButton" onClick={stopBubble}>
      <div
        className="TtsButton-main"
        style={{
          backgroundColor: background,
          borderRadius: RADIUS.pill,
          paddingLeft: SPACING.md,
          paddingRight: SPACING.md,
          paddingTop: SPACING.sm,
          paddingBottom: SPACING.sm,
        }}
        onClick={() => {
          void ttsController.speak(props.text, props.settings)
        }}
      >
        <span
          className="TtsButton-label"
          style={{
            color: speaking ? COLORS.bg : COLORS.primary,
            fontSize: FONT.sm,
            fontWeight: '700',
          }}
        >
          {props.label ?? STRINGS.tts.replay}
        </span>
      </div>

      {notice !== null ? (
        <div className="TtsButton-notice">
          <span
            className="TtsButton-noticeText"
            style={{ color: COLORS.warning }}
          >
            {notice}
          </span>
          <div
            className="TtsButton-copy"
            style={{
              backgroundColor: COLORS.surfaceAlt,
              borderRadius: RADIUS.sm,
              paddingLeft: SPACING.sm,
              paddingRight: SPACING.sm,
              paddingTop: SPACING.xs,
              paddingBottom: SPACING.xs,
            }}
            onClick={() => {
              ttsController.copyKana(props.text)
            }}
          >
            <span
              className="TtsButton-copyLabel"
              style={{ color: COLORS.text, fontSize: FONT.xs }}
            >
              {STRINGS.tts.copyKana}
            </span>
          </div>
          <span
            className="TtsButton-kana"
            style={{ color: COLORS.text, fontSize: FONT.md }}
          >
            {`${STRINGS.tts.copyTitle}：${props.text}`}
          </span>
          {copyNotice !== null ? (
            <span
              className="TtsButton-copyNotice"
              style={{ color: COLORS.textMuted, fontSize: FONT.xs }}
            >
              {copyNotice}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
