import { STRINGS } from '../../constants/strings.js'
import { ttsController } from '../../services/ttsController.js'
import type { Kana } from '../../types/kana.js'
import type { StudySettings } from '../../types/progress.js'

/**
 * 易混对比卡（KC2，设计 §5.5）。
 *
 * 解决的是假名学习里**最真实的痛点**：`シ/ツ`、`ソ/ン`、`ね/れ/わ` 这类形近混淆，
 * 靠单卡反复看是记不住的——必须**并排对照**才看得出差异在哪一笔。
 *
 * 两侧可分别发音：用户的典型动作是「听 A、听 B、再听 A」，
 * 因此两侧各自是独立热区，且都要 `stopPropagation`（外层行若也绑了事件，会连带触发）。
 */

interface KanaConfusableCardProps {
  a: Kana
  b: Kana
  /** 两侧累计答错次数（排序依据，也是「为什么这张卡出现在这里」的解释）。 */
  wrongCount: number
  settings: StudySettings
}

/** 易混对比卡。 */
export function KanaConfusableCard(props: KanaConfusableCardProps) {
  const sides = [props.a, props.b]

  return (
    <div className="KanaConfusableCard flex flex-row items-center w-full mt-xs p-sm bg-surface rounded-md">
      {sides.map((item) => (
        <div
          key={item.id}
          // 原 `.side + .side { margin-left }`（相邻兄弟选择器）→ 等价于「非首个子元素」。
          className="KanaConfusableCard-side cursor-pointer select-none flex flex-row items-center justify-center gap-xs flex-1 py-xs bg-surface-alt rounded-md border-[calc(1*var(--rpx))] border-border [&:not(:first-child)]:ml-sm"
          onClick={() => {
            // 朗读依据恒为平假名（与 K1 / P2 一致）。
            void ttsController.speak(item.hiragana, props.settings)
          }}
        >
          <span className="KanaConfusableCard-hiragana text-lg text-text">
            {item.hiragana}
          </span>
          <span className="KanaConfusableCard-katakana text-sm text-text-muted">
            {item.katakana}
          </span>
          <span className="KanaConfusableCard-romaji text-xs text-primary">
            {item.romaji}
          </span>
        </div>
      ))}
      <span className="KanaConfusableCard-times ml-sm text-xs text-text-muted">
        {`${STRINGS.kana.reviewPairTimes} ${props.wrongCount}`}
      </span>
    </div>
  )
}
