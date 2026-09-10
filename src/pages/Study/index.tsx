import './index.css'
import { useEffect, useMemo, useRef, useState } from '@lynx-js/react'
import { useLocation, useParams } from 'react-router'
import { DetailSheet } from '../../components/DetailSheet/index.js'
import { WordCard } from '../../components/WordCard/index.js'
import { STRINGS } from '../../constants/strings.js'
import { repository } from '../../data/index.js'
import { useNavigation } from '../../router/navigation.js'
import {
  detailSheetModeFor,
  emptyStudyEffect,
  type StudyEffect,
} from '../../services/jumpService.js'
import { detectSlideMode } from '../../services/platform.js'
import * as studySession from '../../services/studySession.js'
import { classifySwipe } from '../../services/swipe.js'
import { ttsController } from '../../services/ttsController.js'
import { appActions, useAppStore, useSettings } from '../../store/hooks.js'
import type { SelfEval } from '../../types/progress.js'

/**
 * P2 词汇学习（架构 §2.10 / §7 T04 判据 2–6）。
 *
 * 行为要点：
 * - **展示即转态**：`currentWord` 变化时调用 `studySession.presentCurrentCard()`
 *   （内部走 `markPresented` → `applyPresented`，「学习中」的唯一入口）；
 * - **整卡 TTS**：点卡片任意空白发音（`WordCard.onSpeak`）；
 * - **三档自评**：全部经 `studySession.applySelfEvaluation`（唯一写入口）；
 * - **J1 自动展开 C2**：自评「不认识」且首次遇到 → 打开半屏详解；确认可跳 P3；
 * - **左滑跳过**：经 `classifySwipe` 判定后调用 `skipCurrentWord`（`学习中 → 未学`）；
 * - **容器降级**：原生 `<viewpager>` / Web `<scroll-view scroll-orientation="horizontal">`；
 *   为避免「分页滑动」与「左滑跳过」手势竞争，两个容器均关闭自身滑动
 *   （`enable-scroll={false}`），翻页由按钮驱动、左滑专用于跳过。
 */

/** 滑动触发阈值（px）。 */
const SWIPE_THRESHOLD = 60

