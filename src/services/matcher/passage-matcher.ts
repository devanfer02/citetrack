import { buildIndex, rank, tokenize } from '#/lib/bm25'
import { preFilterPages } from '#/services/matcher/passage-prefilter'

const ACCEPT_THRESHOLD = 0.35
const EXACT_NGRAM_WORDS = 8
const WINDOW_SENTENCES = 3
const STRIDE_SENTENCES = 1

interface Window {
  text: string
  pageNumber: number
}

const normalize = (s: string): string =>
  s.toLowerCase().replace(/\s+/g, ' ').trim()

const splitSentences = (text: string): string[] => {
  const out = text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
    .map((s) => s.trim())
    .filter(Boolean)
  return out
}

const buildWindows = (pages: SourcePage[]): Window[] => {
  const windows: Window[] = []
  for (const p of pages) {
    const sentences = splitSentences(p.content)
    if (sentences.length === 0) continue
    const step = Math.max(1, STRIDE_SENTENCES)
    for (let i = 0; i < sentences.length; i += step) {
      const slice = sentences.slice(i, i + WINDOW_SENTENCES)
      if (slice.length === 0) break
      windows.push({ text: slice.join(' '), pageNumber: p.pageNumber })
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

const exactScore = (thesis: string, window: Window): number => {
  const ngrams = buildNgrams(thesis, EXACT_NGRAM_WORDS)
  if (ngrams.length === 0) return 0
  const haystack = normalize(window.text)
  for (const gram of ngrams) {
    if (haystack.includes(gram)) return 1
  }
  return 0
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

const fuzzyScore = (thesis: string, window: Window): number => {
  const a = normalize(thesis).slice(0, 400)
  const b = normalize(window.text).slice(0, 400)
  if (a.length === 0 || b.length === 0) return 0
  const maxLen = Math.max(a.length, b.length)
  const ratio = 1 - levenshtein(a, b) / maxLen
  if (ratio < 0.6) return 0
  return 0.6 + (ratio - 0.6) * (0.95 - 0.6) / 0.4
}

export function matchPassage(
  input: PassageMatchInput,
): PassageMatchResult | null {
  const candidates = preFilterPages(input.thesisContext, input.sourcePages)
  if (candidates.length === 0) return null

  const windows = buildWindows(candidates)
  if (windows.length === 0) return null

  const bm25Index = buildIndex(windows.map((w) => w.text))
  const bm25Scores = rank(bm25Index, input.thesisContext)
  const bm25Max = bm25Scores[0]?.score ?? 0
  const bm25Normalized = (s: number): number =>
    bm25Max === 0 ? 0 : Math.min(0.6, (s / bm25Max) * 0.6)

  let best: {
    window: Window
    confidence: number
    reasoning: 'exact' | 'fuzzy' | 'bm25'
  } | null = null

  for (let i = 0; i < windows.length; i++) {
    const w = windows[i]
    const exact = exactScore(input.thesisContext, w)
    const fuzzy = exact === 1 ? 0 : fuzzyScore(input.thesisContext, w)
    const bm25Raw = bm25Scores.find((r) => r.docIdx === i)?.score ?? 0
    const bm25 = bm25Normalized(bm25Raw)

    let confidence = exact
    let reasoning: 'exact' | 'fuzzy' | 'bm25' = 'exact'
    if (fuzzy > confidence) {
      confidence = fuzzy
      reasoning = 'fuzzy'
    }
    if (bm25 > confidence) {
      confidence = bm25
      reasoning = 'bm25'
    }

    if (confidence > (best?.confidence ?? 0)) {
      best = { window: w, confidence, reasoning }
    }
  }

  if (!best || best.confidence < ACCEPT_THRESHOLD) return null

  const reasoningCopy: Record<typeof best.reasoning, string> = {
    exact: 'Exact 8-word n-gram match between thesis context and source window',
    fuzzy: 'High Levenshtein similarity between thesis context and source window',
    bm25: 'Strongest BM25 overlap across candidate sentence windows',
  }

  return {
    citationKey: input.citationKey,
    sourcePage: best.window.pageNumber,
    matchedPassage: best.window.text,
    confidence: Math.round(best.confidence * 100) / 100,
    reasoning: reasoningCopy[best.reasoning],
  }
}

export { tokenize }
