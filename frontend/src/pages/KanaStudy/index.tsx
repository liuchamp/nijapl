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
 *
 * 样式：原 `index.css` 已迁移为 Tailwind 工具类（数字 = rpx，
 * `--spacing` 基准为 `calc(1 * var(--rpx))`）；原语义类名保留作标记。
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
      <div className="KanaStudy flex flex-col flex-1 w-full p-md">
        <div className="KanaStudy-head flex flex-row items-center justify-between w-full">
          <div
            className="KanaStudy-back cursor-pointer select-none px-md py-xs bg-surface-alt rounded-pill"
            onClick={nav.back}
          >
            <span className="KanaStudy-backLabel text-sm text-text">
              {STRINGS.common.back}
            </span>
          </div>
          <span className="KanaStudy-title text-lg font-bold">
            {STRINGS.kana.studyTitle}
          </span>
        </div>
        <div className="KanaStudy-empty flex flex-row items-center justify-center flex-1">
          <span className="KanaStudy-emptyLabel text-md text-text-muted">
            {STRINGS.kana.empty}
          </span>
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
    <div className="KanaStudy flex flex-col flex-1 w-full p-md">
      <div className="KanaStudy-head flex flex-row items-center justify-between w-full">
        <div
          className="KanaStudy-back cursor-pointer select-none px-md py-xs bg-surface-alt rounded-pill"
          onClick={nav.back}
        >
          <span className="KanaStudy-backLabel text-sm text-text">
            {STRINGS.common.back}
          </span>
        </div>
        <span className="KanaStudy-title text-lg font-bold">
          {isReview ? STRINGS.kana.reviewTitle : STRINGS.kana.studyTitle}
        </span>
        <span className="KanaStudy-progress text-xs text-text-muted">
          {`${STRINGS.kana.cardProgress} ${safeIndex + 1}/${members.length}`}
        </span>
      </div>

      <span className="KanaStudy-groupName mt-xs text-xs text-text-muted">
        {group.name}
      </span>

      <div className="KanaStudy-body flex flex-col flex-1 w-full mt-md">
        {/* ① 认形 */}
        <div className="KanaStudy-section flex flex-col w-full mb-md p-md bg-surface rounded-lg">
          <div className="KanaStudy-glyphRow flex flex-row items-center gap-md w-full">
            <div
              className="KanaStudy-glyph cursor-pointer select-none flex flex-row items-center justify-center w-240 h-240 bg-surface-alt rounded-lg"
              onClick={() => speak(kana.hiragana)}
            >
              <span className="KanaStudy-glyphText text-[calc(140*var(--rpx))] leading-none">
                {glyph}
              </span>
            </div>
            <div className="KanaStudy-glyphMeta flex flex-col items-start flex-1">
              <span className="KanaStudy-romaji mb-xs text-lg font-bold text-primary">
                {kana.romaji}
              </span>
              <NodeStateBadge state={nodeState} />
              <div className="KanaStudy-scripts flex flex-row gap-xs mt-sm">
                {(['hiragana', 'katakana'] as KanaScript[]).map((item) => (
                  <div
                    key={item}
                    className={
                      script === item
                        ? 'KanaStudy-script KanaStudy-script--on cursor-pointer select-none flex flex-row items-center justify-center px-sm py-xs rounded-pill bg-primary-soft opacity-100'
                        : 'KanaStudy-script cursor-pointer select-none flex flex-row items-center justify-center px-sm py-xs rounded-pill bg-surface-alt opacity-55'
                    }
                    onClick={() => appActions.setKanaScript(item)}
                  >
                    <span className="KanaStudy-scriptLabel text-xs text-text">
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
          <div className="KanaStudy-section flex flex-col w-full mb-md p-md bg-surface rounded-lg">
            <span className="KanaStudy-sectionTitle mb-sm text-xs text-text-muted">
              {kana.origin === undefined
                ? STRINGS.kana.derivationLabel
                : STRINGS.kana.originHiragana}
            </span>
            {kana.origin === undefined ? (
              <div className="KanaStudy-origin flex flex-row items-center gap-sm w-full mb-xs">
                <span
                  className="KanaStudy-originChar cursor-pointer select-none flex flex-row items-center justify-center w-72 h-72 bg-surface-alt rounded-md text-lg text-primary"
                  onClick={() => {
                    if (base !== undefined) {
                      speak(base.hiragana)
                    }
                  }}
                >
                  {base === undefined ? '—' : base.hiragana}
                </span>
                <span className="KanaStudy-originNote flex-1 text-sm text-text-muted">
                  {`${derivationSuffix()}${
                    base === undefined ? '' : ` · ${base.romaji}`
                  }`}
                </span>
              </div>
            ) : (
              <>
                <div className="KanaStudy-origin flex flex-row items-center gap-sm w-full mb-xs">
                  <span
                    className="KanaStudy-originChar cursor-pointer select-none flex flex-row items-center justify-center w-72 h-72 bg-surface-alt rounded-md text-lg text-primary"
                    onClick={() => speak(kana.hiragana)}
                  >
                    {kana.origin.hiragana.char}
                  </span>
                  <span className="KanaStudy-originNote flex-1 text-sm text-text-muted">
                    {`${kana.hiragana} ← ${kana.origin.hiragana.note}`}
                  </span>
                </div>
                <div className="KanaStudy-origin flex flex-row items-center gap-sm w-full mb-xs">
                  <span
                    className="KanaStudy-originChar cursor-pointer select-none flex flex-row items-center justify-center w-72 h-72 bg-surface-alt rounded-md text-lg text-primary"
                    onClick={() => speak(kana.hiragana)}
                  >
                    {kana.origin.katakana.char}
                  </span>
                  <span className="KanaStudy-originNote flex-1 text-sm text-text-muted">
                    {`${kana.katakana} ← ${kana.origin.katakana.note}`}
                  </span>
                </div>
              </>
            )}
          </div>
        )}

        {/* ③ 应用实例 */}
        <div className="KanaStudy-section flex flex-col w-full mb-md p-md bg-surface rounded-lg">
          <span className="KanaStudy-sectionTitle mb-sm text-xs text-text-muted">
            {STRINGS.kana.examples}
          </span>
          {kana.examples.map((example) => (
            <div
              key={example.text}
              className="KanaStudy-example flex flex-row items-center justify-between w-full mb-xs p-sm bg-surface-alt rounded-md"
            >
              <div
                className="KanaStudy-exampleMain cursor-pointer select-none flex flex-row items-center flex-wrap gap-xs flex-1"
                onClick={() => speak(example.text)}
              >
                <span className="KanaStudy-exampleText text-md text-text">
                  {example.text}
                </span>
                <span className="KanaStudy-exampleAccent text-xs text-text-muted">
                  {example.accent}
                </span>
                <span className="KanaStudy-exampleKanji text-md text-text">
                  {example.kanji}
                </span>
                <span className="KanaStudy-exampleMeaning text-sm text-text-muted">
                  {example.meaning}
                </span>
              </div>
              {example.wordId === undefined ? null : (
                <div
                  className="KanaStudy-chip cursor-pointer select-none ml-sm px-sm py-2 bg-primary-soft rounded-pill"
                  onClick={() => {
                    if (example.wordId !== undefined) {
                      nav.goVocab(example.wordId)
                    }
                  }}
                >
                  <span className="KanaStudy-chipLabel text-xs text-primary">
                    {STRINGS.kana.inWordList}
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* ④ 书写（描红 / 默写；v1 不做笔顺动画，见设计 §13 Q2） */}
        <div className="KanaStudy-section flex flex-col w-full mb-md p-md bg-surface rounded-lg">
          <span className="KanaStudy-sectionTitle mb-sm text-xs text-text-muted">
            {STRINGS.kana.writing}
          </span>
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
      <div className="KanaStudy-eval flex flex-row items-center justify-between gap-sm w-full mt-xs">
        <div
          className="KanaStudy-evalBtn KanaStudy-evalBtn--unknown cursor-pointer select-none flex-1 flex flex-row items-center justify-center py-md rounded-md border-[calc(1*var(--rpx))] border-border bg-[rgba(255,95,109,0.16)]"
          onClick={() => {
            onSelfEval('不认识')
          }}
        >
          <span className="KanaStudy-evalLabel text-md font-bold text-text">
            {STRINGS.study.selfEvalUnknown}
          </span>
        </div>
        <div
          className="KanaStudy-evalBtn KanaStudy-evalBtn--vague cursor-pointer select-none flex-1 flex flex-row items-center justify-center py-md rounded-md border-[calc(1*var(--rpx))] border-border bg-[rgba(240,180,74,0.16)]"
          onClick={() => {
            onSelfEval('模糊')
          }}
        >
          <span className="KanaStudy-evalLabel text-md font-bold text-text">
            {STRINGS.study.selfEvalVague}
          </span>
        </div>
        <div
          className="KanaStudy-evalBtn KanaStudy-evalBtn--known cursor-pointer select-none flex-1 flex flex-row items-center justify-center py-md rounded-md border-[calc(1*var(--rpx))] border-border bg-[rgba(57,196,122,0.16)]"
          onClick={() => {
            onSelfEval('认识')
          }}
        >
          <span className="KanaStudy-evalLabel text-md font-bold text-text">
            {STRINGS.study.selfEvalKnown}
          </span>
        </div>
      </div>

      <div className="KanaStudy-nav flex flex-row items-center justify-between gap-sm w-full mt-md">
        <div
          className="KanaStudy-navBtn cursor-pointer select-none flex-1 flex flex-row items-center justify-center py-sm bg-surface-alt rounded-pill"
          onClick={() => {
            advance(-1)
          }}
        >
          <span className="KanaStudy-navLabel text-sm text-text">
            {STRINGS.kana.prevKana}
          </span>
        </div>
        <div
          className="KanaStudy-wrong cursor-pointer select-none px-sm"
          onClick={() => undefined}
        >
          <span className="KanaStudy-wrongLabel cursor-pointer select-none text-xs text-text-muted">
            {`${STRINGS.study.sessionWrong} ${state.runtime.kanaSessionWrongCount}`}
          </span>
        </div>
        <div
          className="KanaStudy-navBtn cursor-pointer select-none flex-1 flex flex-row items-center justify-center py-sm bg-surface-alt rounded-pill"
          onClick={onSkip}
        >
          <span className="KanaStudy-navLabel text-sm text-text">
            {STRINGS.kana.skipKana}
          </span>
        </div>
        <div
          className="KanaStudy-navBtn cursor-pointer select-none flex-1 flex flex-row items-center justify-center py-sm bg-surface-alt rounded-pill"
          onClick={() => {
            advance(1)
          }}
        >
          <span className="KanaStudy-navLabel text-sm text-text">
            {STRINGS.kana.nextKana}
          </span>
        </div>
      </div>

      {groupMastered && !doneDismissed ? (
        // 点遮罩关闭浮层（留在本关复习），点卡片内部不关闭。
        <div
          className="KanaStudy-done fixed inset-0 flex flex-row items-center justify-center bg-[rgba(0,0,0,0.35)]"
          onClick={() => setDoneDismissed(true)}
        >
          <div
            className="KanaStudy-doneCard flex flex-col items-center w-[80%] p-lg bg-surface rounded-lg"
            onClick={(event) => event.stopPropagation()}
          >
            <span className="KanaStudy-doneTitle text-lg font-bold text-text">
              {STRINGS.kana.groupDoneTitle}
            </span>
            <span className="KanaStudy-doneBody mt-sm text-sm text-text-muted text-center">
              {STRINGS.kana.groupDoneBody}
            </span>
            <div className="KanaStudy-doneActions flex flex-col gap-sm w-full mt-lg">
              <div
                className="KanaStudy-doneBtn KanaStudy-doneBtn--primary cursor-pointer select-none flex flex-row items-center justify-center py-sm bg-primary rounded-pill"
                onClick={() => nav.goKanaQuiz(groupId)}
              >
                <span className="KanaStudy-doneBtnLabel text-sm text-text">
                  {STRINGS.kana.startQuiz}
                </span>
              </div>
              {next !== null ? (
                <div
                  className="KanaStudy-doneBtn cursor-pointer select-none flex flex-row items-center justify-center py-sm bg-surface-alt rounded-pill"
                  onClick={() => {
                    enterKanaGroup(next.groupId, next.index)
                    nav.goKanaStudy(next.groupId)
                  }}
                >
                  <span className="KanaStudy-doneBtnLabel text-sm text-text">
                    {STRINGS.kana.nextGroup}
                  </span>
                </div>
              ) : null}
              <div
                className="KanaStudy-doneBtn cursor-pointer select-none flex flex-row items-center justify-center py-sm bg-surface-alt rounded-pill"
                onClick={nav.goKana}
              >
                <span className="KanaStudy-doneBtnLabel text-sm text-text">
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
