import { eq, sql } from 'drizzle-orm'
import { db } from '#/db'
import { dictionary, dictionaryCache } from '#/db/schema'
import { cari } from '#/services/evaluation/kbbi/cari'
import { isEnglishWord } from '#/services/evaluation/kbbi/english'
import { getCachedClassification } from '#/services/evaluation/vocabulary-cache'

const AFFIX_PREFIX_PATTERNS = [
  /^me[mnlry]?([a-z])/,
  /^me([a-z])/,
  /^di([a-z])/,
  /^ber([a-z])/,
  /^be([a-z])/,
  /^ter([a-z])/,
  /^te([a-z])/,
  /^per([a-z])/,
  /^pe([a-z])/,
  /^se([a-z])/,
  /^ke([a-z])/,
  /^peng([a-z])/,
  /^pen([a-z])/,
  /^pem([a-z])/,
  /^pel([a-z])/,
]

const AFFIX_SUFFIX_PATTERNS = [
  /([a-z])kan$/,
  /([a-z])an$/,
  /([a-z])i$/,
  /([a-z])nya$/,
  /([a-z])lah$/,
  /([a-z])kah$/,
  /([a-z])mu$/,
  /([a-z])ku$/,
]

const stripAffixes = (word: string): string[] => {
  const candidates = new Set<string>()
  const queue: string[] = [word]
  const seen = new Set<string>([word])
  let iterations = 0

  while (queue.length && iterations < 32) {
    iterations++
    const current = queue.shift()!
    for (const pattern of AFFIX_PREFIX_PATTERNS) {
      const stripped = current.replace(pattern, '$1')
      if (stripped !== current && stripped.length >= 2 && !seen.has(stripped)) {
        seen.add(stripped)
        candidates.add(stripped)
        queue.push(stripped)
      }
    }
    for (const pattern of AFFIX_SUFFIX_PATTERNS) {
      const stripped = current.replace(pattern, '$1')
      if (stripped !== current && stripped.length >= 2 && !seen.has(stripped)) {
        seen.add(stripped)
        candidates.add(stripped)
        queue.push(stripped)
      }
    }
  }
  return [...candidates]
}

let dictionarySet: Set<string> | null = null
let dictionaryCacheMap: Map<string, { found: boolean }> | null = null
let externalLookupsRemaining = Number.POSITIVE_INFINITY

const EXTERNAL_LOOKUP_TIMEOUT_MS = 3_000
const EXTERNAL_LOOKUP_BUDGET = 150

export async function warmKbbiCaches(): Promise<void> {
  const [dictRows, cacheRows] = await Promise.all([
    db
      .select({ word: sql<string>`lower(trim(${dictionary.word}))` })
      .from(dictionary),
    db
      .select({
        word: dictionaryCache.word,
        found: dictionaryCache.found,
      })
      .from(dictionaryCache)
      .where(sql`${dictionaryCache.source} is not null`),
  ])
  dictionarySet = new Set(dictRows.map((r) => r.word))
  dictionaryCacheMap = new Map(
    cacheRows.map((r) => [r.word, { found: r.found }]),
  )
  externalLookupsRemaining = EXTERNAL_LOOKUP_BUDGET
}

const existsInDictionary = async (word: string): Promise<boolean> => {
  if (dictionarySet) return dictionarySet.has(word)
  const rows = await db
    .select({ id: dictionary.id })
    .from(dictionary)
    .where(sql`lower(trim(${dictionary.word})) = ${word}`)
    .limit(1)
  return rows.length > 0
}

const lookupCache = async (
  word: string,
): Promise<{ found: boolean } | null> => {
  if (dictionaryCacheMap) return dictionaryCacheMap.get(word) ?? null
  const rows = await db
    .select({ found: dictionaryCache.found })
    .from(dictionaryCache)
    .where(eq(dictionaryCache.word, word))
    .limit(1)
  return rows[0] ?? null
}

const writeCache = async (
  word: string,
  found: boolean,
  source: string | null,
  arti: string | null,
): Promise<void> => {
  if (dictionaryCacheMap) dictionaryCacheMap.set(word, { found })
  await db
    .insert(dictionaryCache)
    .values({ word, found, source, arti })
    .onConflictDoUpdate({
      target: dictionaryCache.word,
      set: { found, source, arti, fetchedAt: new Date() },
    })
}

export type LookupResult = {
  known: boolean
  databaseOnly: boolean
  isEnglish: boolean
}

const REDUPLICATION_RE = /^([a-zà-ÿ]+)-\1$/i
const REDUPLICATION_PREFIX_RE = /^(ber|me|di|ter|pe|pem|pen|peng)?([a-zà-ÿ]+)-\2(an|kan|nya)?$/i

const classificationToResult = (
  classification: 'indonesian' | 'english' | 'tech' | 'brand' | 'ignore' | 'typo',
): LookupResult => {
  switch (classification) {
    case 'indonesian':
    case 'brand':
    case 'ignore':
      return { known: true, databaseOnly: true, isEnglish: false }
    case 'english':
    case 'tech':
      return { known: true, databaseOnly: true, isEnglish: true }
    case 'typo':
      return { known: false, databaseOnly: true, isEnglish: false }
  }
}

