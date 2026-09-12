import { z } from 'zod'

import { POS_LIST } from '../../src/constants/pos.js'

/** 数据来源枚举。 */
export const SourceSchema = z.enum(['seed', 'ai', 'human'])

/** 例句审核状态枚举。 */
export const ReviewStatusSchema = z.enum(['pending', 'approved'])

/** 词关系类型枚举。 */
export const WordRelationTypeSchema = z.enum([
  'synonym',
  'antonym',
  'derived',
  'sameModule',
])

/** 语法关系类型枚举。 */
export const GrammarRelationTypeSchema = z.enum([
  'hypernym',
  'hyponym',
  'synonym',
  'antonym',
])

export const StageSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  order: z.number().int(),
  weekRange: z.object({ start: z.number().int(), end: z.number().int() }),
  hasContent: z.boolean(),
  source: SourceSchema,
})

export const ModuleSchema = z.object({
  id: z.string().min(1),
  stageId: z.string().min(1),
  name: z.string().min(1),
  wordCount: z.number().int().nonnegative(),
  source: SourceSchema,
})

export const WordRelationSchema = z.object({
  fromId: z.string().min(1),
  toId: z.string().min(1),
  type: WordRelationTypeSchema,
})

export const WordSchema = z.object({
  id: z.string().min(1),
  kana: z.string().min(1),
  kanji: z.string(),
  pos: z.enum(POS_LIST),
  meaning: z.string().min(1),
  stageId: z.string().min(1),
  moduleId: z.string().min(1),
  source: SourceSchema,
  related: z.array(WordRelationSchema).optional(),
})

export const GrammarRelationSchema = z.object({
  fromId: z.string().min(1),
  toId: z.string().min(1),
  type: GrammarRelationTypeSchema,
})

export const GrammarSchema = z.object({
  id: z.string().min(1),
  pattern: z.string().min(1),
  connection: z.string().min(1),
  scene: z.string().min(1),
  week: z.number().int().nonnegative(),
  level: z.string().min(1),
  stageId: z.string().min(1),
  source: SourceSchema,
  related: z.array(GrammarRelationSchema).optional(),
})

export const SentenceWordSchema = z.object({
  sentenceId: z.string().min(1),
  wordId: z.string().min(1),
  surface: z.string().min(1),
  start: z.number().int().nonnegative().optional(),
  end: z.number().int().nonnegative().optional(),
})

export const SentenceGrammarSchema = z.object({
  sentenceId: z.string().min(1),
  grammarId: z.string().min(1),
  start: z.number().int().nonnegative().optional(),
  end: z.number().int().nonnegative().optional(),
})

export const SentenceSchema = z.object({
  id: z.string().min(1),
  ja: z.string().min(1),
  zh: z.string().min(1),
  level: z.string().min(1),
  source: SourceSchema,
  reviewStatus: ReviewStatusSchema,
  words: z.array(SentenceWordSchema),
  grammars: z.array(SentenceGrammarSchema),
})

/** `data/build/*.json` 的整体 schema。 */
export const BuildDataSchema = z.object({
  stages: z.array(StageSchema),
  modules: z.array(ModuleSchema),
  words: z.array(WordSchema),
  grammars: z.array(GrammarSchema),
  sentences: z.array(SentenceSchema),
})

export type BuildDataInput = z.infer<typeof BuildDataSchema>
