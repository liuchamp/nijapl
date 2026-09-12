import './index.css'
import { useEffect, useMemo, useRef, useState } from 'react'
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
import * as studySession from '../../services/studySession.js'
import { ttsController } from '../../services/ttsController.js'
import { ttsPrefetch } from '../../services/ttsPrefetch.js'
import { appActions, useAppStore, useSettings } from '../../store/hooks.js'
import {
  selectModuleComplete,
  selectNextIncompleteModule,
  selectStageComplete,
} from '../../store/selectors.js'
import type { SelfEval } from '../../types/progress.js'

/**
 * P2 词汇学习（原 Lynx 版 §2.10 / §7 T04 判据 2–6）。
 *
 * 行为要点（与原实现一致）：
 * - **展示即转态**：`currentWord` 变化时调用 `studySession.presentCurrentCard()`
 *   （内部走 `markPresented` → `applyPresented`，「学习中」的唯一入口）；
 * - **整卡 TTS**：点卡片任意空白发音（`WordCard.onSpeak`）；
 * - **三档自评**：全部经 `studySession.applySelfEvaluation`（唯一写入口）；
 * - **J1 自动展开 C2**：自评「不认识」且首次遇到 → 打开半屏详解；确认可跳 P3；
 * - **滑动 = 翻页**：横向 `scroll-snap` 容器保留原生手势翻页，左滑**不**绑跳过；
 * - **跳过 = 显式按钮**：同一 `applySkip` 路径，与翻页手势彻底解耦。
 *
 * 迁移差异（Lynx → Web，见 docs/migration/PLAN.md）：
 * - 原 Lynx 的 `<viewpager>` / `<scroll-view>` 双模式、`SelectorQuery` 程序化定位、
 *   三级降级（`pagerFailCount` / `pagerToken` / `containerBroken`）与 `services/platform.ts`、
 *   `services/pagerSeek.ts` **整体删除**：Web 下 `element.scrollTo()` 同步可靠，
 *   不存在 "宿主未注册 Behavior 导致 UI 创建失败（60301 / 9902）" 的问题。
 */
