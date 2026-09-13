import { useMemo } from 'react'
import { useParams } from 'react-router'
import { Icon } from '../../components/Icon/index.js'
import { NodeStateBadge } from '../../components/NodeStateBadge/index.js'
import { TtsButton } from '../../components/TtsButton/index.js'
import { STRINGS } from '../../constants/strings.js'
import { repository } from '../../data/index.js'
import { useNavigation } from '../../router/navigation.js'
import { appActions, useAppStore, useSettings } from '../../store/hooks.js'
import type { Word } from '../../types/domain.js'
import type { SelfEval } from '../../types/progress.js'

/**
 * P5 语法详解（架构 §2.9 / T05 判据 2）。
 *
 * 结构：句型大字 → 接续 → 场景标签 → 例句（含 TTS / C1）→
 * 近义辨析（关联语法，**可互跳 P5**）→ 涉及词汇（**进 P3**）→ 掌握度自评（**经 actions 回写**）。
 * 自评复用同一 SRS 状态机（`submitGrammarSelfEval`），并累加今日语法配额。
 *
 * 样式：原 `index.css` 已迁移为 Tailwind 工具类（数字 = rpx，
 * `--spacing` 基准为 `calc(1 * var(--rpx))`）；原语义类名保留作标记。
 */

/** 场景标签切分（兼容中英标点）。 */
function splitScenes(scene: string): string[] {
  return scene
    .split(/[,、/|]/)
    .map((part) => part.trim())
    .filter((part) => part !== '')
}

