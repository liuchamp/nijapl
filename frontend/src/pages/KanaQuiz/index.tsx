import './index.css'
import { useMemo, useState } from 'react'
import { useLocation } from 'react-router'
import { TtsButton } from '../../components/TtsButton/index.js'
import { kanaProgressKey } from '../../constants/kana.js'
import { readKanaQuizGroup } from '../../constants/routes.js'
import { STRINGS } from '../../constants/strings.js'
import { repository } from '../../data/index.js'
import {
  buildKanaQuestions,
  buildKanaQuiz,
  matchKanaRomaji,
  pickFinalQuizTargets,
} from '../../engine/kana.js'
import { useNavigation } from '../../router/navigation.js'
import { appActions, useSettings } from '../../store/hooks.js'
import type { KanaQuizKind, KanaQuizQuestion } from '../../types/kana.js'

/**
 * K2 假名测验（设计 §5.3）。
 *
 * 五题型，全部**确定性出题**（零随机，对齐 AGENTS.md 红线）：
 * ① 听音选假名 ② 假名选罗马音 ③ 罗马音选假名 ④ 平片互译 ⑤ 输入罗马音。
 *
 * 两种进入方式：
 * - `?group=g01` → **本关测验**（题数 = 关内音数，每音一题）；
 * - 无参数 → **结业测验**（12 关全达标后，从 104 音里确定性抽样 20 题）。
 *
 * 判分回写复用 `submitReviewResult`（`targetId = 'kana:<id>'`）：
 * 答错 → `需强化` + `wrongCount + 1` → 自动进错音本（P7 的假名分区）。
 *
 * 题型⑤ 是本项目**第一个 `<input>`**：`body` 的 14px 字号不会被继承，
 * 故 `.KanaQuiz-input` 必须显式声明字号与配色（见 `index.css`）。
 */

/** 题型 → 题干提示文案。 */
function promptLabel(kind: KanaQuizKind, index: number): string {
  if (kind === 'listenToKana') {
    return STRINGS.kana.quizPromptListen
  }
  if (kind === 'kanaToRomaji') {
    return STRINGS.kana.quizPromptKanaToRomaji
  }
  if (kind === 'romajiToKana') {
    return STRINGS.kana.quizPromptRomajiToKana
  }
  if (kind === 'scriptSwap') {
    // 偶数题「平 → 片」，奇数题「片 → 平」（与引擎 `optionTextOf` 同一判据）。
    return index % 2 === 0
      ? STRINGS.kana.quizPromptScriptSwapToKatakana
      : STRINGS.kana.quizPromptScriptSwapToHiragana
  }
  return STRINGS.kana.quizPromptTypeRomaji
}

/**
 * 一道题是否答对。
 *
 * 选择题比**选项文本**（不是下标）：选项里 `answer` 恰好出现一次（干扰项构造时已排除答案文本），
 * 因此文本比对与「选中正确答案」等价，且不受选项摆放轮转的影响。
 * 输入题走变体容错（`matchKanaRomaji`：`し = shi | si`）。
 */
function isCorrect(
  question: KanaQuizQuestion,
  picked: number | null,
  typed: string,
): boolean {
  if (question.kind === 'typeRomaji') {
    const target = repository.getKanaById(question.targetId)
    if (target === undefined) {
      // 数据缺失时退化为精确比对：既不静默判对，也不抛错打断整轮测验。
      return typed.trim().toLowerCase() === question.answer.toLowerCase()
    }
    return matchKanaRomaji(typed, target)
  }
  if (picked === null) {
    return false
  }
  return question.options[picked] === question.answer
}

