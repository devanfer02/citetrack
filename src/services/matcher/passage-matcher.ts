import { tokenize } from '#/lib/bm25'
import { type Embedder, dotProduct } from '#/services/matcher/embedder'
import { preFilterPages } from '#/services/matcher/passage-prefilter'

const EXACT_NGRAM_WORDS = 8
const WINDOW_SENTENCES = 3
const STRIDE_SENTENCES = 1
const ACCEPT_THRESHOLD = 0.42
const MIN_SEMANTIC_MARGIN = 0.015
const MIN_TOKEN_OVERLAP_RATE = 0.2

const COSINE_FLOORS: Record<string, number> = {
  'paraphrase-minilm-l12-v2': 0.55,
  'multilingual-e5-small': 0.78,
  'multilingual-e5-base': 0.78,
}

export interface Window {
  text: string
  pageNumber: number
  windowIdx: number
}

export interface MatcherDeps {
  embedder?: Embedder | null
  cachedWindowEmbeddings?: Map<string, Float32Array>
}

export const windowCacheKey = (pageNumber: number, windowIdx: number): string =>
  `p${pageNumber}:w${windowIdx}`

const normalize = (s: string): string =>
  s.toLowerCase().replace(/\s+/g, ' ').trim()

// Common abbreviations that would otherwise trigger false sentence breaks.
// Stored without trailing dot so we can check the token preceding the
// candidate boundary. Mixes English (academic prose) and Indonesian
// (skripsi conventions) — both languages appear in this codebase's inputs.
const ABBREVIATIONS = new Set([
  // English honorifics / academic
  'mr', 'mrs', 'ms', 'dr', 'prof', 'st', 'mt', 'sr', 'jr',
  // Citation / discourse markers
  'e.g', 'i.e', 'cf', 'vs', 'etc', 'al', 'fig', 'eq', 'ref', 'ch', 'pp', 'p',
  // Indonesian honorifics / common abbreviations
  'bpk', 'ibu', 'sdr', 'tn', 'ny', 'kk',
  'yth', 'dst', 'dll', 'hal', 'mis', 'tsb', 'spt', 'tgl', 'no', 'jl',
])

const endsWithAbbreviation = (segment: string): boolean => {
  const trimmed = segment.trimEnd()
  if (!trimmed.endsWith('.')) return false
  // Take the last whitespace-delimited token, strip the trailing dot.
  const lastSpace = trimmed.lastIndexOf(' ')
  const lastToken = (
    lastSpace === -1 ? trimmed : trimmed.slice(lastSpace + 1)
  )
    .slice(0, -1)
    .toLowerCase()
  if (lastToken.length === 0) return false
  // Single-letter dotted acronyms ("U.S.A." → trailing token is just a single
  // letter) — these are almost never end-of-sentence in academic prose.
  if (lastToken.length === 1 && /[a-z]/.test(lastToken)) return true
  return ABBREVIATIONS.has(lastToken)
}

export const splitSentences = (text: string): string[] => {
  const normalized = text.replace(/\s+/g, ' ')
  const rawSegments = normalized.split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
  if (rawSegments.length <= 1) {
    return rawSegments.map((s) => s.trim()).filter(Boolean)
  }
  // Stitch a segment back onto the previous one if the previous one ended
  // with an abbreviation token — the regex would have split inside "et al."
  // or "e.g." otherwise.
  const merged: string[] = []
  for (const seg of rawSegments) {
    if (merged.length > 0 && endsWithAbbreviation(merged[merged.length - 1])) {
      merged[merged.length - 1] = `${merged[merged.length - 1]} ${seg}`
    } else {
      merged.push(seg)
    }
  }
  return merged.map((s) => s.trim()).filter(Boolean)
}

export const buildWindows = (pages: SourcePage[]): Window[] => {
  const windows: Window[] = []
  for (const p of pages) {
    const sentences = splitSentences(p.content)
    if (sentences.length === 0) continue
    let widx = 0
    const step = Math.max(1, STRIDE_SENTENCES)
    for (let i = 0; i < sentences.length; i += step) {
      const slice = sentences.slice(i, i + WINDOW_SENTENCES)
      if (slice.length === 0) break
      windows.push({
        text: slice.join(' '),
        pageNumber: p.pageNumber,
        windowIdx: widx++,
      })
      if (i + WINDOW_SENTENCES >= sentences.length) break
    }
  }
  return windows
}

