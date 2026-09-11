import './index.css'
import { useEffect, useMemo, useState } from '@lynx-js/react'
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
 * - **J1 自动展开 C2**：自评「不认识」且首次遇到（该词从未被评估过，
 *   `Progress.history` 为空）→ 打开半屏详解；确认可跳 P3；
 * - **滑动 = 翻页（Ruling 2 / N3）**：原生 `<viewpager>` / Web
 *   `<scroll-view scroll-orientation="horizontal">` 均保留**原生手势翻页**，
 *   不再关闭容器自身滚动，也**不再**把左滑绑成跳过；
 * - **跳过 = 显式按钮**：同一 `applySkip` 路径（`studySession.skipCurrentWord`），
 *   与翻页手势彻底解耦，符合 PRD §5.3 的「跳过」交互（**PRD 偏差已于交付说明标注**）。
 */

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
  // 兜底：冷启动续学时 `useMemo(words)` 已用新 moduleId 重算，
  // 但 `currentIndex` 仍可能是上一模块残留 / 越界值，
  // `beginStudy` 在 `useEffect`（渲染后）才纠正 index —— 此间首帧会渲染错的词。
  // 兜底用 `words[0]` 替代 undefined，避免 DetailSheet 拿到 undefined、J3/J4/J5/J6 错位。
  const word = words[index] ?? words[0]

  const [revealed, setRevealed] = useState(false)
  const [effect, setEffect] = useState<StudyEffect>(emptyStudyEffect)
  // 程序化翻页令牌：仅在「按钮 / 自评 / 跳过」等主动导航时自增，
  // 用于让容器重新 seek 到 `index`；**滑动**自身改 `index` 时不重挂载，避免抖动。
  const [pagerToken, setPagerToken] = useState(0)

  const isReview = location.search.includes('mode=review')
  const detailSheet = state.runtime.detailSheet

  // 进入模块：读会话断点定位起始词序（每次 moduleId 变化重置）。
  useEffect(() => {
    if (moduleId === '') {
      return
    }
    studySession.beginStudy(moduleId)
    setRevealed(false)
    setPagerToken((token) => token + 1)
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
    // 主动导航：让容器重新 seek 到新 `index`。
    setPagerToken((token) => token + 1)
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

      <view className="Study-stage">
        {slideMode === 'viewpager' ? (
          <viewpager
            key={`pager-${pagerToken}`}
            className="Study-pager"
            initial-select-index={index}
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
            key={`scroll-${pagerToken}`}
            className="Study-pager"
            scroll-orientation="horizontal"
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
