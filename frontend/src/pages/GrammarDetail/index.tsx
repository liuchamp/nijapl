import './index.css'
import { useMemo } from 'react'
import { useParams } from 'react-router'
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
      <div className="GrammarDetail">
        <div className="GrammarDetail-head">
          <div className="GrammarDetail-back" onClick={nav.back}>
            <span className="GrammarDetail-backLabel">
              {STRINGS.common.back}
            </span>
          </div>
          <span className="GrammarDetail-title">
            {STRINGS.grammarDetail.title}
          </span>
        </div>
        <span className="GrammarDetail-notFound">
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
    <div className="GrammarDetail">
      <div className="GrammarDetail-head">
        <div className="GrammarDetail-back" onClick={nav.back}>
          <span className="GrammarDetail-backLabel">{STRINGS.common.back}</span>
        </div>
        <span className="GrammarDetail-title">
          {STRINGS.grammarDetail.title}
        </span>
      </div>

      <div className="GrammarDetail-hero">
        <span className="GrammarDetail-pattern">{grammar.pattern}</span>
        <span className="GrammarDetail-meta">
          {`${grammar.week}${STRINGS.grammarList.weekLabel} · ${grammar.level}`}
        </span>
      </div>

      <div className="GrammarDetail-block">
        <span className="GrammarDetail-blockTitle">
          {STRINGS.grammarDetail.connection}
        </span>
        <span className="GrammarDetail-body">{grammar.connection}</span>
      </div>

      <div className="GrammarDetail-block">
        <span className="GrammarDetail-blockTitle">
          {STRINGS.grammarDetail.scene}
        </span>
        <div className="GrammarDetail-chips">
          {scenes.map((scene) => (
            <div key={scene} className="GrammarDetail-chip">
              <span className="GrammarDetail-chipLabel">{scene}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="GrammarDetail-block">
        <span className="GrammarDetail-blockTitle">
          {STRINGS.grammarDetail.examples}
        </span>
        {sentences.length === 0 ? (
          <span className="GrammarDetail-empty">
            {STRINGS.grammarDetail.emptyExamples}
          </span>
        ) : (
          sentences.map((sentence) => (
            <div key={sentence.id} className="GrammarDetail-sentence">
              <span className="GrammarDetail-sentenceJa">{sentence.ja}</span>
              <span className="GrammarDetail-sentenceZh">{sentence.zh}</span>
              <TtsButton
                text={sentence.ja}
                settings={settings}
                label={STRINGS.tts.replay}
              />
            </div>
          ))
        )}
      </div>

      <div className="GrammarDetail-block">
        <span className="GrammarDetail-blockTitle">
          {STRINGS.grammarDetail.related}
        </span>
        {relatedGrammars.length === 0 ? (
          <span className="GrammarDetail-empty">
            {STRINGS.grammarDetail.emptyRelated}
          </span>
        ) : (
          <div className="GrammarDetail-chips">
            {relatedGrammars.map(({ key, target }) => (
              <div
                key={key}
                className="GrammarDetail-chip GrammarDetail-chip--link"
                onClick={() => {
                  if (target !== undefined) {
                    nav.goGrammarDetail(target.id)
                  }
                }}
              >
                <span className="GrammarDetail-chipLabel">
                  {target === undefined
                    ? STRINGS.grammarDetail.emptyRelated
                    : target.pattern}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="GrammarDetail-block">
        <span className="GrammarDetail-blockTitle">
          {STRINGS.grammarDetail.words}
        </span>
        {involvedWords.length === 0 ? (
          <span className="GrammarDetail-empty">
            {STRINGS.grammarDetail.emptyWords}
          </span>
        ) : (
          <div className="GrammarDetail-chips">
            {involvedWords.map((word) => (
              <div
                key={word.id}
                className="GrammarDetail-chip GrammarDetail-chip--link"
                onClick={() => nav.goVocab(word.id)}
              >
                <span className="GrammarDetail-chipLabel">
                  {word.kanji === '' ? word.kana : word.kanji}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="GrammarDetail-block">
        <div className="GrammarDetail-blockHead">
          <span className="GrammarDetail-blockTitle">
            {STRINGS.grammarDetail.mastery}
          </span>
          <NodeStateBadge state={progress?.state ?? '未学'} />
        </div>
        <div className="GrammarDetail-eval">
          <div
            className="GrammarDetail-evalBtn GrammarDetail-evalBtn--unknown"
            onClick={() => {
              onSelfEval('不认识')
            }}
          >
            <span className="GrammarDetail-evalLabel">
              {STRINGS.study.selfEvalUnknown}
            </span>
          </div>
          <div
            className="GrammarDetail-evalBtn GrammarDetail-evalBtn--vague"
            onClick={() => {
              onSelfEval('模糊')
            }}
          >
            <span className="GrammarDetail-evalLabel">
              {STRINGS.study.selfEvalVague}
            </span>
          </div>
          <div
            className="GrammarDetail-evalBtn GrammarDetail-evalBtn--known"
            onClick={() => {
              onSelfEval('认识')
            }}
          >
            <span className="GrammarDetail-evalLabel">
              {STRINGS.study.selfEvalKnown}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
