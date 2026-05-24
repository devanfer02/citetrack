import { sql } from 'drizzle-orm'
import { db } from '#/db'
import { dictionary, dictionaryCache } from '#/db/schema'

type CacheEntry = { found: boolean }

type CacheWrite = {
  word: string
  found: boolean
  source: string | null
  arti: string | null
}

let dictSet: Set<string> | null = null
let dictWords: string[] | null = null
let cacheMap: Map<string, CacheEntry> | null = null
let warmPromise: Promise<void> | null = null
const pendingWrites = new Map<string, CacheWrite>()

const doWarm = async (): Promise<void> => {
  const [dictRows, cacheRows] = await Promise.all([
    db
      .select({ word: sql<string>`lower(trim(${dictionary.word}))` })
      .from(dictionary),
    db
      .select({
        word: dictionaryCache.word,
        found: dictionaryCache.found,
      })
      .from(dictionaryCache),
  ])
  const words: string[] = []
  const set = new Set<string>()
  for (const { word } of dictRows) {
    if (!word) continue
    if (!set.has(word)) {
      set.add(word)
      words.push(word)
    }
  }
  dictSet = set
  dictWords = words
  cacheMap = new Map(cacheRows.map((r) => [r.word, { found: r.found }]))
}

export const warmDictStore = (force = false): Promise<void> => {
  if (force) {
    dictSet = null
    dictWords = null
    cacheMap = null
    warmPromise = null
  }
  if (dictSet && cacheMap) return Promise.resolve()
  warmPromise ??= doWarm().catch((err) => {
    warmPromise = null
    throw err
  })
  return warmPromise
}

export const getDictSet = (): Set<string> | null => dictSet

export const getDictWords = (): string[] | null => dictWords

export const getCacheMap = (): Map<string, CacheEntry> | null => cacheMap

export const setCacheEntry = (word: string, found: boolean): void => {
  cacheMap?.set(word, { found })
}

export const queueCacheWrite = (write: CacheWrite): void => {
  pendingWrites.set(write.word, write)
}

export async function flushCacheWrites(): Promise<void> {
  if (!pendingWrites.size) return
  const rows = [...pendingWrites.values()]
  await db
    .insert(dictionaryCache)
    .values(rows)
    .onConflictDoUpdate({
      target: dictionaryCache.word,
      set: {
        found: sql`excluded.found`,
        source: sql`excluded.source`,
        arti: sql`excluded.arti`,
        fetchedAt: sql`now()`,
      },
    })
  for (const row of rows) {
    if (pendingWrites.get(row.word) === row) {
      pendingWrites.delete(row.word)
    }
  }
}

export const __resetDictStoreForTests = (): void => {
  dictSet = null
  dictWords = null
  cacheMap = null
  warmPromise = null
  pendingWrites.clear()
}