/** P5 语法详解页。 */
export function GrammarDetailPage() {
  const params = useParams<{ grammarId: string }>()
  const grammarId = params.grammarId ?? ''
  const nav = useNavigation()
  const settings = useSettings()
  const state = useAppStore((snapshot) => snapshot)

  const grammar = useMemo(
    () => repository.getGrammarById(grammarId),
    [grammarId],
  )
  const sentences = useMemo(
    () =>
      grammar === undefined ? [] : repository.getSentencesByGrammar(grammar.id),
    [grammar],
  )
  const relatedGrammars = useMemo(() => {
    if (grammar === undefined) {
      return []
    }
    return (grammar.related ?? []).map((relation) => ({
      key: `${relation.toId}-${relation.type}`,
      target: repository.getGrammarById(relation.toId),
    }))
  }, [grammar])
  const involvedWords = useMemo<Word[]>(() => {
    const ids = new Set<string>()
    for (const sentence of sentences) {
      for (const link of sentence.words) {
        ids.add(link.wordId)
      }
    }
    const words: Word[] = []
    for (const id of ids) {
      const word = repository.getWordById(id)
      if (word !== undefined) {
        words.push(word)
      }
    }
    return words
  }, [sentences])

  if (grammar === undefined) {
    return (
      <div className="GrammarDetail flex flex-col flex-1 w-full p-md">
        <div className="GrammarDetail-head flex flex-row items-center w-full mb-md">
          <div
            className="GrammarDetail-back cursor-pointer select-none px-md py-xs bg-surface-alt rounded-pill flex items-center gap-8"
            onClick={nav.back}
          >
            <Icon name="chevron-left" size="28rpx" />
            <span className="GrammarDetail-backLabel cursor-pointer select-none text-sm text-text">
              {STRINGS.common.back}
            </span>
          </div>
          <span className="GrammarDetail-title flex-1 text-center text-lg font-bold">
            {STRINGS.grammarDetail.title}
          </span>
        </div>
        <span className="GrammarDetail-notFound text-md text-text-muted mt-lg">
          {STRINGS.grammarDetail.notFound}
        </span>
      </div>
    )
  }

  const progress = state.progress[grammar.id]
  const scenes = splitScenes(grammar.scene)

  function onSelfEval(selfEval: SelfEval): void {
    if (grammar === undefined) {
      return
    }
    appActions.submitGrammarSelfEval(grammar.id, selfEval)
  }

  return (
    <div className="GrammarDetail flex flex-col flex-1 w-full p-md">
      <div className="GrammarDetail-head flex flex-row items-center w-full mb-md">
        <div
          className="GrammarDetail-back cursor-pointer select-none px-md py-xs bg-surface-alt rounded-pill flex items-center gap-8"
          onClick={nav.back}
        >
          <Icon name="chevron-left" size="28rpx" />
          <span className="GrammarDetail-backLabel cursor-pointer select-none text-sm text-text">
            {STRINGS.common.back}
          </span>
        </div>
        <span className="GrammarDetail-title flex-1 text-center text-lg font-bold">
          {STRINGS.grammarDetail.title}
        </span>
      </div>

      <div className="GrammarDetail-hero flex flex-col items-center w-full pt-lg pb-lg">
        <span className="GrammarDetail-pattern text-xl font-bold text-primary">
          {grammar.pattern}
        </span>
        <span className="GrammarDetail-meta text-xs text-text-muted mt-xs">
          {`${grammar.week}${STRINGS.grammarList.weekLabel} · ${grammar.level}`}
        </span>
      </div>

      <div className="GrammarDetail-block flex flex-col w-full p-md mb-sm bg-surface rounded-md">
        <span className="GrammarDetail-blockTitle text-sm text-text-muted mb-xs">
          {STRINGS.grammarDetail.connection}
        </span>
        <span className="GrammarDetail-body text-md text-text">
          {grammar.connection}
        </span>
      </div>

      <div className="GrammarDetail-block flex flex-col w-full p-md mb-sm bg-surface rounded-md">
        <span className="GrammarDetail-blockTitle text-sm text-text-muted mb-xs">
          {STRINGS.grammarDetail.scene}
        </span>
        <div className="GrammarDetail-chips cursor-pointer select-none flex flex-row items-center flex-wrap w-full">
          {scenes.map((scene) => (
            <div
              key={scene}
              className="GrammarDetail-chip cursor-pointer select-none px-sm py-xs mr-xs mb-xs bg-surface-alt rounded-pill"
            >
              <span className="GrammarDetail-chipLabel cursor-pointer select-none text-xs text-text">
                {scene}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="GrammarDetail-block flex flex-col w-full p-md mb-sm bg-surface rounded-md">
        <span className="GrammarDetail-blockTitle text-sm text-text-muted mb-xs">
          {STRINGS.grammarDetail.examples}
        </span>
        {sentences.length === 0 ? (
          <span className="GrammarDetail-empty text-sm text-text-muted">
            {STRINGS.grammarDetail.emptyExamples}
          </span>
        ) : (
          sentences.map((sentence) => (
            <div
              key={sentence.id}
              className="GrammarDetail-sentence flex flex-col w-full pt-sm pb-sm border-b-[calc(1*var(--rpx))] border-border"
            >
              <span className="GrammarDetail-sentenceJa text-md text-text">
                {sentence.ja}
              </span>
              <span className="GrammarDetail-sentenceZh text-sm text-text-muted mt-xs mb-xs">
                {sentence.zh}
              </span>
              <TtsButton
                text={sentence.ja}
                settings={settings}
                label={STRINGS.tts.replay}
              />
            </div>
          ))
        )}
      </div>

      <div className="GrammarDetail-block flex flex-col w-full p-md mb-sm bg-surface rounded-md">
        <span className="GrammarDetail-blockTitle text-sm text-text-muted mb-xs">
          {STRINGS.grammarDetail.related}
        </span>
        {relatedGrammars.length === 0 ? (
          <span className="GrammarDetail-empty text-sm text-text-muted">
            {STRINGS.grammarDetail.emptyRelated}
          </span>
        ) : (
          <div className="GrammarDetail-chips cursor-pointer select-none flex flex-row items-center flex-wrap w-full">
            {relatedGrammars.map(({ key, target }) => (
              <div
                key={key}
                className="GrammarDetail-chip GrammarDetail-chip--link cursor-pointer select-none px-sm py-xs mr-xs mb-xs bg-surface-alt rounded-pill border-[calc(1*var(--rpx))] border-primary"
                onClick={() => {
                  if (target !== undefined) {
                    nav.goGrammarDetail(target.id)
                  }
                }}
              >
                <span className="GrammarDetail-chipLabel cursor-pointer select-none text-xs text-text">
                  {target === undefined
                    ? STRINGS.grammarDetail.emptyRelated
                    : target.pattern}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="GrammarDetail-block flex flex-col w-full p-md mb-sm bg-surface rounded-md">
        <span className="GrammarDetail-blockTitle text-sm text-text-muted mb-xs">
          {STRINGS.grammarDetail.words}
        </span>
        {involvedWords.length === 0 ? (
          <span className="GrammarDetail-empty text-sm text-text-muted">
            {STRINGS.grammarDetail.emptyWords}
          </span>
        ) : (
          <div className="GrammarDetail-chips cursor-pointer select-none flex flex-row items-center flex-wrap w-full">
            {involvedWords.map((word) => (
              <div
                key={word.id}
                className="GrammarDetail-chip GrammarDetail-chip--link cursor-pointer select-none px-sm py-xs mr-xs mb-xs bg-surface-alt rounded-pill border-[calc(1*var(--rpx))] border-primary"
                onClick={() => nav.goVocab(word.id)}
              >
                <span className="GrammarDetail-chipLabel cursor-pointer select-none text-xs text-text">
                  {word.kanji === '' ? word.kana : word.kanji}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="GrammarDetail-block flex flex-col w-full p-md mb-sm bg-surface rounded-md">
        <div className="GrammarDetail-blockHead flex flex-row items-center justify-between w-full">
          <span className="GrammarDetail-blockTitle text-sm text-text-muted mb-xs">
            {STRINGS.grammarDetail.mastery}
          </span>
          <NodeStateBadge state={progress?.state ?? '未学'} />
        </div>
        <div className="GrammarDetail-eval flex flex-row items-center w-full mt-sm">
          <div
            className="GrammarDetail-evalBtn GrammarDetail-evalBtn--unknown cursor-pointer select-none flex-1 flex flex-row items-center justify-center pt-md pb-md mr-sm rounded-md border-[calc(1*var(--rpx))] border-border bg-[rgba(255,95,109,0.16)]"
            onClick={() => {
              onSelfEval('不认识')
            }}
          >
            <span className="GrammarDetail-evalLabel text-md font-bold text-text">
              {STRINGS.study.selfEvalUnknown}
            </span>
          </div>
          <div
            className="GrammarDetail-evalBtn GrammarDetail-evalBtn--vague cursor-pointer select-none flex-1 flex flex-row items-center justify-center pt-md pb-md mr-sm rounded-md border-[calc(1*var(--rpx))] border-border bg-[rgba(240,180,74,0.16)]"
            onClick={() => {
              onSelfEval('模糊')
            }}
          >
            <span className="GrammarDetail-evalLabel text-md font-bold text-text">
              {STRINGS.study.selfEvalVague}
            </span>
          </div>
          <div
            className="GrammarDetail-evalBtn GrammarDetail-evalBtn--known cursor-pointer select-none flex-1 flex flex-row items-center justify-center pt-md pb-md mr-sm rounded-md border-[calc(1*var(--rpx))] border-border bg-[rgba(57,196,122,0.16)]"
            onClick={() => {
              onSelfEval('认识')
            }}
          >
            <span className="GrammarDetail-evalLabel text-md font-bold text-text">
              {STRINGS.study.selfEvalKnown}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
