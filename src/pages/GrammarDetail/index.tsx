import './index.css'
import { useMemo } from '@lynx-js/react'
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
      <view className="GrammarDetail">
        <view className="GrammarDetail-head">
          <view className="GrammarDetail-back" catchtap={nav.back}>
            <text className="GrammarDetail-backLabel">
              {STRINGS.common.back}
            </text>
          </view>
          <text className="GrammarDetail-title">
            {STRINGS.grammarDetail.title}
          </text>
        </view>
        <text className="GrammarDetail-notFound">
          {STRINGS.grammarDetail.notFound}
        </text>
      </view>
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
    <view className="GrammarDetail">
      <view className="GrammarDetail-head">
        <view className="GrammarDetail-back" catchtap={nav.back}>
          <text className="GrammarDetail-backLabel">{STRINGS.common.back}</text>
        </view>
        <text className="GrammarDetail-title">
          {STRINGS.grammarDetail.title}
        </text>
      </view>

      <view className="GrammarDetail-hero">
        <text className="GrammarDetail-pattern">{grammar.pattern}</text>
        <text className="GrammarDetail-meta">
          {`${grammar.week}${STRINGS.grammarList.weekLabel} · ${grammar.level}`}
        </text>
      </view>

      <view className="GrammarDetail-block">
        <text className="GrammarDetail-blockTitle">
          {STRINGS.grammarDetail.connection}
        </text>
        <text className="GrammarDetail-body">{grammar.connection}</text>
      </view>

      <view className="GrammarDetail-block">
        <text className="GrammarDetail-blockTitle">
          {STRINGS.grammarDetail.scene}
        </text>
        <view className="GrammarDetail-chips">
          {scenes.map((scene) => (
            <view key={scene} className="GrammarDetail-chip">
              <text className="GrammarDetail-chipLabel">{scene}</text>
            </view>
          ))}
        </view>
      </view>

      <view className="GrammarDetail-block">
        <text className="GrammarDetail-blockTitle">
          {STRINGS.grammarDetail.examples}
        </text>
        {sentences.length === 0 ? (
          <text className="GrammarDetail-empty">
            {STRINGS.grammarDetail.emptyExamples}
          </text>
        ) : (
          sentences.map((sentence) => (
            <view key={sentence.id} className="GrammarDetail-sentence">
              <text className="GrammarDetail-sentenceJa">{sentence.ja}</text>
              <text className="GrammarDetail-sentenceZh">{sentence.zh}</text>
              <TtsButton
                text={sentence.ja}
                settings={settings}
                label={STRINGS.tts.replay}
              />
            </view>
          ))
        )}
      </view>

      <view className="GrammarDetail-block">
        <text className="GrammarDetail-blockTitle">
          {STRINGS.grammarDetail.related}
        </text>
        {relatedGrammars.length === 0 ? (
          <text className="GrammarDetail-empty">
            {STRINGS.grammarDetail.emptyRelated}
          </text>
        ) : (
          <view className="GrammarDetail-chips">
            {relatedGrammars.map(({ key, target }) => (
              <view
                key={key}
                className="GrammarDetail-chip GrammarDetail-chip--link"
                catchtap={() => {
                  if (target !== undefined) {
                    nav.goGrammarDetail(target.id)
                  }
                }}
              >
                <text className="GrammarDetail-chipLabel">
                  {target === undefined
                    ? STRINGS.grammarDetail.emptyRelated
                    : target.pattern}
                </text>
              </view>
            ))}
          </view>
        )}
      </view>

      <view className="GrammarDetail-block">
        <text className="GrammarDetail-blockTitle">
          {STRINGS.grammarDetail.words}
        </text>
        {involvedWords.length === 0 ? (
          <text className="GrammarDetail-empty">
            {STRINGS.grammarDetail.emptyWords}
          </text>
        ) : (
          <view className="GrammarDetail-chips">
            {involvedWords.map((word) => (
              <view
                key={word.id}
                className="GrammarDetail-chip GrammarDetail-chip--link"
                catchtap={() => nav.goVocab(word.id)}
              >
                <text className="GrammarDetail-chipLabel">
                  {word.kanji === '' ? word.kana : word.kanji}
                </text>
              </view>
            ))}
          </view>
        )}
      </view>

      <view className="GrammarDetail-block">
        <view className="GrammarDetail-blockHead">
          <text className="GrammarDetail-blockTitle">
            {STRINGS.grammarDetail.mastery}
          </text>
          <NodeStateBadge state={progress?.state ?? '未学'} />
        </view>
        <view className="GrammarDetail-eval">
          <view
            className="GrammarDetail-evalBtn GrammarDetail-evalBtn--unknown"
            catchtap={() => {
              onSelfEval('不认识')
            }}
          >
            <text className="GrammarDetail-evalLabel">
              {STRINGS.study.selfEvalUnknown}
            </text>
          </view>
          <view
            className="GrammarDetail-evalBtn GrammarDetail-evalBtn--vague"
            catchtap={() => {
              onSelfEval('模糊')
            }}
          >
            <text className="GrammarDetail-evalLabel">
              {STRINGS.study.selfEvalVague}
            </text>
          </view>
          <view
            className="GrammarDetail-evalBtn GrammarDetail-evalBtn--known"
            catchtap={() => {
              onSelfEval('认识')
            }}
          >
            <text className="GrammarDetail-evalLabel">
              {STRINGS.study.selfEvalKnown}
            </text>
          </view>
        </view>
      </view>
    </view>
  )
}
