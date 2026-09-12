import './index.css'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useParams } from 'react-router'
import { KanaCanvas } from '../../components/KanaCanvas/index.js'
import { NodeStateBadge } from '../../components/NodeStateBadge/index.js'
import { TtsButton } from '../../components/TtsButton/index.js'
import { kanaProgressKey } from '../../constants/kana.js'
import { readKanaStudyMode } from '../../constants/routes.js'
import { STRINGS } from '../../constants/strings.js'
import { repository } from '../../data/index.js'
import { useNavigation } from '../../router/navigation.js'
import {
  cancelKanaPeek,
  enterKanaGroup,
  revealKanaPeek,
} from '../../services/kanaWriteSession.js'
import { ttsController } from '../../services/ttsController.js'
import { ttsPrefetch } from '../../services/ttsPrefetch.js'
import { appActions, useAppStore, useSettings } from '../../store/hooks.js'
import {
  selectKanaGroupProgress,
  selectKanaNextGroup,
} from '../../store/selectors.js'
import type { KanaScript } from '../../types/kana.js'
import type { SelfEval } from '../../types/progress.js'

/**
 * K1 假名学习卡（设计 §5.2，K 域核心）。
 *
 * 四段式：① 认形 ② 字源联想 ③ 应用实例 ④ 书写。
 *
 * 与原 Lynx 的 P2 词汇学习（`pages/Study`）**同构但不同页**：
 * - 「展示即转态」同样在卡片首次可见时调用（`markPresented`）；
 * - 三档自评同样走 `submitSelfEval`（唯一写入口），只是 `targetId = 'kana:<id>'`；
 * - 「跳过」同样走 `skipWord` 语义（`学习中 → 未学`，不计分）。
 *
 * 翻页约定：**循环取模**（末张「下一张」回到首张），对齐参考产品 swiper 的 `>= length → 0`。
 * 取模在 `actions.setKanaIndex` 里做，本页只负责 ±1，不自己夹取。
 */
