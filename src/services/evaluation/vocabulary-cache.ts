import { db } from '#/db'
import { evaluationVocabulary } from '#/db/schema'
import type { VocabClassification } from '#/services/evaluation/vocabulary'

let cache: Map<string, VocabClassification> | null = null

export async function refreshVocabularyCache(): Promise<void> {
  const rows = await db
    .select({
      word: evaluationVocabulary.word,
      classification: evaluationVocabulary.classification,
    })
    .from(evaluationVocabulary)
  cache = new Map(rows.map((r) => [r.word.toLowerCase(), r.classification]))
}

export function getCachedClassification(
  rawWord: string,
): VocabClassification | null {
  if (!cache) return null
  return cache.get(rawWord.toLowerCase().trim()) ?? null
}