/** P2 词汇学习页。 */
export function StudyPage() {
  const params = useParams<{ moduleId: string }>()
  const moduleId = params.moduleId ?? ''
  const location = useLocation()
  const nav = useNavigation()
  const state = useAppStore((snapshot) => snapshot)
  const settings = useSettings()
  const slideMode = useMemo(() => detectSlideMode(), [])

  const words = useMemo(() => repository.getModuleWords(moduleId), [moduleId])
  const index = state.runtime.currentIndex
  const word = words[index]

  const [revealed, setRevealed] = useState(false)
  const [effect, setEffect] = useState<StudyEffect>(emptyStudyEffect)
  const touchStart = useRef<{ x: number; y: number } | null>(null)

  const isReview = location.search.includes('mode=review')
  const detailSheet = state.runtime.detailSheet

  // 进入模块：读会话断点定位起始词序（每次 moduleId 变化重置）。
  useEffect(() => {
    if (moduleId === '') {
      return
    }
    studySession.beginStudy(moduleId)
    setRevealed(false)
  }, [moduleId])

  // 卡片首次可见：展示即转态 + 场景跳转评估（J3 / J4 / J5 / J6）。
  useEffect(() => {
    if (word === undefined) {
      return
    }
    studySession.presentCurrentCard()
    setEffect(studySession.evaluateSceneEffect(word))
    setRevealed(false)
    ttsController.clearNotice()
  }, [word?.id])

  function advance(delta: number): void {
    studySession.stepIndex(delta)
  }

  /** 整卡热区发音（朗读文本恒为假名）。 */
  function speakWord(kana: string): void {
    void ttsController.speak(kana, settings)
  }

  function onSelfEval(selfEval: SelfEval): void {
    if (word === undefined) {
      return
    }
    const outcome = studySession.applySelfEvaluation(word.id, selfEval)
    setEffect(outcome.effect)
    const sheetMode = detailSheetModeFor(outcome.effect)
    if (sheetMode !== null) {
      // J1 / J2：停在当前词，等待用户在 C2 内处置。
      appActions.openDetailSheet(word.id, sheetMode)
      return
    }
    advance(1)
  }

  function onSkip(): void {
    if (word === undefined) {
      return
    }
    studySession.skipCurrentWord(word.id)
    advance(1)
  }

  function onSheetConfirm(wordId: string): void {
    appActions.closeDetailSheet()
    nav.goVocab(wordId)
  }

  function onSheetDismiss(): void {
    appActions.closeDetailSheet()
    advance(1)
  }

  function renderCard(cardWord: (typeof words)[number], isCurrent: boolean) {
    return (
      <WordCard
        word={cardWord}
        settings={settings}
        revealed={isCurrent ? revealed : false}
        onToggleReveal={() => {
          setRevealed((prev) => !prev)
        }}
        onSpeak={() => {
          speakWord(cardWord.kana)
        }}
      />
    )
  }

  if (words.length === 0) {
    return (
      <view className="Study">
        <view className="Study-head">
          <view className="Study-back" catchtap={nav.back}>
            <text className="Study-backLabel">{STRINGS.common.back}</text>
          </view>
          <text className="Study-title">{STRINGS.study.title}</text>
        </view>
        <view className="Study-empty">
          <text className="Study-emptyLabel">{STRINGS.study.emptyModule}</text>
        </view>
      </view>
    )
  }

  return (
    <view className="Study">
      <view className="Study-head">
        <view className="Study-back" catchtap={nav.back}>
          <text className="Study-backLabel">{STRINGS.common.back}</text>
        </view>
        <text className="Study-title">
          {isReview ? STRINGS.study.reviewTitle : STRINGS.study.title}
        </text>
        <text className="Study-progress">
          {`${STRINGS.study.cardProgress} ${index + 1}/${words.length}`}
        </text>
      </view>

      {slideMode === 'scroll' ? (
        <text className="Study-fallback">{STRINGS.study.webFallbackHint}</text>
      ) : null}

      <view
        className="Study-stage"
        bindtouchstart={(event) => {
          if (event.touches.length === 0) {
            touchStart.current = null
            return
          }
          const touch = event.touches[0]
          touchStart.current = { x: touch.clientX, y: touch.clientY }
        }}
        bindtouchend={(event) => {
          const start = touchStart.current
          touchStart.current = null
          if (start === null || event.changedTouches.length === 0) {
            return
          }
          const touch = event.changedTouches[0]
          const direction = classifySwipe(
            touch.clientX - start.x,
            touch.clientY - start.y,
            SWIPE_THRESHOLD,
          )
          if (direction === 'left') {
            onSkip()
          } else if (direction === 'right') {
            advance(-1)
          }
        }}
      >
        {slideMode === 'viewpager' ? (
          <viewpager
            key={`pager-${index}`}
            className="Study-pager"
            initial-select-index={index}
            enable-scroll={false}
            bindchange={(event) => {
              appActions.setCurrentIndex(event.detail.index)
            }}
          >
            {words.map((cardWord, cardIndex) => (
              <viewpager-item key={cardWord.id} className="Study-item">
                {renderCard(cardWord, cardIndex === index)}
              </viewpager-item>
            ))}
          </viewpager>
        ) : (
          <scroll-view
            key={`scroll-${index}`}
            className="Study-pager"
            scroll-orientation="horizontal"
            enable-scroll={false}
            initial-scroll-to-index={index}
          >
            {words.map((cardWord, cardIndex) => (
              <view key={cardWord.id} className="Study-item">
                {renderCard(cardWord, cardIndex === index)}
              </view>
            ))}
          </scroll-view>
        )}
      </view>

      <view className="Study-eval">
        <view
          className="Study-evalBtn Study-evalBtn--unknown"
          catchtap={() => {
            onSelfEval('不认识')
          }}
        >
          <text className="Study-evalLabel">
            {STRINGS.study.selfEvalUnknown}
          </text>
        </view>
        <view
          className="Study-evalBtn Study-evalBtn--vague"
          catchtap={() => {
            onSelfEval('模糊')
          }}
        >
          <text className="Study-evalLabel">{STRINGS.study.selfEvalVague}</text>
        </view>
        <view
          className="Study-evalBtn Study-evalBtn--known"
          catchtap={() => {
            onSelfEval('认识')
          }}
        >
          <text className="Study-evalLabel">{STRINGS.study.selfEvalKnown}</text>
        </view>
      </view>

      <view className="Study-nav">
        <view
          className="Study-navBtn"
          catchtap={() => {
            advance(-1)
          }}
        >
          <text className="Study-navLabel">{STRINGS.common.prev}</text>
        </view>
        <view className="Study-wrong" catchtap={() => undefined}>
          <text className="Study-wrongLabel">
            {`${STRINGS.study.sessionWrong} ${state.runtime.sessionWrongCount}`}
          </text>
        </view>
        <view className="Study-navBtn" catchtap={onSkip}>
          <text className="Study-navLabel">{STRINGS.common.skip}</text>
        </view>
        <view
          className="Study-navBtn"
          catchtap={() => {
            advance(1)
          }}
        >
          <text className="Study-navLabel">{STRINGS.common.next}</text>
        </view>
      </view>

      {effect.promptGraph ? (
        <text className="Study-graphHint">{STRINGS.home.graphEntry}</text>
      ) : null}

      <DetailSheet
        visible={detailSheet.visible}
        mode={detailSheet.mode}
        word={word}
        settings={settings}
        onConfirm={onSheetConfirm}
        onDismiss={onSheetDismiss}
      />
    </view>
  )
}