export function StudyPage() {
  const params = useParams<{ moduleId: string }>()
  const moduleId = params.moduleId ?? ''
  const location = useLocation()
  const nav = useNavigation()
  const state = useAppStore((snapshot) => snapshot)
  const settings = useSettings()

  const words = useMemo(() => repository.getModuleWords(moduleId), [moduleId])
  const index = state.runtime.currentIndex
  // 序号夹取：跨模块续学 / 冷启动时 `currentIndex` 可能是上一模块的残留值
  // （甚至非有限值）。全页（容器定位 / 当前词 / 进度文案）统一使用夹取后的 `safeIndex`。
  const maxIndex = Math.max(words.length - 1, 0)
  const safeIndex = Math.min(
    Math.max(Number.isFinite(index) ? index : 0, 0),
    maxIndex,
  )
  const word = words[safeIndex]

  const [revealed, setRevealed] = useState(false)
  const [effect, setEffect] = useState<StudyEffect>(emptyStudyEffect)
  const [moduleDone, setModuleDone] = useState(false)

  /** 横向滚动容器（替代 Lynx `<viewpager>` / `<scroll-view>`）。 */
  const pagerRef = useRef<HTMLDivElement | null>(null)
  /** 手势滚动的去抖定时器：停止滚动后才把位置写回 store，避免回环抖动。 */
  const scrollTimerRef = useRef<number | undefined>(undefined)

  const isReview = location.search.includes('mode=review')
  const detailSheet = state.runtime.detailSheet

  // 进入模块：读会话断点定位起始词序（每次 moduleId 变化重置）。
  useEffect(() => {
    if (moduleId === '') {
      return
    }
    studySession.beginStudy(moduleId)
    setRevealed(false)
    setModuleDone(false)
  }, [moduleId])

  // 程序化翻页：把容器滚到当前序号对应的卡片（首次挂载与按钮翻页都走这里）。
  useEffect(() => {
    const el = pagerRef.current
    if (el === null) {
      return
    }
    const width = el.clientWidth
    if (width <= 0) {
      return
    }
    const target = safeIndex * width
    if (Math.abs(el.scrollLeft - target) < 2) {
      return
    }
    el.scrollTo({ left: target, behavior: 'smooth' })
  }, [safeIndex, moduleId, words.length])

  // 窗口尺寸变化（响应式 rpx 下卡片宽度随之变化）：重新对齐当前卡片，避免错位。
  useEffect(() => {
    const onResize = () => {
      const el = pagerRef.current
      if (el === null) {
        return
      }
      el.scrollTo({ left: safeIndex * el.clientWidth })
    }
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
    }
  }, [safeIndex])

  // 卡片首次可见：展示即转态 + 场景跳转评估（J3 / J4 / J5 / J6）。
  useEffect(() => {
    if (word === undefined) {
      return
    }
    studySession.presentCurrentCard()
    setEffect(studySession.evaluateSceneEffect(word))
    setRevealed(false)
    ttsController.clearNotice()
    // 预取下一个词的假名（纯优化：失败静默、播放器不可用时不预取）。
    const nextWord = words[safeIndex + 1]
    if (nextWord !== undefined) {
      ttsPrefetch.schedule(nextWord.kana, settings)
    }
  }, [word?.id])

  /** 手势滚动结束（去抖 150ms）后把位置写回 store。 */
  function handlePagerScroll(): void {
    if (scrollTimerRef.current !== undefined) {
      window.clearTimeout(scrollTimerRef.current)
    }
    scrollTimerRef.current = window.setTimeout(() => {
      const el = pagerRef.current
      if (el === null) {
        return
      }
      const width = el.clientWidth
      if (width <= 0) {
        return
      }
      const next = Math.round(el.scrollLeft / width)
      if (next !== safeIndex && next >= 0 && next <= maxIndex) {
        appActions.setCurrentIndex(next)
      }
    }, 150)
  }

  /** 翻页：只改序号，容器的实际定位由上面的滚动副作用负责。 */
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
    if (outcome.effect.promptGraph) {
      setModuleDone(true)
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
    // J2（连错详解）与 J4（模块学完）可能在同一自评命中：此前在 onSelfEval 里
    // 优先开了浮层并 return，因而错过了完成面板。浮层关闭时补一次完成判定，
    // 避免「学完最后一词却仍然卡在最后一张」。
    if (selectModuleComplete(state, moduleId)) {
      setModuleDone(true)
      return
    }
    advance(1)
  }

  function goNextModule(): void {
    const nextModuleId = selectNextIncompleteModule(state, moduleId)
    if (nextModuleId === null) {
      nav.goStages()
      return
    }
    nav.goStudy(nextModuleId)
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
      <div className="Study">
        <div className="Study-head">
          <div className="Study-back" onClick={nav.back}>
            <span className="Study-backLabel">{STRINGS.common.back}</span>
          </div>
          <span className="Study-title">{STRINGS.study.title}</span>
        </div>
        <div className="Study-empty">
          <span className="Study-emptyLabel">{STRINGS.study.emptyModule}</span>
        </div>
      </div>
    )
  }

  return (
    <div className="Study">
      <div className="Study-head">
        <div className="Study-back" onClick={nav.back}>
          <span className="Study-backLabel">{STRINGS.common.back}</span>
        </div>
        <span className="Study-title">
          {isReview ? STRINGS.study.reviewTitle : STRINGS.study.title}
        </span>
        <span className="Study-progress">
          {`${STRINGS.study.cardProgress} ${safeIndex + 1}/${words.length}`}
        </span>
      </div>

      <span className="Study-fallback">{STRINGS.study.webFallbackHint}</span>

      <div className="Study-stage">
        <div
          ref={pagerRef}
          className="Study-pager"
          onScroll={handlePagerScroll}
        >
          {words.map((cardWord, cardIndex) => (
            <div key={cardWord.id} className="Study-item">
              {renderCard(cardWord, cardIndex === safeIndex)}
            </div>
          ))}
        </div>
      </div>

      <div className="Study-eval">
        <div
          className="Study-evalBtn Study-evalBtn--unknown"
          onClick={() => {
            onSelfEval('不认识')
          }}
        >
          <span className="Study-evalLabel">
            {STRINGS.study.selfEvalUnknown}
          </span>
        </div>
        <div
          className="Study-evalBtn Study-evalBtn--vague"
          onClick={() => {
            onSelfEval('模糊')
          }}
        >
          <span className="Study-evalLabel">{STRINGS.study.selfEvalVague}</span>
        </div>
        <div
          className="Study-evalBtn Study-evalBtn--known"
          onClick={() => {
            onSelfEval('认识')
          }}
        >
          <span className="Study-evalLabel">{STRINGS.study.selfEvalKnown}</span>
        </div>
      </div>

      <div className="Study-nav">
        <div
          className="Study-navBtn"
          onClick={() => {
            advance(-1)
          }}
        >
          <span className="Study-navLabel">{STRINGS.common.prev}</span>
        </div>
        <div className="Study-wrong" onClick={() => undefined}>
          <span className="Study-wrongLabel">
            {`${STRINGS.study.sessionWrong} ${state.runtime.sessionWrongCount}`}
          </span>
        </div>
        <div className="Study-navBtn" onClick={onSkip}>
          <span className="Study-navLabel">{STRINGS.common.skip}</span>
        </div>
        <div
          className="Study-navBtn"
          onClick={() => {
            advance(1)
          }}
        >
          <span className="Study-navLabel">{STRINGS.common.next}</span>
        </div>
      </div>

      {effect.promptGraph ? (
        <div className="Study-graphHint" onClick={() => nav.goGraph()}>
          <span className="Study-graphHintLabel">
            {STRINGS.home.graphEntry}
          </span>
        </div>
      ) : null}

      <DetailSheet
        visible={detailSheet.visible}
        mode={detailSheet.mode}
        word={word}
        settings={settings}
        onConfirm={onSheetConfirm}
        onDismiss={onSheetDismiss}
      />

      {moduleDone ? (
        <div className="Study-done">
          <div className="Study-doneCard">
            <span className="Study-doneTitle">
              {selectStageComplete(state, state.session.stageId)
                ? STRINGS.study.stageDoneTitle
                : STRINGS.study.moduleDoneTitle}
            </span>
            <span className="Study-doneBody">
              {selectStageComplete(state, state.session.stageId)
                ? STRINGS.study.stageDoneBody
                : STRINGS.study.moduleDoneBody}
            </span>
            <div className="Study-doneActions">
              <div
                className="Study-doneBtn Study-doneBtn--primary"
                onClick={() => nav.goGraph()}
              >
                <span className="Study-doneBtnLabel">
                  {STRINGS.study.viewGraph}
                </span>
              </div>
              <div className="Study-doneBtn" onClick={goNextModule}>
                <span className="Study-doneBtnLabel">
                  {selectNextIncompleteModule(state, moduleId) === null
                    ? STRINGS.study.backToStages
                    : STRINGS.study.nextModule}
                </span>
              </div>
              <div className="Study-doneBtn" onClick={nav.goStages}>
                <span className="Study-doneBtnLabel">
                  {STRINGS.study.backToStages}
                </span>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
