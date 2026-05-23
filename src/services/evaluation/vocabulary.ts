import { eq } from 'drizzle-orm'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { db } from '#/db'
import { evaluationVocabulary } from '#/db/schema'

export const VOCAB_CLASSIFICATIONS = [
  'indonesian',
  'english',
  'tech',
  'brand',
  'ignore',
  'typo',
] as const

export type VocabClassification = (typeof VOCAB_CLASSIFICATIONS)[number]

export type VocabEntry = {
  word: string
  classification: VocabClassification
  notes: string | null
}

const vocabInputSchema = z.object({
  word: z.string().min(1).max(120),
  classification: z.enum(VOCAB_CLASSIFICATIONS),
  notes: z.string().max(500).nullable().optional(),
})

const deleteInputSchema = z.object({
  word: z.string().min(1).max(120),
})

export const listVocabulary = createServerFn({ method: 'GET' }).handler(
  async (): Promise<VocabEntry[]> => {
    const rows = await db
      .select({
        word: evaluationVocabulary.word,
        classification: evaluationVocabulary.classification,
        notes: evaluationVocabulary.notes,
      })
      .from(evaluationVocabulary)
      .orderBy(evaluationVocabulary.word)
    return rows
  },
)

export const setVocabularyEntry = createServerFn({ method: 'POST' })
  .inputValidator(vocabInputSchema)
  .handler(async ({ data }) => {
    const word = data.word.toLowerCase().trim()
    await db
      .insert(evaluationVocabulary)
      .values({
        word,
        classification: data.classification,
        notes: data.notes ?? null,
      })
      .onConflictDoUpdate({
        target: evaluationVocabulary.word,
        set: {
          classification: data.classification,
          notes: data.notes ?? null,
        },
      })
    const { refreshVocabularyCache } = await import(
      '#/services/evaluation/vocabulary-cache'
    )
    await refreshVocabularyCache()
    return { word, classification: data.classification }
  })

export const deleteVocabularyEntry = createServerFn({ method: 'POST' })
  .inputValidator(deleteInputSchema)
  .handler(async ({ data }) => {
    const word = data.word.toLowerCase().trim()
    await db
      .delete(evaluationVocabulary)
      .where(eq(evaluationVocabulary.word, word))
    const { refreshVocabularyCache } = await import(
      '#/services/evaluation/vocabulary-cache'
    )
    await refreshVocabularyCache()
    return { word }
  })
