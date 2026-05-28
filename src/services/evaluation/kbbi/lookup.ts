import { eq } from 'drizzle-orm'
import { db } from '#/db'
import { dictionaryCache } from '#/db/schema'
import { getConfig } from '#/services/configurations-cache'
import { cari } from '#/services/evaluation/kbbi/cari'
import {
  CACHE_TTL_MS,
  getCacheMap,
  getDictSet,
  queueCacheWrite,
  setCacheEntry,
  warmDictStore,
} from '#/services/evaluation/kbbi/dict-store'
import { isEnglishWord } from '#/services/evaluation/kbbi/english'
import {
  getEnabledKbbiSources,
  type KbbiSourceName,
} from '#/services/evaluation/kbbi/sources'
import { getCachedClassification } from '#/services/evaluation/vocabulary-cache'

const AFFIX_PREFIX_RULES: ReadonlyArray<readonly [RegExp, string]> = [
  // meN- allomorphs before vowel-initial bases.
  // `meng-` and `meny-` are pure assimilation prefixes — no consonant in the base is deleted.
  // Try these BEFORE the generic /^me[mnlry]?([a-z])/ so the vowel of the base isn't captured.
  [/^meng(?=[aeiou])/, ''], // mengeksekusi → eksekusi
  [/^meny([aeiou])/, 's$1'], // menyusun → susun (s of the base is restored)
  // meN-/peN- nasal elision: the base's initial k/p/t/s is dropped after the
  // nasal prefix. These emit the consonant-restored stem *as an extra candidate*
  // (the rules above still emit the vowel-initial variant), so both are checked.
  // mengelola → kelola, pengelola → kelola, memukul → pukul, menulis → tulis.
  [/^meng([aeiou])/, 'k$1'],
  [/^peng([aeiou])/, 'k$1'],
  [/^mem([aeiou])/, 'p$1'],
  [/^pem([aeiou])/, 'p$1'],
  [/^men([aeiou])/, 't$1'],
  [/^pen([aeiou])/, 't$1'],
  // Generic meN- with consonant base (the captured letter IS the base's first letter).
  [/^me[mnlry]?([a-z])/, '$1'],
  [/^me([a-z])/, '$1'],
  [/^di([a-z])/, '$1'],
  [/^ber([a-z])/, '$1'],
  [/^be([a-z])/, '$1'],
  [/^ter([a-z])/, '$1'],
  [/^te([a-z])/, '$1'],
  [/^per([a-z])/, '$1'],
  [/^pe([a-z])/, '$1'],
  [/^se([a-z])/, '$1'],
  [/^ke([a-z])/, '$1'],
  [/^peng([a-z])/, '$1'],
  [/^pen([a-z])/, '$1'],
  [/^pem([a-z])/, '$1'],
  [/^pel([a-z])/, '$1'],
]

const AFFIX_SUFFIX_RULES: ReadonlyArray<readonly [RegExp, string]> = [
  [/([a-z])kan$/, '$1'],
  [/([a-z])an$/, '$1'],
  [/([a-z])i$/, '$1'],
  [/([a-z])nya$/, '$1'],
  [/([a-z])lah$/, '$1'],
  [/([a-z])kah$/, '$1'],
  [/([a-z])mu$/, '$1'],
  [/([a-z])ku$/, '$1'],
]

const computeAffixCandidates = (word: string): string[] => {
  const candidates = new Set<string>()
  const queue: string[] = [word]
  const seen = new Set<string>([word])
  let iterations = 0

  while (queue.length && iterations < 32) {
    iterations++
    const current = queue.shift() as string
    for (const [pattern, replacement] of AFFIX_PREFIX_RULES) {
      const stripped = current.replace(pattern, replacement)
      if (stripped !== current && stripped.length >= 2 && !seen.has(stripped)) {
        seen.add(stripped)
        candidates.add(stripped)
        queue.push(stripped)
      }
    }
    for (const [pattern, replacement] of AFFIX_SUFFIX_RULES) {
      const stripped = current.replace(pattern, replacement)
      if (stripped !== current && stripped.length >= 2 && !seen.has(stripped)) {
        seen.add(stripped)
        candidates.add(stripped)
        queue.push(stripped)
      }
    }
  }
  return [...candidates]
}

