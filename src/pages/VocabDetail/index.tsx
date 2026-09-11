import './index.css'
import { useEffect, useMemo } from '@lynx-js/react'
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
      <view className="Vocab">
        <view className="Vocab-head">
          <view className="Vocab-back" catchtap={nav.back}>
            <text className="Vocab-backLabel">{STRINGS.common.back}</text>
          </view>
          <text className="Vocab-title">{STRINGS.vocab.title}</text>
        </view>
        <text className="Vocab-notFound">{STRINGS.vocab.notFound}</text>
      </view>
    )
  }

  const progress = state.progress[word.id]

  return (
    <view className="Vocab">
      <view className="Vocab-head">
        <view className="Vocab-back" catchtap={nav.back}>
          <text className="Vocab-backLabel">{STRINGS.common.back}</text>
        </view>
        <text className="Vocab-title">{STRINGS.vocab.title}</text>
      </view>

      <view className="Vocab-hero">
        <text className="Vocab-kana">{word.kana}</text>
        <text className="Vocab-kanji">
          {word.kanji === '' ? word.kana : word.kanji}
        </text>
        <view className="Vocab-heroRow">
          <text className="Vocab-pos">{word.pos}</text>
          <TtsButton
            text={word.kana}
            settings={settings}
            label={STRINGS.tts.replay}
          />
        </view>
      </view>

      <view className="Vocab-block">
        <text className="Vocab-blockTitle">{STRINGS.vocab.meaning}</text>
        <text className="Vocab-meaning">{word.meaning}</text>
      </view>

      <view className="Vocab-block">
        <view className="Vocab-blockHead">
          <text className="Vocab-blockTitle">{STRINGS.vocab.memory}</text>
          <NodeStateBadge state={progress?.state ?? '未学'} />
        </view>
        <text className="Vocab-memoryLine">
          {`${STRINGS.vocab.wrongCount} ${progress?.wrongCount ?? 0}${STRINGS.common.times}`}
        </text>
      </view>

      {conjugation.length > 0 ? (
        <view className="Vocab-block">
          <text className="Vocab-blockTitle">{STRINGS.vocab.conjugation}</text>
          <view className="Vocab-conjTable">
            {conjugation.map((row) => (
              <view key={row.form} className="Vocab-conjRow">
                <text className="Vocab-conjForm">{row.form}</text>
                <text className="Vocab-conjValue">{row.value}</text>
              </view>
            ))}
          </view>
        </view>
      ) : null}

      {relatedWords.length > 0 ? (
        <view className="Vocab-block">
          <text className="Vocab-blockTitle">{STRINGS.vocab.related}</text>
          <view className="Vocab-chips">
            {relatedWords.map(({ relation, target }) => (
              <view
                key={`${relation.toId}-${relation.type}`}
                className="Vocab-chip"
                catchtap={() => {
                  if (target !== undefined) {
                    nav.goVocab(target.id)
                  }
                }}
              >
                <text className="Vocab-chipLabel">
                  {target === undefined
                    ? relation.toId
                    : target.kanji === ''
                      ? target.kana
                      : target.kanji}
                </text>
              </view>
            ))}
          </view>
        </view>
      ) : null}

      <view className="Vocab-block">
        <text className="Vocab-blockTitle">{STRINGS.vocab.sentences}</text>
        {sentenceRenders.length === 0 ? (
          <text className="Vocab-empty">{STRINGS.vocab.noSentences}</text>
        ) : (
          sentenceRenders.map((render) => (
            <view key={render.sentence.id} className="Vocab-sentence">
              <GrammarHighlightText
                text={render.sentence.ja}
                ranges={render.ranges}
                onTapGrammar={(grammarId) => {
                  nav.goGrammarDetail(grammarId)
                }}
              />
              <text className="Vocab-sentenceZh">{render.sentence.zh}</text>
              {render.missingGrammarIds.length > 0 ? (
                <text className="Vocab-sentenceFallback">
                  {render.missingGrammarIds
                    .map(
                      (grammarId) =>
                        repository.getGrammarById(grammarId)?.pattern ??
                        grammarId,
                    )
                    .join(' / ')}
                </text>
              ) : null}
            </view>
          ))
        )}
      </view>
    </view>
  )
}