const buildNgrams = (text: string, n: number): string[] => {
  const words = normalize(text).split(' ').filter(Boolean)
  if (words.length < n) return []
  const out: string[] = []
  for (let i = 0; i <= words.length - n; i++) {
    out.push(words.slice(i, i + n).join(' '))
  }
  return out
}

const CITATION_INLINE_RE = /\([^)]*\b\d{4}[a-z]?\b[^)]*\)/g
const NARRATIVE_CITE_RE =
  /\b[A-Z][a-zA-Z]+(?:\s*(?:&|et\s+al\.?)\s*[A-Z][a-zA-Z]+)?\s*\(\d{4}[a-z]?\)/g

export const stripCitationMarkers = (text: string): string =>
  text
    .replace(CITATION_INLINE_RE, ' ')
    .replace(NARRATIVE_CITE_RE, ' ')
    .replace(/\s+/g, ' ')
    .trim()

interface Anchors {
  properNouns: Set<string>
  numbers: Set<string>
}

const PROPER_MID_RE = /(?<=\S\s)([A-Z][a-zA-Z]{2,}|[A-Z]{2,})/g

const extractAnchors = (text: string): Anchors => {
  const properNouns = new Set<string>()
  let m: RegExpExecArray | null
  PROPER_MID_RE.lastIndex = 0
  while ((m = PROPER_MID_RE.exec(text)) !== null) {
    properNouns.add(m[1].toLowerCase())
  }
  for (const tok of text.split(/\s+/)) {
    const clean = tok.replace(/[^A-Za-z]/g, '')
    if (clean.length >= 2 && /^[A-Z]+$/.test(clean)) {
      properNouns.add(clean.toLowerCase())
    }
    if (clean.length >= 4 && /^[A-Z][a-z]+[A-Z]/.test(clean)) {
      properNouns.add(clean.toLowerCase())
    }
  }

  const numbers = new Set<string>()
  const numMatches = text.match(/\b\d{2,}\b/g) ?? []
  for (const n of numMatches) numbers.add(n)

  return { properNouns, numbers }
}

const overlap = (a: Set<string>, b: Set<string>): number => {
  if (a.size === 0) return 0
  let hits = 0
  for (const x of a) if (b.has(x)) hits++
  return hits / a.size
}

const levenshtein = (a: string, b: string): number => {
  if (a === b) return 0
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  let curr = Array.from<number>({ length: b.length + 1 })
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost)
    }
    ;[prev, curr] = [curr, prev]
  }
  return prev[b.length]
}

const fuzzyRatio = (a: string, b: string): number => {
  const aa = normalize(a).slice(0, 400)
  const bb = normalize(b).slice(0, 400)
  if (aa.length === 0 || bb.length === 0) return 0
  const maxLen = Math.max(aa.length, bb.length)
  return 1 - levenshtein(aa, bb) / maxLen
}

interface ScoredCandidate {
  window: Window
  combined: number
  cosine: number
  reasoning: string
}

const cosineFloorFor = (modelName: string | undefined): number =>
  modelName ? (COSINE_FLOORS[modelName] ?? 0.7) : 0

