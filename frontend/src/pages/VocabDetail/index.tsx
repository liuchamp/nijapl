import './index.css'
import { useEffect, useMemo } from 'react'
import { useParams } from 'react-router'
import { GrammarHighlightText } from '../../components/GrammarHighlightText/index.js'
import { NodeStateBadge } from '../../components/NodeStateBadge/index.js'
import { TtsButton } from '../../components/TtsButton/index.js'
import { STRINGS } from '../../constants/strings.js'
import { repository } from '../../data/index.js'
import { buildConjugationTable } from '../../engine/conjugation.js'
import { useNavigation } from '../../router/navigation.js'
import { buildSentenceHighlight } from '../../services/highlight.js'
import { emptyStudyEffect } from '../../services/jumpService.js'
import * as studySession from '../../services/studySession.js'
import { ttsPrefetch } from '../../services/ttsPrefetch.js'
import { useAppStore, useSettings } from '../../store/hooks.js'

/**
 * P3 词汇详解（架构 §7 T04 判据 5、6）。
 *
 * - **J5 动词变形**：`pos` 命中动词枚举时展示变形表（`buildConjugationTable`，纯引擎）；
 * - **J6 关联词**：`word.related` 渲染为 chips，可跳转对应词条；
 * - **J3 例句高亮**：按 `SentenceWord/SentenceGrammar.start/end` 切分高亮（`services/highlight`），
 *   仅高亮「未掌握语法」；缺偏移的语法点退化为下方文字列表（不猜位置、不越界）。
 */

/** P3 词汇详解。 */
export function VocabDetailPage() {
  const params = useParams<{ wordId: string }>()
  const wordId = params.wordId ?? ''
  const nav = useNavigation()
  const state = useAppStore((snapshot) => snapshot)
  const settings = useSettings()

  const word = useMemo(() => repository.getWordById(wordId), [wordId])
  const effect = useMemo(
    () =>
      word === undefined
        ? emptyStudyEffect()
        : studySession.evaluateSceneEffect(word),
    [word],
  )
  const conjugation = useMemo(
    () =>
      word !== undefined && effect.showConjugation
        ? buildConjugationTable(word)
        : [],
    [word, effect.showConjugation],
  )
  const relatedWords = useMemo(() => {
    if (word === undefined || !effect.showRelated) {
      return []
    }
    return (word.related ?? []).map((relation) => ({
      relation,
      target: repository.getWordById(relation.toId),
    }))
  }, [word, effect.showRelated])
  const sentences = useMemo(
    () => (word === undefined ? [] : repository.getSentencesByWord(word.id)),
    [word],
  )
  const sentenceRenders = useMemo(
    () =>
      sentences.map((sentence) => ({
        sentence,
        ...buildSentenceHighlight(sentence, wordId, effect.highlightGrammarIds),
      })),
    [sentences, wordId, effect.highlightGrammarIds],
  )

  // 预取前 2 条例句（纯优化：失败静默、播放器不可用时不预取，见设计 §5.4）。
  useEffect(() => {
    for (const render of sentenceRenders.slice(0, 2)) {
      ttsPrefetch.schedule(render.sentence.ja, settings)
    }
  }, [wordId])

  if (word === undefined) {
    return (
      <div className="Vocab">
        <div className="Vocab-head">
          <div className="Vocab-back" onClick={nav.back}>
            <span className="Vocab-backLabel">{STRINGS.common.back}</span>
          </div>
          <span className="Vocab-title">{STRINGS.vocab.title}</span>
        </div>
        <span className="Vocab-notFound">{STRINGS.vocab.notFound}</span>
      </div>
    )
  }

  const progress = state.progress[word.id]

  return (
    <div className="Vocab">
      <div className="Vocab-head">
        <div className="Vocab-back" onClick={nav.back}>
          <span className="Vocab-backLabel">{STRINGS.common.back}</span>
        </div>
        <span className="Vocab-title">{STRINGS.vocab.title}</span>
      </div>

      <div className="Vocab-hero">
        <span className="Vocab-kana">{word.kana}</span>
        <span className="Vocab-kanji">
          {word.kanji === '' ? word.kana : word.kanji}
        </span>
        <div className="Vocab-heroRow">
          <span className="Vocab-pos">{word.pos}</span>
          <TtsButton
            text={word.kana}
            settings={settings}
            label={STRINGS.tts.replay}
          />
        </div>
      </div>

      <div className="Vocab-block">
        <span className="Vocab-blockTitle">{STRINGS.vocab.meaning}</span>
        <span className="Vocab-meaning">{word.meaning}</span>
      </div>

      <div className="Vocab-block">
        <div className="Vocab-blockHead">
          <span className="Vocab-blockTitle">{STRINGS.vocab.memory}</span>
          <NodeStateBadge state={progress?.state ?? '未学'} />
        </div>
        <span className="Vocab-memoryLine">
          {`${STRINGS.vocab.wrongCount} ${progress?.wrongCount ?? 0}${STRINGS.common.times}`}
        </span>
      </div>

      {conjugation.length > 0 ? (
        <div className="Vocab-block">
          <span className="Vocab-blockTitle">{STRINGS.vocab.conjugation}</span>
          <div className="Vocab-conjTable">
            {conjugation.map((row) => (
              <div key={row.form} className="Vocab-conjRow">
                <span className="Vocab-conjForm">{row.form}</span>
                <span className="Vocab-conjValue">{row.value}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {relatedWords.length > 0 ? (
        <div className="Vocab-block">
          <span className="Vocab-blockTitle">{STRINGS.vocab.related}</span>
          <div className="Vocab-chips">
            {relatedWords.map(({ relation, target }) => (
              <div
                key={`${relation.toId}-${relation.type}`}
                className="Vocab-chip"
                onClick={() => {
                  if (target !== undefined) {
                    nav.goVocab(target.id)
                  }
                }}
              >
                <span className="Vocab-chipLabel">
                  {target === undefined
                    ? relation.toId
                    : target.kanji === ''
                      ? target.kana
                      : target.kanji}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="Vocab-block">
        <span className="Vocab-blockTitle">{STRINGS.vocab.sentences}</span>
        {sentenceRenders.length === 0 ? (
          <span className="Vocab-empty">{STRINGS.vocab.noSentences}</span>
        ) : (
          sentenceRenders.map((render) => (
            <div key={render.sentence.id} className="Vocab-sentence">
              <GrammarHighlightText
                text={render.sentence.ja}
                ranges={render.ranges}
                onTapGrammar={(grammarId) => {
                  nav.goGrammarDetail(grammarId)
                }}
              />
              <span className="Vocab-sentenceZh">{render.sentence.zh}</span>
              {render.missingGrammarIds.length > 0 ? (
                <span className="Vocab-sentenceFallback">
                  {render.missingGrammarIds
                    .map(
                      (grammarId) =>
                        repository.getGrammarById(grammarId)?.pattern ??
                        grammarId,
                    )
                    .join(' / ')}
                </span>
              ) : null}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
