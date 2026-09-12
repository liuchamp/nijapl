import { z } from 'zod'
import { SourceSchema } from './schema.js'

/**
 * K 域（五十音）数据 schema。
 *
 * **独立于** `BuildDataSchema`：`ARCH §8.7` 明确 W 域数据契约冻结，
 * K 域数据单独产 `data/build/kana.json`，不走 `BuildData`，避免波及既有引擎与测试。
 */

export const KanaVoiceTypeSchema = z.enum(['清音', '浊音', '半浊音', '拗音'])

export const KanaScriptSchema = z.enum(['hiragana', 'katakana'])

export const KanaVowelSchema = z.enum(['a', 'i', 'u', 'e', 'o', 'n'])

export const KanaWordSchema = z.object({
  text: z.string().min(1),
  accent: z.string(),
  kanji: z.string(),
  meaning: z.string().min(1),
  wordId: z.string().min(1).optional(),
})

export const KanaSchema = z.object({
  id: z.string().min(1),
  groupId: z.string().min(1),
  voiceType: KanaVoiceTypeSchema,
  row: z.string().min(1),
  vowel: KanaVowelSchema,
  romaji: z.string().min(1),
  romajiAliases: z.array(z.string().min(1)).min(1),
  hiragana: z.string().min(1),
  katakana: z.string().min(1),
  baseKanaId: z.string().min(1).optional(),
  origin: z
    .object({
      hiragana: z.object({ char: z.string().min(1), note: z.string().min(1) }),
      katakana: z.object({ char: z.string().min(1), note: z.string().min(1) }),
    })
    .optional(),
  strokePaths: z.array(z.string()),
  confusable: z.array(z.string().min(1)),
  examples: z.array(KanaWordSchema).min(1),
  source: SourceSchema,
})

export const KanaGroupSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  voiceType: KanaVoiceTypeSchema,
  order: z.number().int().positive(),
  prerequisiteGroupIds: z.array(z.string().min(1)),
  kanaIds: z.array(z.string().min(1)).min(1),
  source: SourceSchema,
})

/** `data/build/kana.json` 的整体 schema。 */
export const KanaDataSchema = z.object({
  groups: z.array(KanaGroupSchema),
  kana: z.array(KanaSchema),
})

export type KanaDataInput = z.infer<typeof KanaDataSchema>