export async function isKnownWord(raw: string): Promise<LookupResult> {
  const word = raw.toLowerCase().trim()
  if (!word) return { known: true, databaseOnly: true, isEnglish: false }

  const userClass = getCachedClassification(word)
  if (userClass) return classificationToResult(userClass)

  const redupMatch = word.match(REDUPLICATION_RE)
  if (redupMatch) {
    const base = redupMatch[1]
    if (base.length >= 2) {
      const baseClass = getCachedClassification(base)
      if (baseClass) return classificationToResult(baseClass)
      if (await existsInDictionary(base)) {
        return { known: true, databaseOnly: true, isEnglish: false }
      }
    }
  }
  const redupAffixMatch = word.match(REDUPLICATION_PREFIX_RE)
  if (redupAffixMatch) {
    const base = redupAffixMatch[2]
    if (base.length >= 2) {
      const baseClass = getCachedClassification(base)
      if (baseClass) return classificationToResult(baseClass)
      if (await existsInDictionary(base)) {
        return { known: true, databaseOnly: true, isEnglish: false }
      }
    }
  }

  if (await existsInDictionary(word))
    return { known: true, databaseOnly: true, isEnglish: false }

  for (const stem of stripAffixes(word)) {
    const stemClass = getCachedClassification(stem)
    if (stemClass) return classificationToResult(stemClass)
    if (await existsInDictionary(stem))
      return { known: true, databaseOnly: true, isEnglish: false }
  }

  if (await isEnglishWord(word))
    return { known: true, databaseOnly: true, isEnglish: true }

  const cached = await lookupCache(word)
  if (cached)
    return { known: cached.found, databaseOnly: false, isEnglish: false }

  if (externalLookupsRemaining <= 0) {
    return { known: false, databaseOnly: true, isEnglish: false }
  }
  externalLookupsRemaining--

  const controller = new AbortController()
  const timer = setTimeout(
    () => controller.abort(new Error('external-lookup-timeout')),
    EXTERNAL_LOOKUP_TIMEOUT_MS,
  )
  try {
    const result = await cari(word, { signal: controller.signal })
    const found = Boolean(result.lema || result.arti?.length)
    const conclusive = found || result.attempted.length > 0
    if (conclusive) {
      const cacheSource = result.source ?? result.attempted[0] ?? null
      await writeCache(word, found, cacheSource, result.arti?.[0] ?? null)
      return { known: found, databaseOnly: false, isEnglish: false }
    }
    return { known: false, databaseOnly: true, isEnglish: false }
  } catch {
    return { known: false, databaseOnly: true, isEnglish: false }
  } finally {
    clearTimeout(timer)
  }
}

const PROPER_NOUN_RE = /^[A-Z]{2,}$/
const TOKEN_RE = /[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'-]*/g

export type UnknownToken = {
  token: string
  offset: number
  databaseOnly: boolean
}

export type TokenProgressReporter = (
  processed: number,
  total: number,
) => Promise<void> | void

const isProperNoun = (token: string, offsetInSentence: number): boolean => {
  if (PROPER_NOUN_RE.test(token)) return true
  if (/^\d+$/.test(token)) return true
  if (offsetInSentence > 0 && /^[A-Z]/.test(token)) return true
  return false
}

export async function findUnknownTokens(
  text: string,
  concurrency = 8,
  onTokenProgress?: TokenProgressReporter,
): Promise<UnknownToken[]> {
  const candidates = new Map<string, number>()
  const starts: number[] = [0]
  for (const m of text.matchAll(/[.!?]\s+/g)) {
    starts.push((m.index ?? 0) + m[0].length)
  }

  let match: RegExpExecArray | null
  const re = new RegExp(TOKEN_RE.source, 'g')
  while ((match = re.exec(text)) !== null) {
    const token = match[0]
    const offset = match.index
    const sentenceStart = starts.findLast((s) => s <= offset) ?? 0
    const offsetInSentence = offset - sentenceStart
    if (isProperNoun(token, offsetInSentence)) continue

    const lower = token.toLowerCase()
    if (lower.length < 2) continue
    if (!candidates.has(lower)) candidates.set(lower, offset)
  }

  const entries = [...candidates.entries()]
  const total = entries.length
  await onTokenProgress?.(0, total)

  const unknown: UnknownToken[] = []
  for (let i = 0; i < entries.length; i += concurrency) {
    const batch = entries.slice(i, i + concurrency)
    const results = await Promise.all(
      batch.map(async ([token, offset]) => {
        const lookup = await isKnownWord(token)
        return { token, offset, ...lookup }
      }),
    )
    for (const r of results) {
      if (!r.known) {
        unknown.push({
          token: r.token,
          offset: r.offset,
          databaseOnly: r.databaseOnly,
        })
      }
    }
    await onTokenProgress?.(Math.min(i + concurrency, total), total)
  }

  return unknown
}
