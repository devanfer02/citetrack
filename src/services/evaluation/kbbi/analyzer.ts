import { isKnownWord } from '#/services/evaluation/kbbi/lookup'
import {
  loadDictBuckets,
  suggestKbbiWord,
} from '#/services/evaluation/kbbi/suggester'
import { overlapsRanges } from '#/services/evaluation/range-utils'

const TOKEN_RE = /[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'-]*/g
const PROPER_NOUN_RE = /^[A-Z]{2,}$/
const BAB_ONE_RE = /\bBAB\s*1\b/i
const DAFTAR_REFERENSI_RE = /\bDAFTAR\s+(REFERENSI|PUSTAKA)\b/i
const URL_RE = /\bhttps?:\/\/\S+|\bwww\.\S+|\b\S+\.(?:com|org|net|ac\.id|co\.id|go\.id|sch\.id|mil\.id|or\.id|web\.id|io|ly|gov|edu|info|dev|app|site|xyz)(?:\/\S*)?/gi
const CITATION_PAREN_RE = /\([A-Z][A-Za-z'.\- ]+,\s*\d{4}[a-z]?\)/g
const AUTHOR_YEAR_RE = /\b[A-Z][a-zà-ÿ'-]+\s+(?:&|dan|and|et\s+al\.?)\s+[A-Z][a-zà-ÿ'-]+(?:\s*\(?\s*\d{4}\s*\)?)?/g

export type KbbiFinding = {
  pageNumber: number
  offset: number
  token: string
  databaseOnly: boolean
  suggestion: string | null
  ruleId: 'kbbi.unknown-word' | 'kbbi.unknown-word.database-only'
  message: string
}

const findFirstBabPage = (pages: AnalyzedPage[]): number => {
  for (const page of pages) {
    if (BAB_ONE_RE.test(page.content)) return page.pageNumber
  }
  return pages[0]?.pageNumber ?? 1
}

const TOC_LEADER_RE = /\.{6,}/
const BAB_LISTING_RE = /\bBAB\s+\d+\b.*\bBAB\s+\d+\b/s

const findDaftarReferensiPage = (pages: AnalyzedPage[]): number | null => {
  for (let i = pages.length - 1; i >= 0; i--) {
    const page = pages[i]
    if (!DAFTAR_REFERENSI_RE.test(page.content)) continue
    if (TOC_LEADER_RE.test(page.content) && BAB_LISTING_RE.test(page.content)) continue
    return page.pageNumber
  }
  return null
}

const INTERNAL_CAPS_RE = /[a-z][A-Z]/
const HYPHEN_ABBREV_RE = /^[a-z]-[A-Z]/
const DIGIT_BOUND_RE = /-\d|\d-/

const isStructuralNonToken = (token: string, offsetInSentence: number): boolean => {
  if (PROPER_NOUN_RE.test(token)) return true
  if (/^\d+$/.test(token)) return true
  if (offsetInSentence > 0 && /^[A-Z]/.test(token)) return true
  if (INTERNAL_CAPS_RE.test(token)) return true
  if (token.endsWith('-')) return true
  if (token.startsWith('-')) return true
  if (HYPHEN_ABBREV_RE.test(token)) return true
  if (DIGIT_BOUND_RE.test(token)) return true
  return false
}

const collectItalicTokens = (
  content: string,
  italicRanges: Array<[number, number]>,
): Set<string> => {
  const tokens = new Set<string>()
  for (const [s, e] of italicRanges) {
    const slice = content.slice(s, e)
    for (const match of slice.matchAll(TOKEN_RE)) {
      if (match[0].length >= 2) tokens.add(match[0].toLowerCase())
    }
  }
  return tokens
}

const collectUrlRanges = (content: string): Array<[number, number]> => {
  const ranges: Array<[number, number]> = []
  for (const m of content.matchAll(URL_RE)) {
    const start = m.index ?? 0
    ranges.push([start, start + m[0].length])
  }
  return ranges
}

const CITATION_ET_AL_RE = /\bet\s+al\.?/gi
const SPACED_HYPHEN_REDUP_RE = /\b([A-Za-zÀ-ÿ]{2,})\s*-\s*\1\b/gi
const SPLIT_HYPHEN_REDUP_RE = /\b([A-Za-zÀ-ÿ]{2,})-\s+\1\b/gi

const collectCitationEtRanges = (content: string): Array<[number, number]> => {
  const ranges: Array<[number, number]> = []
  for (const m of content.matchAll(CITATION_ET_AL_RE)) {
    const start = m.index ?? 0
    ranges.push([start, start + m[0].length])
  }
  for (const m of content.matchAll(CITATION_PAREN_RE)) {
    const start = m.index ?? 0
    ranges.push([start, start + m[0].length])
  }
  for (const m of content.matchAll(AUTHOR_YEAR_RE)) {
    const start = m.index ?? 0
    ranges.push([start, start + m[0].length])
  }
  return ranges
}

const collectSpacedReduplications = (content: string): Set<number> => {
  const offsets = new Set<number>()
  for (const m of content.matchAll(SPACED_HYPHEN_REDUP_RE)) {
    const start = m.index ?? 0
    offsets.add(start)
    offsets.add(start + m[0].length - m[1].length)
  }
  for (const m of content.matchAll(SPLIT_HYPHEN_REDUP_RE)) {
    const start = m.index ?? 0
    offsets.add(start)
    offsets.add(start + m[0].length - m[1].length)
  }
  return offsets
}

const detectPdfSplitFragments = async (
  content: string,
  codeRanges: Array<[number, number]>,
): Promise<Set<number>> => {
  const fragmentOffsets = new Set<number>()
  type Tok = { text: string; offset: number; end: number }
  const tokens: Tok[] = []
  for (const m of content.matchAll(TOKEN_RE)) {
    const offset = m.index ?? 0
    tokens.push({ text: m[0], offset, end: offset + m[0].length })
  }

  type Candidate = { joined: string; fragmentOffsets: number[] }
  const joinCandidates: Candidate[] = []

  const singleSpaceBetween = (a: Tok, b: Tok): boolean => {
    const gap = content.slice(a.end, b.offset)
    return /^[ \t]$/.test(gap)
  }

  for (let i = 0; i < tokens.length - 1; i++) {
    const a = tokens[i]
    const b = tokens[i + 1]
    if (!singleSpaceBetween(a, b)) continue
    if (overlapsRanges(a.offset, b.end - a.offset, codeRanges)) continue
    const combinedLen = a.text.length + b.text.length
    if (combinedLen < 4 || combinedLen > 16) continue

    const hasShortSide = a.text.length <= 3 || b.text.length <= 3
    if (!hasShortSide) continue

    const frags: number[] = []
    if (a.text.length <= 3) frags.push(a.offset)
    if (b.text.length <= 3) frags.push(b.offset)
    if (a.text.length > 3) frags.push(a.offset)
    if (b.text.length > 3) frags.push(b.offset)
    joinCandidates.push({
      joined: (a.text + b.text).toLowerCase(),
      fragmentOffsets: frags,
    })

    if (i < tokens.length - 2) {
      const c = tokens[i + 2]
      if (singleSpaceBetween(b, c)) {
        const combinedLen3 = combinedLen + c.text.length
        if (combinedLen3 >= 5 && combinedLen3 <= 18 && b.text.length === 1) {
          joinCandidates.push({
            joined: (a.text + b.text + c.text).toLowerCase(),
            fragmentOffsets: [a.offset, b.offset, c.offset],
          })
        }
      }
    }
  }

  const concurrency = 8
  for (let i = 0; i < joinCandidates.length; i += concurrency) {
    const batch = joinCandidates.slice(i, i + concurrency)
    const results = await Promise.all(
      batch.map(async (c) => ({ c, known: (await isKnownWord(c.joined)).known })),
    )
    for (const { c, known } of results) {
      if (known) for (const o of c.fragmentOffsets) fragmentOffsets.add(o)
    }
  }
  return fragmentOffsets
}

const buildProperNounCorpus = (pages: AnalyzedPage[]): Set<string> => {
  const capCounts = new Map<string, number>()
  const lowerCounts = new Map<string, number>()
  for (const page of pages) {
    for (const m of page.content.matchAll(TOKEN_RE)) {
      const token = m[0]
      if (token.length < 3) continue
      const lower = token.toLowerCase()
      if (/^[A-Z][a-zà-ÿ]+$/.test(token)) {
        capCounts.set(lower, (capCounts.get(lower) ?? 0) + 1)
      } else if (/^[a-zà-ÿ]+$/.test(token)) {
        lowerCounts.set(lower, (lowerCounts.get(lower) ?? 0) + 1)
      }
    }
  }
  const properNouns = new Set<string>()
  for (const [word, count] of capCounts) {
    if (count >= 2 && (lowerCounts.get(word) ?? 0) === 0) {
      properNouns.add(word)
    }
  }
  return properNouns
}

export async function analyzeKbbi(
  pages: AnalyzedPage[],
): Promise<KbbiFinding[]> {
  if (!pages.length) return []

  const startPage = findFirstBabPage(pages)
  const refsPage = findDaftarReferensiPage(pages)
  const bodyPages = pages.filter((p) => {
    if (p.pageNumber < startPage) return false
    if (refsPage !== null && p.pageNumber >= refsPage) return false
    return true
  })

  const properNouns = buildProperNounCorpus(pages)
  const dictBuckets = await loadDictBuckets()
  const suggestionCache = new Map<string, string | null>()
  const findings: KbbiFinding[] = []

  for (const page of bodyPages) {
    const italicTokens = collectItalicTokens(page.content, page.italicRanges)
    const urlRanges = collectUrlRanges(page.content)
    const citationRanges = collectCitationEtRanges(page.content)
    const skipRanges: Array<[number, number]> = [
      ...page.codeRanges,
      ...urlRanges,
      ...citationRanges,
    ]
    const fragmentOffsets = await detectPdfSplitFragments(
      page.content,
      page.codeRanges,
    )
    const redupOffsets = collectSpacedReduplications(page.content)

    const starts: number[] = [0]
    for (const m of page.content.matchAll(/[.!?]\s+/g)) {
      starts.push((m.index ?? 0) + m[0].length)
    }

    const seen = new Set<string>()
    const candidates: Array<{ token: string; offset: number }> = []

    for (const match of page.content.matchAll(TOKEN_RE)) {
      const token = match[0]
      const offset = match.index ?? 0
      if (overlapsRanges(offset, token.length, skipRanges)) continue
      if (fragmentOffsets.has(offset)) continue
      if (redupOffsets.has(offset)) continue

      const sentenceStart = starts.findLast((s) => s <= offset) ?? 0
      const offsetInSentence = offset - sentenceStart
      if (isStructuralNonToken(token, offsetInSentence)) continue

      const lower = token.toLowerCase()
      if (lower.length < 2) continue
      if (italicTokens.has(lower)) continue
      if (properNouns.has(lower)) continue

      if (seen.has(lower)) continue
      seen.add(lower)
      candidates.push({ token, offset })
    }

    const concurrency = 8
    for (let i = 0; i < candidates.length; i += concurrency) {
      const batch = candidates.slice(i, i + concurrency)
      const results = await Promise.all(
        batch.map(async ({ token, offset }) => {
          const lookup = await isKnownWord(token)
          return { token, offset, ...lookup }
        }),
      )
      for (const r of results) {
        if (r.known) continue
        const lower = r.token.toLowerCase()
        if (!suggestionCache.has(lower)) {
          suggestionCache.set(lower, suggestKbbiWord(lower, dictBuckets))
        }
        const suggestion = suggestionCache.get(lower) ?? null
        const ruleId = r.databaseOnly
          ? 'kbbi.unknown-word.database-only'
          : 'kbbi.unknown-word'
        findings.push({
          pageNumber: page.pageNumber,
          offset: r.offset,
          token: r.token,
          databaseOnly: r.databaseOnly,
          suggestion,
          ruleId,
          message: r.databaseOnly
            ? `Kata "${r.token}" hanya dicek di database lokal, apakah ini istilah teknis/asing, nama brand, atau typo?`
            : `Kata "${r.token}" tidak ditemukan di KBBI, apakah ini istilah teknis/asing, nama brand, atau typo?`,
        })
      }
    }
  }

  return findings
}