export function KanaStudyPage() {
  const params = useParams<{ groupId: string }>()
  const groupId = params.groupId ?? ''
  const location = useLocation()
  const nav = useNavigation()
  const state = useAppStore((snapshot) => snapshot)
  const settings = useSettings()

  const mode = readKanaStudyMode(location.search)
  const isReview = mode === 'review'

  const group = repository.getKanaGroupById(groupId)
  const members = useMemo(() => repository.getKanaByGroup(groupId), [groupId])

  const index = state.runtime.kanaIndex
  // 序号夹取：换关 / 冷启动时 `kanaIndex` 可能是上一关的残留值。与 `pages/Study` 同规则。
  const maxIndex = Math.max(members.length - 1, 0)
  const safeIndex = Math.min(
    Math.max(Number.isFinite(index) ? index : 0, 0),
    maxIndex,
  )
  const kana = members[safeIndex]

  const [doneDismissed, setDoneDismissed] = useState(false)
  /** 上一次渲染时本关是否已学完（用于识别「刚学完」的上升沿）。 */
  const wasMasteredRef = useRef(false)

  const groupProgress = selectKanaGroupProgress(state, groupId)
  const groupMastered =
    groupProgress.total > 0 && groupProgress.mastered >= groupProgress.total

  // 进入关：读关内续学断点；离开关：取消悬挂的「偷看」计时器。
  useEffect(() => {
    if (groupId === '') {
      return
    }
    appActions.startKanaGroup(groupId)
    setDoneDismissed(false)
    wasMasteredRef.current = false
    return () => {
      cancelKanaPeek()
    }
  }, [groupId])

  // 完成面板只在**本关刚被学完的那一刻**弹一次（对齐 P2 的 `moduleDone`——由事件驱动而非由状态派生）。
  // 若直接把面板绑在 `groupMastered` 上，用户每次回到已学完的关都会被挡一次，且无处关闭。
  useEffect(() => {
    if (groupMastered && !wasMasteredRef.current) {
      setDoneDismissed(false)
    }
    wasMasteredRef.current = groupMastered
  }, [groupMastered])

  // 卡片首次可见：展示即转态 + 清发音提示 + 预取下一个音的音频。
  useEffect(() => {
    if (kana === undefined) {
      return
    }
    appActions.markPresented(kanaProgressKey(kana.id))
    ttsController.clearNotice()
    const nextKana = members[safeIndex + 1]
    if (nextKana !== undefined) {
      ttsPrefetch.schedule(nextKana.hiragana, settings)
    }
  }, [kana?.id])

  if (group === undefined || members.length === 0 || kana === undefined) {
    return (
      <div className="KanaStudy">
        <div className="KanaStudy-head">
          <div className="KanaStudy-back" onClick={nav.back}>
            <span className="KanaStudy-backLabel">{STRINGS.common.back}</span>
          </div>
          <span className="KanaStudy-title">{STRINGS.kana.studyTitle}</span>
        </div>
        <div className="KanaStudy-empty">
          <span className="KanaStudy-emptyLabel">{STRINGS.kana.empty}</span>
        </div>
      </div>
    )
  }

  const script: KanaScript = state.runtime.kanaScript
  const glyph = script === 'hiragana' ? kana.hiragana : kana.katakana
  const nodeState = state.progress[kanaProgressKey(kana.id)]?.state ?? '未学'
  const base =
    kana.baseKanaId === undefined
      ? undefined
      : repository.getKanaById(kana.baseKanaId)

  /** 构成来源文案（浊音 / 半浊音 / 拗音由基准音构成，没有独立字源）。 */
  function derivationSuffix(): string {
    if (kana === undefined) {
      return ''
    }
    if (kana.voiceType === '浊音') {
      return STRINGS.kana.derivationDaku
    }
    if (kana.voiceType === '半浊音') {
      return STRINGS.kana.derivationHandaku
    }
    if (kana.voiceType === '拗音') {
      return STRINGS.kana.derivationYoon
    }
    return ''
  }

  function speak(text: string): void {
    void ttsController.speak(text, settings)
  }

  function advance(delta: number): void {
    appActions.setKanaIndex(safeIndex + delta)
  }

  function onSelfEval(selfEval: SelfEval): void {
    if (kana === undefined) {
      return
    }
    // 复用 W 域的唯一写入口（设计 §8.3）：K 域只换 targetId 前缀，不另开一条 SRS 通道。
    // 返回值（跳转决策）对假名恒为 `[{ rule: 'none' }]`——`repository.getWordById('kana:*')`
    // 返回 undefined，`evaluate` 不会被调用，故此处安全忽略。
    appActions.submitSelfEval(kanaProgressKey(kana.id), selfEval)
    advance(1)
  }

  function onSkip(): void {
    if (kana === undefined) {
      return
    }
    appActions.skipWord(kanaProgressKey(kana.id))
    advance(1)
  }

  /** 下一个「已解锁且未学完」的关（跳过当前关）；没有则 `null`。 */
  const next = selectKanaNextGroup(state, groupId)

  return (
    <div className="KanaStudy">
      <div className="KanaStudy-head">
        <div className="KanaStudy-back" onClick={nav.back}>
          <span className="KanaStudy-backLabel">{STRINGS.common.back}</span>
        </div>
        <span className="KanaStudy-title">
          {isReview ? STRINGS.kana.reviewTitle : STRINGS.kana.studyTitle}
        </span>
        <span className="KanaStudy-progress">
          {`${STRINGS.kana.cardProgress} ${safeIndex + 1}/${members.length}`}
        </span>
      </div>

      <span className="KanaStudy-groupName">{group.name}</span>

      <div className="KanaStudy-body">
        {/* ① 认形 */}
        <div className="KanaStudy-section">
          <div className="KanaStudy-glyphRow">
            <div
              className="KanaStudy-glyph"
              onClick={() => speak(kana.hiragana)}
            >
              <span className="KanaStudy-glyphText">{glyph}</span>
            </div>
            <div className="KanaStudy-glyphMeta">
              <span className="KanaStudy-romaji">{kana.romaji}</span>
              <NodeStateBadge state={nodeState} />
              <div className="KanaStudy-scripts">
                {(['hiragana', 'katakana'] as KanaScript[]).map((item) => (
                  <div
                    key={item}
                    className={
                      script === item
                        ? 'KanaStudy-script KanaStudy-script--on'
                        : 'KanaStudy-script'
                    }
                    onClick={() => appActions.setKanaScript(item)}
                  >
                    <span className="KanaStudy-scriptLabel">
                      {item === 'hiragana'
                        ? STRINGS.kana.scriptHiragana
                        : STRINGS.kana.scriptKatakana}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <TtsButton text={kana.hiragana} settings={settings} />
        </div>

        {/* ② 字源联想（复习模式隐藏：去掉学习辅助，直接自评检验） */}
        {isReview ? null : (
          <div className="KanaStudy-section">
            <span className="KanaStudy-sectionTitle">
              {kana.origin === undefined
                ? STRINGS.kana.derivationLabel
                : STRINGS.kana.originHiragana}
            </span>
            {kana.origin === undefined ? (
              <div className="KanaStudy-origin">
                <span
                  className="KanaStudy-originChar"
                  onClick={() => {
                    if (base !== undefined) {
                      speak(base.hiragana)
                    }
                  }}
                >
                  {base === undefined ? '—' : base.hiragana}
                </span>
                <span className="KanaStudy-originNote">
                  {`${derivationSuffix()}${
                    base === undefined ? '' : ` · ${base.romaji}`
                  }`}
                </span>
              </div>
            ) : (
              <>
                <div className="KanaStudy-origin">
                  <span
                    className="KanaStudy-originChar"
                    onClick={() => speak(kana.hiragana)}
                  >
                    {kana.origin.hiragana.char}
                  </span>
                  <span className="KanaStudy-originNote">
                    {`${kana.hiragana} ← ${kana.origin.hiragana.note}`}
                  </span>
                </div>
                <div className="KanaStudy-origin">
                  <span
                    className="KanaStudy-originChar"
                    onClick={() => speak(kana.hiragana)}
                  >
                    {kana.origin.katakana.char}
                  </span>
                  <span className="KanaStudy-originNote">
                    {`${kana.katakana} ← ${kana.origin.katakana.note}`}
                  </span>
                </div>
              </>
            )}
          </div>
        )}

        {/* ③ 应用实例 */}
        <div className="KanaStudy-section">
          <span className="KanaStudy-sectionTitle">
            {STRINGS.kana.examples}
          </span>
          {kana.examples.map((example) => (
            <div key={example.text} className="KanaStudy-example">
              <div
                className="KanaStudy-exampleMain"
                onClick={() => speak(example.text)}
              >
                <span className="KanaStudy-exampleText">{example.text}</span>
                <span className="KanaStudy-exampleAccent">
                  {example.accent}
                </span>
                <span className="KanaStudy-exampleKanji">{example.kanji}</span>
                <span className="KanaStudy-exampleMeaning">
                  {example.meaning}
                </span>
              </div>
              {example.wordId === undefined ? null : (
                <div
                  className="KanaStudy-chip"
                  onClick={() => {
                    if (example.wordId !== undefined) {
                      nav.goVocab(example.wordId)
                    }
                  }}
                >
                  <span className="KanaStudy-chipLabel">
                    {STRINGS.kana.inWordList}
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* ④ 书写（描红 / 默写；v1 不做笔顺动画，见设计 §13 Q2） */}
        <div className="KanaStudy-section">
          <span className="KanaStudy-sectionTitle">{STRINGS.kana.writing}</span>
          <KanaCanvas
            char={glyph}
            memoryMode={state.runtime.kanaMemoryMode}
            peekVisible={state.runtime.kanaPeekVisible}
            onToggleMemory={appActions.toggleKanaMemory}
            onPeek={revealKanaPeek}
          />
        </div>
      </div>

      {/* 三档自评：文案与配色与 P2 完全一致 */}
      <div className="KanaStudy-eval">
        <div
          className="KanaStudy-evalBtn KanaStudy-evalBtn--unknown"
          onClick={() => {
            onSelfEval('不认识')
          }}
        >
          <span className="KanaStudy-evalLabel">
            {STRINGS.study.selfEvalUnknown}
          </span>
        </div>
        <div
          className="KanaStudy-evalBtn KanaStudy-evalBtn--vague"
          onClick={() => {
            onSelfEval('模糊')
          }}
        >
          <span className="KanaStudy-evalLabel">
            {STRINGS.study.selfEvalVague}
          </span>
        </div>
        <div
          className="KanaStudy-evalBtn KanaStudy-evalBtn--known"
          onClick={() => {
            onSelfEval('认识')
          }}
        >
          <span className="KanaStudy-evalLabel">
            {STRINGS.study.selfEvalKnown}
          </span>
        </div>
      </div>

      <div className="KanaStudy-nav">
        <div
          className="KanaStudy-navBtn"
          onClick={() => {
            advance(-1)
          }}
        >
          <span className="KanaStudy-navLabel">{STRINGS.kana.prevKana}</span>
        </div>
        <div className="KanaStudy-wrong" onClick={() => undefined}>
          <span className="KanaStudy-wrongLabel">
            {`${STRINGS.study.sessionWrong} ${state.runtime.sessionWrongCount}`}
          </span>
        </div>
        <div className="KanaStudy-navBtn" onClick={onSkip}>
          <span className="KanaStudy-navLabel">{STRINGS.kana.skipKana}</span>
        </div>
        <div
          className="KanaStudy-navBtn"
          onClick={() => {
            advance(1)
          }}
        >
          <span className="KanaStudy-navLabel">{STRINGS.kana.nextKana}</span>
        </div>
      </div>

      {groupMastered && !doneDismissed ? (
        // 点遮罩关闭浮层（留在本关复习），点卡片内部不关闭。
        <div className="KanaStudy-done" onClick={() => setDoneDismissed(true)}>
          <div
            className="KanaStudy-doneCard"
            onClick={(event) => event.stopPropagation()}
          >
            <span className="KanaStudy-doneTitle">
              {STRINGS.kana.groupDoneTitle}
            </span>
            <span className="KanaStudy-doneBody">
              {STRINGS.kana.groupDoneBody}
            </span>
            <div className="KanaStudy-doneActions">
              <div
                className="KanaStudy-doneBtn KanaStudy-doneBtn--primary"
                onClick={() => nav.goKanaQuiz(groupId)}
              >
                <span className="KanaStudy-doneBtnLabel">
                  {STRINGS.kana.startQuiz}
                </span>
              </div>
              <div
                className="KanaStudy-doneBtn"
                onClick={() => {
                  if (next === null) {
                    nav.goKana()
                    return
                  }
                  enterKanaGroup(next.groupId, next.index)
                  nav.goKanaStudy(next.groupId)
                }}
              >
                <span className="KanaStudy-doneBtnLabel">
                  {next === null
                    ? STRINGS.kana.backToKana
                    : STRINGS.kana.nextGroup}
                </span>
              </div>
              <div className="KanaStudy-doneBtn" onClick={nav.goKana}>
                <span className="KanaStudy-doneBtnLabel">
                  {STRINGS.kana.backToKana}
                </span>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
