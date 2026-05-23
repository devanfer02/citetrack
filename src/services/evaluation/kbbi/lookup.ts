import { eq, sql } from 'drizzle-orm'
import { db } from '#/db'
import { dictionary, dictionaryCache } from '#/db/schema'
import { cari } from '#/services/evaluation/kbbi/cari'
import { isEnglishWord } from '#/services/evaluation/kbbi/english'
import { isTechTerm } from '#/services/evaluation/kbbi/tech-terms'

const AFFIX_PREFIX_PATTERNS = [
  /^me[mnlry]?([a-z])/,
  /^di([a-z])/,
  /^ber([a-z])/,
  /^ter([a-z])/,
  /^per([a-z])/,
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
  for (const pattern of AFFIX_PREFIX_PATTERNS) {
    const stripped = word.replace(pattern, '$1')
    if (stripped !== word && stripped.length >= 2) candidates.add(stripped)
  }
  for (const pattern of AFFIX_SUFFIX_PATTERNS) {
    const stripped = word.replace(pattern, '$1')
    if (stripped !== word && stripped.length >= 2) candidates.add(stripped)
  }
  for (const prefixPattern of AFFIX_PREFIX_PATTERNS) {
    const prefixStripped = word.replace(prefixPattern, '$1')
    if (prefixStripped === word) continue
    for (const suffixPattern of AFFIX_SUFFIX_PATTERNS) {
      const both = prefixStripped.replace(suffixPattern, '$1')
      if (both !== prefixStripped && both.length >= 2) candidates.add(both)
    }
  }
  return [...candidates]
}

const existsInDictionary = async (word: string): Promise<boolean> => {
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
  await db
    .insert(dictionaryCache)
    .values({ word, found, source, arti })
    .onConflictDoUpdate({
      target: dictionaryCache.word,
      set: { found, source, arti, fetchedAt: new Date() },
    })
}

const EXTERNAL_LOOKUP_TIMEOUT_MS = 10_000

export type LookupResult = {
  known: boolean
  databaseOnly: boolean
  isEnglish: boolean
}

export async function isKnownWord(raw: string): Promise<LookupResult> {
  const word = raw.toLowerCase().trim()
  if (!word) return { known: true, databaseOnly: true, isEnglish: false }

  if (await existsInDictionary(word))
    return { known: true, databaseOnly: true, isEnglish: false }

  for (const stem of stripAffixes(word)) {
    if (await existsInDictionary(stem))
      return { known: true, databaseOnly: true, isEnglish: false }
  }

  if (isTechTerm(word))
    return { known: true, databaseOnly: true, isEnglish: true }

  if (await isEnglishWord(word))
    return { known: true, databaseOnly: true, isEnglish: true }

  const cached = await lookupCache(word)
  if (cached)
    return { known: cached.found, databaseOnly: false, isEnglish: false }

  const controller = new AbortController()
  const timer = setTimeout(
    () => controller.abort(new Error('external-lookup-timeout')),
    EXTERNAL_LOOKUP_TIMEOUT_MS,
  )
  try {
    const result = await cari(word, { signal: controller.signal })
    const found = Boolean(result.lema || result.arti?.length)
    await writeCache(word, found, result.source, result.arti?.[0] ?? null)
    return { known: found, databaseOnly: false, isEnglish: false }
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
