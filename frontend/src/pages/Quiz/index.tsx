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
 *
 * 样式：原 `index.css` 已迁移为 Tailwind 工具类（数字 = rpx，
 * `--spacing` 基准为 `calc(1 * var(--rpx))`）；原语义类名保留作标记。
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
    <div className="Quiz flex flex-col flex-1 w-full p-md">
      <div className="Quiz-head flex flex-row items-center w-full mb-sm">
        <div
          className="Quiz-back cursor-pointer select-none px-md py-xs bg-surface-alt rounded-pill flex items-center gap-8"
          onClick={nav.back}
        >
          <Icon name="chevron-left" size="28rpx" />
          <span className="Quiz-backLabel cursor-pointer select-none text-sm text-text">
            {STRINGS.quiz.back}
          </span>
        </div>
        <span className="Quiz-title flex-1 text-center text-lg font-bold">
          {STRINGS.quiz.title}
        </span>
      </div>

      <div className="Quiz-modes flex flex-row items-center w-full mb-md">
        {MODES.map((item) => (
          <div
            key={item}
            className={
              mode === item
                ? 'Quiz-mode Quiz-mode--on flex-1 flex flex-row items-center justify-center py-xs mr-xs rounded-pill bg-primary'
                : 'Quiz-mode flex-1 flex flex-row items-center justify-center py-xs mr-xs rounded-pill bg-surface-alt'
            }
            onClick={() => switchMode(item)}
          >
            <span className="Quiz-modeLabel text-sm text-text">
              {modeLabel(item)}
            </span>
          </div>
        ))}
      </div>

      {questions.length === 0 ? (
        <span className="Quiz-empty text-md text-text-muted mt-lg">
          {STRINGS.quiz.empty}
        </span>
      ) : done ? (
        <div className="Quiz-result flex flex-col items-center w-full p-xl">
          <span className="Quiz-resultTitle text-lg font-bold mb-sm">
            {STRINGS.quiz.done}
          </span>
          <span className="Quiz-resultScore text-xl text-primary mb-lg">
            {`${STRINGS.quiz.score} ${score}/${questions.length}`}
          </span>
          <div
            className="Quiz-restart cursor-pointer select-none px-lg py-sm bg-surface-alt rounded-pill"
            onClick={resetRound}
          >
            <span className="Quiz-restartLabel cursor-pointer select-none text-md text-text">
              {STRINGS.quiz.restart}
            </span>
          </div>
        </div>
      ) : question !== undefined ? (
        <div className="Quiz-body flex flex-col w-full">
          <span className="Quiz-progress text-xs text-text-muted">
            {`${STRINGS.quiz.progressLabel} ${index + 1}/${questions.length}`}
          </span>

          <span className="Quiz-promptLabel text-sm text-text-muted mt-sm">
            {promptLabel(mode)}
          </span>

          {mode === 'listen' ? (
            <div className="Quiz-listen flex flex-row w-full mt-sm mb-md">
              <TtsButton
                text={question.answer}
                settings={settings}
                label={STRINGS.quiz.listen}
              />
            </div>
          ) : (
            <span className="Quiz-prompt text-xl font-bold text-text mt-sm mb-md">
              {question.prompt}
            </span>
          )}

          <div className="Quiz-options flex flex-col w-full">
            {question.options.map((option, optionIndex) => {
              let className =
                'Quiz-option flex flex-row items-center w-full p-md mb-sm bg-surface rounded-md border-[calc(1*var(--rpx))] border-border'
              if (picked !== null) {
                if (optionIndex === question.answerIndex) {
                  className =
                    'Quiz-option Quiz-option--correct flex flex-row items-center w-full p-md mb-sm rounded-md bg-[rgba(57,196,122,0.2)] border-[calc(1*var(--rpx))] border-success'
                } else if (optionIndex === picked) {
                  className =
                    'Quiz-option Quiz-option--wrong flex flex-row items-center w-full p-md mb-sm rounded-md bg-[rgba(255,95,109,0.2)] border-[calc(1*var(--rpx))] border-danger'
                }
              }
              return (
                <div
                  // biome-ignore lint/suspicious/noArrayIndexKey: key 为 `wordId + optionIndex` 复合键，全局唯一且稳定（与原实现一致）
                  key={`${option.wordId}-${optionIndex}`}
                  className={className}
                  onClick={() => choose(optionIndex)}
                >
                  <span className="Quiz-optionLabel text-md text-text">
                    {option.text}
                  </span>
                </div>
              )
            })}
          </div>

          {picked !== null ? (
            <div className="Quiz-feedback flex flex-col w-full mt-sm">
              <span
                className={
                  picked === question.answerIndex
                    ? 'Quiz-feedbackText Quiz-feedbackText--ok text-sm text-success'
                    : 'Quiz-feedbackText Quiz-feedbackText--bad text-sm text-danger'
                }
              >
                {picked === question.answerIndex
                  ? STRINGS.quiz.correct
                  : `${STRINGS.quiz.wrong} · ${STRINGS.quiz.answerLabel}: ${question.answer}`}
              </span>
              <div
                className="Quiz-next cursor-pointer select-none flex flex-row items-center justify-center w-full py-md mt-sm bg-primary rounded-pill"
                onClick={next}
              >
                <span className="Quiz-nextLabel cursor-pointer select-none text-md font-bold text-bg">
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
