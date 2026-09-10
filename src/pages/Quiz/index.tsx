import './index.css'
import { useMemo, useState } from '@lynx-js/react'
import { TtsButton } from '../../components/TtsButton/index.js'
import { STRINGS } from '../../constants/strings.js'
import { repository } from '../../data/index.js'
import { useNavigation } from '../../router/navigation.js'
import {
  buildQuizQuestions,
  isAnswerCorrect,
  type QuizMode,
} from '../../services/quiz.js'
import { appActions, useSettings } from '../../store/hooks.js'

/**
 * P8 自测（架构 §2.9 / T05 判据 4）。
 *
 * - **三题型**：日→中 / 中→日 / 听音选词；
 * - **听音走 C1**：listen 题型以 `TtsButton`（`ttsController`）播放发音，
 *   无 TTS 环境时按 C1 明确降级（展示假名，零静默失败）；
 * - **回写进度**：每次作答经 `appActions.submitSelfEval`（与 P2 同一条写入口）。
 */

const QUIZ_COUNT = 8
const MODES: QuizMode[] = ['ja-zh', 'zh-ja', 'listen']

function modeLabel(mode: QuizMode): string {
  if (mode === 'zh-ja') {
    return STRINGS.quiz.modeZhJa
  }
  if (mode === 'listen') {
    return STRINGS.quiz.modeListen
  }
  return STRINGS.quiz.modeJaZh
}

function promptLabel(mode: QuizMode): string {
  if (mode === 'zh-ja') {
    return STRINGS.quiz.promptZhJa
  }
  if (mode === 'listen') {
    return STRINGS.quiz.promptListen
  }
  return STRINGS.quiz.promptJaZh
}

/** P8 自测页。 */
export function QuizPage() {
  const nav = useNavigation()
  const settings = useSettings()
  const words = useMemo(() => repository.getAllWords(), [])

  const [mode, setMode] = useState<QuizMode>('ja-zh')
  const [index, setIndex] = useState(0)
  const [picked, setPicked] = useState<number | null>(null)
  const [score, setScore] = useState(0)
  const [done, setDone] = useState(false)

  const questions = useMemo(
    () => buildQuizQuestions(words, mode, QUIZ_COUNT),
    [words, mode],
  )
  const question = questions[index]

  function resetRound(): void {
    setIndex(0)
    setPicked(null)
    setScore(0)
    setDone(false)
  }

  function switchMode(next: QuizMode): void {
    if (next === mode) {
      return
    }
    setMode(next)
    resetRound()
  }

  function choose(optionIndex: number): void {
    if (picked !== null || question === undefined) {
      return
    }
    const correct = isAnswerCorrect(question, optionIndex)
    setPicked(optionIndex)
    if (correct) {
      setScore((current) => current + 1)
    }
    // 回写进度：答对→认识，答错→不认识（同一 SRS 写入口）。
    appActions.submitSelfEval(question.wordId, correct ? '认识' : '不认识')
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
  }

  return (
    <view className="Quiz">
      <view className="Quiz-head">
        <view className="Quiz-back" catchtap={nav.back}>
          <text className="Quiz-backLabel">{STRINGS.quiz.back}</text>
        </view>
        <text className="Quiz-title">{STRINGS.quiz.title}</text>
      </view>

      <view className="Quiz-modes">
        {MODES.map((item) => (
          <view
            key={item}
            className={mode === item ? 'Quiz-mode Quiz-mode--on' : 'Quiz-mode'}
            catchtap={() => switchMode(item)}
          >
            <text className="Quiz-modeLabel">{modeLabel(item)}</text>
          </view>
        ))}
      </view>

      {questions.length === 0 ? (
        <text className="Quiz-empty">{STRINGS.quiz.empty}</text>
      ) : done ? (
        <view className="Quiz-result">
          <text className="Quiz-resultTitle">{STRINGS.quiz.done}</text>
          <text className="Quiz-resultScore">
            {`${STRINGS.quiz.score} ${score}/${questions.length}`}
          </text>
          <view className="Quiz-restart" catchtap={resetRound}>
            <text className="Quiz-restartLabel">{STRINGS.quiz.restart}</text>
          </view>
        </view>
      ) : question !== undefined ? (
        <view className="Quiz-body">
          <text className="Quiz-progress">
            {`${STRINGS.quiz.progressLabel} ${index + 1}/${questions.length}`}
          </text>

          <text className="Quiz-promptLabel">{promptLabel(mode)}</text>

          {mode === 'listen' ? (
            <view className="Quiz-listen">
              <TtsButton
                text={question.answer}
                settings={settings}
                label={STRINGS.quiz.listen}
              />
            </view>
          ) : (
            <text className="Quiz-prompt">{question.prompt}</text>
          )}

          <view className="Quiz-options">
            {question.options.map((option, optionIndex) => {
              let className = 'Quiz-option'
              if (picked !== null) {
                if (optionIndex === question.answerIndex) {
                  className = 'Quiz-option Quiz-option--correct'
                } else if (optionIndex === picked) {
                  className = 'Quiz-option Quiz-option--wrong'
                }
              }
              return (
                <view
                  key={`${option.wordId}-${optionIndex}`}
                  className={className}
                  catchtap={() => choose(optionIndex)}
                >
                  <text className="Quiz-optionLabel">{option.text}</text>
                </view>
              )
            })}
          </view>

          {picked !== null ? (
            <view className="Quiz-feedback">
              <text
                className={
                  picked === question.answerIndex
                    ? 'Quiz-feedbackText Quiz-feedbackText--ok'
                    : 'Quiz-feedbackText Quiz-feedbackText--bad'
                }
              >
                {picked === question.answerIndex
                  ? STRINGS.quiz.correct
                  : `${STRINGS.quiz.wrong} · ${STRINGS.quiz.answerLabel}: ${question.answer}`}
              </text>
              <view className="Quiz-next" catchtap={next}>
                <text className="Quiz-nextLabel">
                  {index + 1 >= questions.length
                    ? STRINGS.quiz.finish
                    : STRINGS.quiz.next}
                </text>
              </view>
            </view>
          ) : null}
        </view>
      ) : null}
    </view>
  )
}
