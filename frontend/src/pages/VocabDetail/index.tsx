import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router'
import { GrammarHighlightText } from '../../components/GrammarHighlightText/index.js'
import { Icon } from '../../components/Icon/index.js'
import { NodeStateBadge } from '../../components/NodeStateBadge/index.js'
import { TtsButton } from '../../components/TtsButton/index.js'
import { STRINGS } from '../../constants/strings.js'
import { repository } from '../../data/index.js'
import { buildConjugationTable } from '../../engine/conjugation.js'
import { buildKanaGlyphIndex, splitKanaMora } from '../../engine/kana.js'
import { useNavigation } from '../../router/navigation.js'
import { buildSentenceHighlight } from '../../services/highlight.js'
import { emptyStudyEffect } from '../../services/jumpService.js'
import { enterKanaGroup } from '../../services/kanaWriteSession.js'
import * as studySession from '../../services/studySession.js'
import { ttsPrefetch } from '../../services/ttsPrefetch.js'
import { useAppStore, useSettings } from '../../store/hooks.js'

/**
 * P3 词汇详解（架构 §7 T04 判据 5、6 + 设计 §5.6 衔接点）。
 *
 * - **J5 动词变形**：`pos` 命中动词枚举时展示变形表（`buildConjugationTable`，纯引擎）；
 * - **J6 关联词**：`word.related` 渲染为 chips，可跳转对应词条；
 * - **J3 例句高亮**：按 `SentenceWord/SentenceGrammar.start/end` 切分高亮（`services/highlight`），
 *   仅高亮「未掌握语法」；缺偏移的语法点退化为下方文字列表（不猜位置、不越界）；
 * - **拆音**（默认收起）：把词条假名按音拍切开，逐格可跳 K1 复习该音——
 *   这是 K 域与 W 域之间**唯一的双向桥**：从「读不出这个词」直接落到「去学这个音」。
 *
 * 样式：原 `index.css` 已迁移为 Tailwind 工具类（数字 = rpx，
 * `--spacing` 基准为 `calc(1 * var(--rpx))`）；原语义类名保留作标记。
 */