export async function matchPassage(
  input: PassageMatchInput,
  deps: MatcherDeps = {},
): Promise<PassageMatchResult | null> {
  const candidates = preFilterPages(input.thesisContext, input.sourcePages)
  if (candidates.length === 0) return null

  const windows = buildWindows(candidates)
  if (windows.length === 0) return null

  const queryText = stripCitationMarkers(input.thesisContext)
  const queryAnchors = extractAnchors(queryText)
  const ngrams = buildNgrams(queryText, EXACT_NGRAM_WORDS)
  const queryTokens = new Set(tokenize(queryText))

  const tokenOverlapRate = (windowText: string): number => {
    if (queryTokens.size === 0) return 0
    const winTokens = new Set(tokenize(windowText))
    let hits = 0
    for (const t of queryTokens) if (winTokens.has(t)) hits++
    return hits / queryTokens.size
  }

  const cosines = Array.from<number>({ length: windows.length }).fill(0)
  let topCosine = 0
  let runnerUpCosine = 0

  if (deps.embedder) {
    const [queryEmb] = await deps.embedder.embedQueries([queryText])
    const windowEmbs = Array.from<Float32Array>({ length: windows.length })
    const missingIdx: number[] = []
    const missingTexts: string[] = []
    for (let i = 0; i < windows.length; i++) {
      const key = windowCacheKey(windows[i].pageNumber, windows[i].windowIdx)
      const cached = deps.cachedWindowEmbeddings?.get(key)
      if (cached) {
        windowEmbs[i] = cached
      } else {
        missingIdx.push(i)
        missingTexts.push(windows[i].text)
      }
    }
    if (missingTexts.length > 0) {
      const computed = await deps.embedder.embedPassages(missingTexts)
      for (let j = 0; j < missingIdx.length; j++) {
        windowEmbs[missingIdx[j]] = computed[j]
      }
    }
    for (let i = 0; i < windows.length; i++) {
      const c = dotProduct(queryEmb, windowEmbs[i])
      cosines[i] = c
      if (c > topCosine) {
        runnerUpCosine = topCosine
        topCosine = c
      } else if (c > runnerUpCosine) {
        runnerUpCosine = c
      }
    }
  }

  const cosineFloor = cosineFloorFor(deps.embedder?.name)
  let best: ScoredCandidate | null = null

  for (let i = 0; i < windows.length; i++) {
    const w = windows[i]
    const cosine = cosines[i]
    const haystack = normalize(w.text)
    const exact = ngrams.some((g) => haystack.includes(g)) ? 1 : 0
    const wAnchors = extractAnchors(w.text)
    const nounOverlap = overlap(queryAnchors.properNouns, wAnchors.properNouns)
    const numberHit = [...queryAnchors.numbers].some((n) =>
      wAnchors.numbers.has(n),
    )
      ? 1
      : 0
    const tokenRate = tokenOverlapRate(w.text)
    const hasAnchor =
      exact > 0 ||
      nounOverlap > 0 ||
      numberHit > 0 ||
      tokenRate >= MIN_TOKEN_OVERLAP_RATE

    let combined = 0
    let reasoning = ''

    if (deps.embedder) {
      if (cosine < cosineFloor) continue
      if (!hasAnchor) continue
      combined =
        0.55 * cosine +
        0.2 * exact +
        0.15 * nounOverlap +
        0.1 * numberHit
      reasoning = exact
        ? 'Semantic embedding + exact n-gram overlap'
        : nounOverlap > 0
          ? 'Semantic embedding + shared entity'
          : numberHit
            ? 'Semantic embedding + shared number/year'
            : 'Semantic embedding + token overlap'
    } else {
      if (!hasAnchor) continue
      const fuzzy = exact === 1 ? 0 : fuzzyRatio(queryText, w.text)
      combined =
        0.6 * tokenRate +
        0.25 * exact +
        0.1 * fuzzy +
        0.05 * nounOverlap
      reasoning = exact
        ? 'Exact 8-word n-gram match'
        : fuzzy > 0.6
          ? 'High Levenshtein similarity'
          : nounOverlap > 0
            ? 'Shared entity overlap'
            : 'High token overlap with thesis context'
    }

    if (combined > (best?.combined ?? 0)) {
      best = { window: w, combined, cosine, reasoning }
    }
  }

  if (!best) return null
  if (best.combined < ACCEPT_THRESHOLD) return null

  if (deps.embedder) {
    const margin = topCosine - runnerUpCosine
    if (
      margin < MIN_SEMANTIC_MARGIN &&
      best.cosine < cosineFloor + 0.05
    ) {
      return null
    }
  }

  return {
    citationKey: input.citationKey,
    sourcePage: best.window.pageNumber,
    matchedPassage: best.window.text,
    confidence: Math.round(best.combined * 100) / 100,
    reasoning: best.reasoning,
  }
}

export { tokenize }