const affixMemo = new Map<string, string[]>()

const stripAffixes = (word: string): string[] => {
  const cached = affixMemo.get(word)
  if (cached) return cached
  const result = computeAffixCandidates(word)
  affixMemo.set(word, result)
  return result
}

export const stripAffixesForTest = stripAffixes

let localDumpDisabled = false

// Per-job budget for external KBBI lookups. Reset by `warmKbbiCaches()` at
// the start of every evaluation job to the `kbbi.external_lookup_budget`
// config value (default 300). A budget of 0 disables the cap entirely
// (treated as Infinity). When the budget reaches 0 during a job, further
// unknown words short-circuit to `databaseOnly: true, source: 'unverified'`
// without touching the external scrape sources — protecting against the
// rate-limit pressure long theses can produce.
let externalLookupsRemaining = Number.POSITIVE_INFINITY

// Snapshot of which KBBI sources are enabled for this job. Resolved once in
// warmKbbiCaches() so the per-token lookup loop avoids 5× config reads each.
let enabledSources: KbbiSourceName[] | null = null

const EXTERNAL_LOOKUP_TIMEOUT_MS = 3_000

export async function warmKbbiCaches(): Promise<void> {
  localDumpDisabled = (await getConfig('kbbi.disable_local_dump')) === 1
  const budget = await getConfig('kbbi.external_lookup_budget')
  externalLookupsRemaining = budget > 0 ? budget : Number.POSITIVE_INFINITY
  enabledSources = await getEnabledKbbiSources()
  if (localDumpDisabled) return
  await warmDictStore()
}

const existsInDictionary = async (word: string): Promise<boolean> => {
  if (localDumpDisabled) return false
  const set = getDictSet()
  if (set) return set.has(word)
  await warmDictStore()
  return getDictSet()?.has(word) ?? false
}

export const __setLocalDumpDisabledForTests = (disabled: boolean): void => {
  localDumpDisabled = disabled
}

export const __setExternalLookupBudgetForTests = (budget: number): void => {
  externalLookupsRemaining = budget > 0 ? budget : Number.POSITIVE_INFINITY
}

export const __getExternalLookupsRemainingForTests = (): number =>
  externalLookupsRemaining

const lookupCache = async (
  word: string,
): Promise<{ found: boolean } | null> => {
  const now = Date.now()
  const map = getCacheMap()
  if (map) {
    const entry = map.get(word)
    if (!entry) return null
    if (now - entry.fetchedAt > CACHE_TTL_MS) {
      map.delete(word)
      return null
    }
    return { found: entry.found }
  }
  const rows = await db
    .select({
      found: dictionaryCache.found,
      fetchedAt: dictionaryCache.fetchedAt,
    })
    .from(dictionaryCache)
    .where(eq(dictionaryCache.word, word))
    .limit(1)
  const row = rows[0]
  if (!row) return null
  if (now - row.fetchedAt.getTime() > CACHE_TTL_MS) return null
  return { found: row.found }
}

const writeCache = (
  word: string,
  found: boolean,
  source: string | null,
  arti: string | null,
): void => {
  setCacheEntry(word, found)
  queueCacheWrite({ word, found, source, arti })
}

// Where the verdict came from. Surfaced to the user so a warning is trustworthy
// (and so resolved words can show their provenance).
export type VerificationSource =
  | 'user-vocabulary' // matched an admin-configured vocabulary entry
  | 'local-database' // matched the local dump / lemma supplement (incl. affix/redup stems)
  | 'english-list' // recognized as an English/technical word
  | 'kbbi-online' // verdict reached by querying KBBI online (incl. negative cache)
  | 'unverified' // could not reach KBBI online (source busy/unreachable)

