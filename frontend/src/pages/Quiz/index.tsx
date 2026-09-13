import './index.css'
import { useMemo, useState } from 'react'
import { Icon } from '../../components/Icon/index.js'
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
    <div className="Quiz">
      <div className="Quiz-head">
        <div
          className="Quiz-back"
          onClick={nav.back}
          style={{ display: 'flex', alignItems: 'center', gap: '8rpx' }}
        >
          <Icon name="chevron-left" size="28rpx" />
          <span className="Quiz-backLabel">{STRINGS.quiz.back}</span>
        </div>
        <span className="Quiz-title">{STRINGS.quiz.title}</span>
      </div>

      <div className="Quiz-modes">
        {MODES.map((item) => (
          <div
            key={item}
            className={mode === item ? 'Quiz-mode Quiz-mode--on' : 'Quiz-mode'}
            onClick={() => switchMode(item)}
          >
            <span className="Quiz-modeLabel">{modeLabel(item)}</span>
          </div>
        ))}
      </div>

      {questions.length === 0 ? (
        <span className="Quiz-empty">{STRINGS.quiz.empty}</span>
      ) : done ? (
        <div className="Quiz-result">
          <span className="Quiz-resultTitle">{STRINGS.quiz.done}</span>
          <span className="Quiz-resultScore">
            {`${STRINGS.quiz.score} ${score}/${questions.length}`}
          </span>
          <div className="Quiz-restart" onClick={resetRound}>
            <span className="Quiz-restartLabel">{STRINGS.quiz.restart}</span>
          </div>
        </div>
      ) : question !== undefined ? (
        <div className="Quiz-body">
          <span className="Quiz-progress">
            {`${STRINGS.quiz.progressLabel} ${index + 1}/${questions.length}`}
          </span>

          <span className="Quiz-promptLabel">{promptLabel(mode)}</span>

          {mode === 'listen' ? (
            <div className="Quiz-listen">
              <TtsButton
                text={question.answer}
                settings={settings}
                label={STRINGS.quiz.listen}
              />
            </div>
          ) : (
            <span className="Quiz-prompt">{question.prompt}</span>
          )}

          <div className="Quiz-options">
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
                <div
                  // biome-ignore lint/suspicious/noArrayIndexKey: key 为 `wordId + optionIndex` 复合键，全局唯一且稳定（与原实现一致）
                  key={`${option.wordId}-${optionIndex}`}
                  className={className}
                  onClick={() => choose(optionIndex)}
                >
                  <span className="Quiz-optionLabel">{option.text}</span>
                </div>
              )
            })}
          </div>

          {picked !== null ? (
            <div className="Quiz-feedback">
              <span
                className={
                  picked === question.answerIndex
                    ? 'Quiz-feedbackText Quiz-feedbackText--ok'
                    : 'Quiz-feedbackText Quiz-feedbackText--bad'
                }
              >
                {picked === question.answerIndex
                  ? STRINGS.quiz.correct
                  : `${STRINGS.quiz.wrong} · ${STRINGS.quiz.answerLabel}: ${question.answer}`}
              </span>
              <div className="Quiz-next" onClick={next}>
                <span className="Quiz-nextLabel">
                  {index + 1 >= questions.length
                    ? STRINGS.quiz.finish
                    : STRINGS.quiz.next}
                </span>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
