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
import { PAGER_ID, seekPager } from '../../services/pagerSeek.js'
import { detectSlideMode } from '../../services/platform.js'
import * as studySession from '../../services/studySession.js'
import { ttsController } from '../../services/ttsController.js'
import { ttsPrefetch } from '../../services/ttsPrefetch.js'
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
 * - **容器三级降级（60301 / 9902 修复）**：`<viewpager>`（默认关闭，见
 *   `services/platform.ts`）→ 横向 `<scroll-view>`（默认）→ **单卡片**
 *   （连续 `PAGER_FAIL_LIMIT` 次定位失败，判定宿主未创建出容器 UI）；
 * - **跳过 = 显式按钮**：同一 `applySkip` 路径（`studySession.skipCurrentWord`），
 *   与翻页手势彻底解耦，符合 PRD §5.3 的「跳过」交互（**PRD 偏差已于交付说明标注**）。
 */

/**
 * 容器定位连续失败多少次后判定"宿主未创建出容器 UI"并降级为单卡片。
 *
 * 首次挂载一定 seek 一次（`pagerIndexRef` 初值 `-1`），失败则重建后再试一次；
 * 两次都不行即判定不可用，避免无限重建。
 */
const PAGER_FAIL_LIMIT = 2

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
  // 序号夹取（60301 修复）：跨模块续学 / 冷启动时 `currentIndex` 可能是上一模块的
  // 残留值（甚至非有限值），直接喂给原生容器的 `initial-select-index` /
  // `initial-scroll-to-index` 会让子项 UI 创建失败 → `Can't find ui tag`。
  // 全页（容器属性 / 当前词 / 进度文案）统一使用夹取后的 `safeIndex`。
  const maxIndex = Math.max(words.length - 1, 0)
  const safeIndex = Math.min(
    Math.max(Number.isFinite(index) ? index : 0, 0),
    maxIndex,
  )
  const word = words[safeIndex]

  const [revealed, setRevealed] = useState(false)
  const [effect, setEffect] = useState<StudyEffect>(emptyStudyEffect)
  // 兜底重建令牌：**仅**在宿主不支持程序化翻页（SelectorQuery invoke）时自增。
  const [pagerToken, setPagerToken] = useState(0)
  /**
   * 容器定位**失败**次数（有能力但 invoke fail）。
   *
   * 达到 `PAGER_FAIL_LIMIT` 判定宿主未成功创建容器 UI（60301 的外在表现），
   * 永久降级为「单卡片」渲染 —— 宁可丢掉滑动手势，也不能反复崩页。
   */
  const [pagerFailCount, setPagerFailCount] = useState(0)
  const containerBroken = pagerFailCount >= PAGER_FAIL_LIMIT
  /** 容器当前定位到的序号（`-1` = 刚换模块，必须重新定位）。 */
  const pagerIndexRef = useRef(-1)

  const isReview = location.search.includes('mode=review')
  const detailSheet = state.runtime.detailSheet

  // 进入模块：读会话断点定位起始词序（每次 moduleId 变化重置）。
  useEffect(() => {
    if (moduleId === '') {
      return
    }
    studySession.beginStudy(moduleId)
    setRevealed(false)
    // 换模块后容器的 `initial-*` 不再生效（仅在首次创建时生效），置哨兵值强制
    // 下面的 seek 重新定位；**不再**在这里自增 pagerToken —— 首帧「创建即销毁」
    // 正是 `Can't find ui tag` 的触发点。
    pagerIndexRef.current = -1
  }, [moduleId])

  // 程序化翻页（60301 修复）：走官方 UI 方法（viewpager `selectTab` /
  // scroll-view `scrollTo`），容器只创建一次，不再销毁重建。
  useEffect(() => {
    if (containerBroken || pagerIndexRef.current === safeIndex) {
      return
    }
    pagerIndexRef.current = safeIndex
    seekPager({
      mode: slideMode,
      index: safeIndex,
      // 宿主没有 SelectorQuery：只是能力缺失，容器本身可能没坏，仅重建重试。
      onUnsupported: () => {
        setPagerToken((token) => token + 1)
      },
      // 有能力却定位失败：容器 UI 大概率没创建出来（60301）。
      // 重建后重试一次，累计到上限则永久降级为单卡片。
      onFail: () => {
        pagerIndexRef.current = -1
        setPagerToken((token) => token + 1)
        setPagerFailCount((count) => count + 1)
      },
    })
  }, [safeIndex, moduleId, slideMode, pagerToken, containerBroken])

  // 卡片首次可见：展示即转态 + 场景跳转评估（J3 / J4 / J5 / J6）。
  useEffect(() => {
    if (word === undefined) {
      return
    }
    studySession.presentCurrentCard()
    setEffect(studySession.evaluateSceneEffect(word))
    setRevealed(false)
    ttsController.clearNotice()
    // 预取下一个词的假名（纯优化：失败静默、播放器不可用时不预取，见设计 §5.4）。
    const nextWord = words[safeIndex + 1]
    if (nextWord !== undefined) {
      ttsPrefetch.schedule(nextWord.kana, settings)
    }
  }, [word?.id])

  /** 翻页：只改序号，容器的实际定位由上面的 seek 副作用负责。 */
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

  // 容器 key：随 `moduleId` 变化（换模块 = 内容整体替换，重建是正常语义），
  // 同模块内翻页**只 seek 不重建**；`pagerToken` 仅在宿主不支持程序化翻页时自增。
  const pagerKey = `${PAGER_ID}-${moduleId}-${pagerToken}`

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
          {`${STRINGS.study.cardProgress} ${safeIndex + 1}/${words.length}`}
        </text>
      </view>

      {slideMode === 'scroll' || containerBroken ? (
        <text className="Study-fallback">{STRINGS.study.webFallbackHint}</text>
      ) : null}

      <view className="Study-stage">
        {containerBroken ? (
          // 三级兜底：宿主没能创建出容器 UI（60301），退化为只渲染当前卡片，
          // 翻页完全靠「上一张 / 下一张 / 自评 / 跳过」按钮，功能不缺、不再报错。
          <view className="Study-item">
            {word === undefined ? null : renderCard(word, revealed)}
          </view>
        ) : slideMode === 'viewpager' ? (
          <viewpager
            key={`pager-${pagerKey}`}
            id={PAGER_ID}
            className="Study-pager"
            initial-select-index={safeIndex}
            bindchange={(event) => {
              const next = event.detail.index
              // 手势已把容器定位到 `next`，同步给 ref 避免回环再 seek 一次（抖动）。
              if (Number.isFinite(next)) {
                pagerIndexRef.current = next
              }
              appActions.setCurrentIndex(next)
            }}
          >
            {words.map((cardWord, cardIndex) => (
              <viewpager-item key={cardWord.id} className="Study-item">
                {renderCard(cardWord, cardIndex === safeIndex)}
              </viewpager-item>
            ))}
          </viewpager>
        ) : (
          <scroll-view
            key={`scroll-${pagerKey}`}
            id={PAGER_ID}
            className="Study-pager"
            scroll-orientation="horizontal"
            initial-scroll-to-index={safeIndex}
          >
            {words.map((cardWord, cardIndex) => (
              // Lynx 要求：`initial-scroll-to-index` / `scrollTo({index})` 的
              // **所有直接子节点必须 `flatten=false`**，否则索引错位、定位失效。
              <view key={cardWord.id} className="Study-item" flatten={false}>
                {renderCard(cardWord, cardIndex === safeIndex)}
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