export type LookupResult = {
  known: boolean
  databaseOnly: boolean
  isEnglish: boolean
  source: VerificationSource
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
      return {
        known: true,
        databaseOnly: true,
        isEnglish: false,
        source: 'user-vocabulary',
      }
    case 'english':
    case 'tech':
      return {
        known: true,
        databaseOnly: true,
        isEnglish: true,
        source: 'user-vocabulary',
      }
    case 'typo':
      return {
        known: false,
        databaseOnly: true,
        isEnglish: false,
        source: 'user-vocabulary',
      }
  }
}

const inFlightLookups = new Map<string, Promise<LookupResult>>()

export async function isKnownWord(raw: string): Promise<LookupResult> {
  const word = raw.toLowerCase().trim()
  if (!word)
    return {
      known: true,
      databaseOnly: true,
      isEnglish: false,
      source: 'local-database',
    }
  const existing = inFlightLookups.get(word)
  if (existing) return existing
  const promise = doLookup(word).finally(() => {
    inFlightLookups.delete(word)
  })
  inFlightLookups.set(word, promise)
  return promise
}

async function doLookup(word: string): Promise<LookupResult> {
  const userClass = getCachedClassification(word)
  if (userClass) return classificationToResult(userClass)

  const dbHit: LookupResult = {
    known: true,
    databaseOnly: true,
    isEnglish: false,
    source: 'local-database',
  }

  const redupMatch = word.match(REDUPLICATION_RE)
  if (redupMatch) {
    const base = redupMatch[1]
    if (base.length >= 2) {
      const baseClass = getCachedClassification(base)
      if (baseClass) return classificationToResult(baseClass)
      if (await existsInDictionary(base)) return dbHit
    }
  }
  const redupAffixMatch = word.match(REDUPLICATION_PREFIX_RE)
  if (redupAffixMatch) {
    const base = redupAffixMatch[2]
    if (base.length >= 2) {
      const baseClass = getCachedClassification(base)
      if (baseClass) return classificationToResult(baseClass)
      if (await existsInDictionary(base)) return dbHit
    }
  }

  if (await existsInDictionary(word)) return dbHit

  for (const stem of stripAffixes(word)) {
    const stemClass = getCachedClassification(stem)
    if (stemClass) return classificationToResult(stemClass)
    if (await existsInDictionary(stem)) return dbHit
  }

  const cached = await lookupCache(word)
  if (cached?.found)
    return {
      known: true,
      databaseOnly: false,
      isEnglish: false,
      source: 'kbbi-online',
    }

  if (await isEnglishWord(word))
    return {
      known: true,
      databaseOnly: true,
      isEnglish: true,
      source: 'english-list',
    }

  if (cached)
    return {
      known: false,
      databaseOnly: false,
      isEnglish: false,
      source: 'kbbi-online',
    }

  if (externalLookupsRemaining <= 0) {
    return {
      known: false,
      databaseOnly: true,
      isEnglish: false,
      source: 'unverified',
    }
  }
  externalLookupsRemaining--

  const controller = new AbortController()
  const timer = setTimeout(
    () => controller.abort(new Error('external-lookup-timeout')),
    EXTERNAL_LOOKUP_TIMEOUT_MS,
  )
  try {
    const result = await cari(word, {
      signal: controller.signal,
      sources: enabledSources ?? undefined,
    })
    const found = Boolean(result.lema || result.arti?.length)
    const conclusive = found || result.attempted.length > 0
    if (conclusive && !result.rateLimited) {
      const cacheSource = result.source ?? result.attempted[0] ?? null
      writeCache(word, found, cacheSource, result.arti?.[0] ?? null)
      return {
        known: found,
        databaseOnly: false,
        isEnglish: false,
        source: 'kbbi-online',
      }
    }
    if (found) {
      return {
        known: true,
        databaseOnly: false,
        isEnglish: false,
        source: 'kbbi-online',
      }
    }
    return {
      known: false,
      databaseOnly: true,
      isEnglish: false,
      source: 'unverified',
    }
  } catch {
    return {
      known: false,
      databaseOnly: true,
      isEnglish: false,
      source: 'unverified',
    }
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