/** K2 假名测验页。 */
export function KanaQuizPage() {
  const location = useLocation()
  const nav = useNavigation()
  const settings = useSettings()

  const groupId = readKanaQuizGroup(location.search)
  const group =
    groupId === null ? undefined : repository.getKanaGroupById(groupId)

  // 出题只依赖关 id：`repository` 的返回对象在进程内稳定，`useMemo` 不会白算。
  const questions = useMemo(() => {
    const all = repository.getAllKana()
    if (group !== undefined) {
      return buildKanaQuiz(group, all)
    }
    return buildKanaQuestions(pickFinalQuizTargets(all), all)
  }, [group])

  const [index, setIndex] = useState(0)
  const [picked, setPicked] = useState<number | null>(null)
  const [typed, setTyped] = useState('')
  /** 本题是否已作答（与 `picked` 分开：输入题没有选项下标）。 */
  const [settled, setSettled] = useState(false)
  const [score, setScore] = useState(0)
  const [done, setDone] = useState(false)

  const question = questions[index]
  const correct =
    question !== undefined && settled
      ? isCorrect(question, picked, typed)
      : false

  function resetRound(): void {
    setIndex(0)
    setPicked(null)
    setTyped('')
    setSettled(false)
    setScore(0)
    setDone(false)
  }

  /** 统一判分入口：选择题传选项下标，输入题传 `null`。 */
  function settle(optionIndex: number | null): void {
    if (question === undefined || settled) {
      return
    }
    // 输入题空串不判：误触「确认」或空回车不该在错音本里留下一条错音。
    if (question.kind === 'typeRomaji' && typed.trim() === '') {
      return
    }
    const ok = isCorrect(
      question,
      optionIndex,
      optionIndex === null ? typed : '',
    )
    setPicked(optionIndex)
    setSettled(true)
    if (ok) {
      setScore((current) => current + 1)
    }
    // 回写：答对 → 进入下一间隔；答错 → 需强化 + 进错音本。
    appActions.submitReviewResult(kanaProgressKey(question.targetId), ok)
  }

  function next(): void {
    if (questions.length === 0) {
      return
    }
    if (index + 1 >= questions.length) {
      setDone(true)
      return
    }
    setIndex(index + 1)
    setPicked(null)
    setTyped('')
    setSettled(false)
  }

  return (
    <div className="KanaQuiz">
      <div className="KanaQuiz-head">
        <div className="KanaQuiz-back" onClick={nav.back}>
          <span className="KanaQuiz-backLabel">{STRINGS.kana.quizBack}</span>
        </div>
        <span className="KanaQuiz-title">{STRINGS.kana.quizTitle}</span>
      </div>

      <span className="KanaQuiz-scope">
        {group === undefined ? STRINGS.kana.graduationEntry : group.name}
      </span>

      {questions.length === 0 ? (
        <span className="KanaQuiz-empty">{STRINGS.kana.quizEmpty}</span>
      ) : done ? (
        <div className="KanaQuiz-result">
          <span className="KanaQuiz-resultTitle">{STRINGS.kana.quizDone}</span>
          <span className="KanaQuiz-resultScore">
            {`${STRINGS.kana.quizScore} ${score}/${questions.length}`}
          </span>
          <div className="KanaQuiz-restart" onClick={resetRound}>
            <span className="KanaQuiz-restartLabel">
              {STRINGS.kana.quizRestart}
            </span>
          </div>
          <div className="KanaQuiz-restart" onClick={nav.goKana}>
            <span className="KanaQuiz-restartLabel">
              {STRINGS.kana.backToKana}
            </span>
          </div>
        </div>
      ) : question !== undefined ? (
        <div className="KanaQuiz-body">
          <span className="KanaQuiz-progress">
            {`${STRINGS.kana.quizProgress} ${index + 1}/${questions.length}`}
          </span>

          <span className="KanaQuiz-promptLabel">
            {promptLabel(question.kind, index)}
          </span>

          {question.kind === 'listenToKana' ? (
            <div className="KanaQuiz-listen">
              <TtsButton
                text={question.answer}
                settings={settings}
                label={STRINGS.kana.quizListen}
              />
            </div>
          ) : (
            <span className="KanaQuiz-prompt">{question.prompt}</span>
          )}

          {question.kind === 'typeRomaji' ? (
            <>
              <div className="KanaQuiz-inputRow">
                <input
                  // key 逐题变化：连续两道输入题时强制重挂载，`autoFocus` 才会再次生效。
                  key={question.targetId}
                  className="KanaQuiz-input"
                  value={typed}
                  placeholder={STRINGS.kana.quizInputPlaceholder}
                  disabled={settled}
                  // biome-ignore lint/a11y/noAutofocus: 输入罗马音是**打字**题型，自动聚焦是本页面的核心交互（否则每题都要先点一次输入框）；同一时刻页面上只有这一个可聚焦控件，不存在焦点劫持。
                  autoFocus
                  onChange={(event) => setTyped(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      settle(null)
                    }
                  }}
                />
                <div className="KanaQuiz-submit" onClick={() => settle(null)}>
                  <span className="KanaQuiz-submitLabel">
                    {STRINGS.kana.quizSubmit}
                  </span>
                </div>
              </div>
              {settled ? null : (
                <span className="KanaQuiz-inputHint">
                  {STRINGS.kana.quizTypeRomajiHint}
                </span>
              )}
            </>
          ) : (
            <div className="KanaQuiz-options">
              {question.options.map((option, optionIndex) => {
                let className = 'KanaQuiz-option'
                if (settled) {
                  if (option === question.answer) {
                    className = 'KanaQuiz-option KanaQuiz-option--correct'
                  } else if (optionIndex === picked) {
                    className = 'KanaQuiz-option KanaQuiz-option--wrong'
                  }
                }
                return (
                  <div
                    // biome-ignore lint/suspicious/noArrayIndexKey: key 为 `选项文本 + 下标` 复合键——选项文本在本页内唯一（干扰项构造时已排除答案文本），加下标是为极端数据下也保证唯一
                    key={`${option}-${optionIndex}`}
                    className={className}
                    onClick={() => settle(optionIndex)}
                  >
                    <span className="KanaQuiz-optionLabel">{option}</span>
                  </div>
                )
              })}
            </div>
          )}

          {settled ? (
            <div className="KanaQuiz-feedback">
              <span
                className={
                  correct
                    ? 'KanaQuiz-feedbackText KanaQuiz-feedbackText--ok'
                    : 'KanaQuiz-feedbackText KanaQuiz-feedbackText--bad'
                }
              >
                {correct
                  ? STRINGS.kana.quizCorrect
                  : `${STRINGS.kana.quizWrong} · ${STRINGS.kana.quizAnswer}: ${question.answer}`}
              </span>
              <div className="KanaQuiz-next" onClick={next}>
                <span className="KanaQuiz-nextLabel">
                  {index + 1 >= questions.length
                    ? STRINGS.kana.quizFinish
                    : STRINGS.kana.quizNext}
                </span>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