/** P3 词汇详解。 */
export function VocabDetailPage() {
  const params = useParams<{ wordId: string }>()
  const wordId = params.wordId ?? ''
  const nav = useNavigation()
  const state = useAppStore((snapshot) => snapshot)
  const settings = useSettings()
  /** 拆音默认收起：词条卡的主任务是「认这个词」，拆音是按需的下钻动作。 */
  const [splitOpen, setSplitOpen] = useState(false)

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

  /** 「字形 → Kana」索引（104 条，进程内数据不变，只建一次）。 */
  const glyphIndex = useMemo(
    () => buildKanaGlyphIndex(repository.getAllKana()),
    [],
  )
  /** 拆音的 mora 序列。 */
  const moraList = useMemo(() => splitKanaMora(word?.kana ?? ''), [word])

  if (word === undefined) {
    return (
      <div className="Vocab flex flex-col flex-1 w-full p-md">
        <div className="Vocab-head flex flex-row items-center justify-between w-full">
          <div
            className="Vocab-back cursor-pointer select-none px-md py-xs bg-surface-alt rounded-pill flex items-center gap-8"
            onClick={nav.back}
          >
            <Icon name="chevron-left" size="28rpx" />
            <span className="Vocab-backLabel cursor-pointer select-none text-sm text-text">
              {STRINGS.common.back}
            </span>
          </div>
          <span className="Vocab-title text-md font-bold">
            {STRINGS.vocab.title}
          </span>
        </div>
        <span className="Vocab-notFound mt-xl text-center text-md text-text-muted">
          {STRINGS.vocab.notFound}
        </span>
      </div>
    )
  }

  const progress = state.progress[word.id]

  return (
    <div className="Vocab flex flex-col flex-1 w-full p-md">
      <div className="Vocab-head flex flex-row items-center justify-between w-full">
        <div
          className="Vocab-back cursor-pointer select-none px-md py-xs bg-surface-alt rounded-pill flex items-center gap-8"
          onClick={nav.back}
        >
          <Icon name="chevron-left" size="28rpx" />
          <span className="Vocab-backLabel cursor-pointer select-none text-sm text-text">
            {STRINGS.common.back}
          </span>
        </div>
        <span className="Vocab-title text-md font-bold">
          {STRINGS.vocab.title}
        </span>
      </div>

      <div className="Vocab-hero flex flex-col items-center w-full mt-md p-lg bg-surface rounded-lg">
        <span className="Vocab-kana text-xl font-bold">{word.kana}</span>
        <span className="Vocab-kanji mt-xs text-lg text-text-muted">
          {word.kanji === '' ? word.kana : word.kanji}
        </span>
        <div className="Vocab-heroRow flex flex-row items-center justify-between gap-sm w-full mt-md">
          <span className="Vocab-pos text-xs text-text-muted">{word.pos}</span>
          <TtsButton
            text={word.kana}
            settings={settings}
            label={STRINGS.tts.replay}
          />
          <div
            className={
              splitOpen
                ? 'Vocab-split Vocab-split--on cursor-pointer select-none px-md py-xs rounded-pill bg-primary-soft'
                : 'Vocab-split cursor-pointer select-none px-md py-xs rounded-pill bg-surface-alt'
            }
            onClick={() => setSplitOpen((prev) => !prev)}
          >
            <span className="Vocab-splitLabel text-xs text-text">
              {STRINGS.kana.splitKana}
            </span>
          </div>
        </div>

        {splitOpen ? (
          <div className="Vocab-mora flex flex-col w-full mt-md">
            <div className="Vocab-moraRow flex flex-row items-center justify-center flex-wrap gap-xs w-full">
              {moraList.map((mora, moraIndex) => {
                const item = glyphIndex.get(mora)
                return (
                  <div
                    // biome-ignore lint/suspicious/noArrayIndexKey: mora 在同一词内会重复（`コーヒー` 有两个 `ー`），下标是唯一性的必要组成部分
                    key={`${mora}-${moraIndex}`}
                    className={
                      item === undefined
                        ? 'Vocab-moraCell Vocab-moraCell--plain select-none flex flex-col items-center justify-center min-w-80 px-xs py-xs bg-surface-alt rounded-md cursor-default opacity-50'
                        : 'Vocab-moraCell cursor-pointer select-none flex flex-col items-center justify-center min-w-80 px-xs py-xs bg-surface-alt rounded-md'
                    }
                    onClick={() => {
                      if (item === undefined) {
                        return
                      }
                      const index = repository
                        .getKanaByGroup(item.groupId)
                        .findIndex((member) => member.id === item.id)
                      enterKanaGroup(item.groupId, index < 0 ? 0 : index)
                      nav.goKanaStudy(item.groupId)
                    }}
                  >
                    <span className="Vocab-moraText text-lg text-text">
                      {mora}
                    </span>
                    <span className="Vocab-moraRomaji mt-2 min-h-20 text-xs text-primary">
                      {item === undefined ? '' : item.romaji}
                    </span>
                  </div>
                )
              })}
            </div>
            <span className="Vocab-moraHint mt-sm text-xs text-text-muted">
              {STRINGS.kana.splitHint}
            </span>
          </div>
        ) : null}
      </div>

      <div className="Vocab-block flex flex-col w-full mt-md p-md bg-surface rounded-lg">
        <span className="Vocab-blockTitle text-md font-bold">
          {STRINGS.vocab.meaning}
        </span>
        <span className="Vocab-meaning mt-sm text-lg">{word.meaning}</span>
      </div>

      <div className="Vocab-block flex flex-col w-full mt-md p-md bg-surface rounded-lg">
        <div className="Vocab-blockHead flex flex-row items-center justify-between w-full">
          <span className="Vocab-blockTitle text-md font-bold">
            {STRINGS.vocab.memory}
          </span>
          <NodeStateBadge state={progress?.state ?? '未学'} />
        </div>
        <span className="Vocab-memoryLine mt-sm text-sm text-text-muted">
          {`${STRINGS.vocab.wrongCount} ${progress?.wrongCount ?? 0}${STRINGS.common.times}`}
        </span>
      </div>

      {conjugation.length > 0 ? (
        <div className="Vocab-block flex flex-col w-full mt-md p-md bg-surface rounded-lg">
          <span className="Vocab-blockTitle text-md font-bold">
            {STRINGS.vocab.conjugation}
          </span>
          <div className="Vocab-conjTable flex flex-col w-full mt-sm">
            {conjugation.map((row) => (
              <div
                key={row.form}
                className="Vocab-conjRow flex flex-row items-center justify-between w-full py-xs border-b-[calc(1*var(--rpx))] border-border"
              >
                <span className="Vocab-conjForm text-sm text-text-muted">
                  {row.form}
                </span>
                <span className="Vocab-conjValue text-md">{row.value}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {relatedWords.length > 0 ? (
        <div className="Vocab-block flex flex-col w-full mt-md p-md bg-surface rounded-lg">
          <span className="Vocab-blockTitle text-md font-bold">
            {STRINGS.vocab.related}
          </span>
          <div className="Vocab-chips cursor-pointer select-none flex flex-row flex-wrap w-full mt-sm">
            {relatedWords.map(({ relation, target }) => (
              <div
                key={`${relation.toId}-${relation.type}`}
                className="Vocab-chip cursor-pointer select-none px-md py-xs mr-sm mb-sm bg-primary-soft rounded-pill"
                onClick={() => {
                  if (target !== undefined) {
                    nav.goVocab(target.id)
                  }
                }}
              >
                <span className="Vocab-chipLabel cursor-pointer select-none text-sm text-primary">
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

      <div className="Vocab-block flex flex-col w-full mt-md p-md bg-surface rounded-lg">
        <span className="Vocab-blockTitle text-md font-bold">
          {STRINGS.vocab.sentences}
        </span>
        {sentenceRenders.length === 0 ? (
          <span className="Vocab-empty mt-sm text-sm text-text-muted">
            {STRINGS.vocab.noSentences}
          </span>
        ) : (
          sentenceRenders.map((render) => (
            <div
              key={render.sentence.id}
              className="Vocab-sentence flex flex-col w-full mt-sm p-sm bg-surface-alt rounded-md"
            >
              <GrammarHighlightText
                text={render.sentence.ja}
                ranges={render.ranges}
                onTapGrammar={(grammarId) => {
                  nav.goGrammarDetail(grammarId)
                }}
              />
              <span className="Vocab-sentenceZh mt-xs text-sm text-text-muted">
                {render.sentence.zh}
              </span>
              {render.missingGrammarIds.length > 0 ? (
                <span className="Vocab-sentenceFallback mt-xs text-xs text-primary">
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
