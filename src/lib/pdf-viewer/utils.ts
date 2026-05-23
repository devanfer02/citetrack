interface SpanIndex {
  el: HTMLElement
  start: number
  end: number
}

const SEPARATOR = ' '
// Soft-hyphen, zero-width space/joiners/non-joiner, word-joiner, BOM.
// PDF.js sometimes injects these in its text-content output, but they're
// never part of the offending token we want to highlight.
const INVISIBLE = /\u{00AD}|\u{200B}|\u{200C}|\u{200D}|\u{2060}|\u{FEFF}/gu

// Bring both sides of the match to the same shape so ligatures
// (ﬁ ↔ fi), fullwidth digits, accented characters in the PDF font's
// internal encoding, etc. don't break exact-substring search.
function normalize(raw: string): string {
  return raw
    .normalize('NFKC')
    .toLowerCase()
    .replace(INVISIBLE, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function collectSpanIndex(container: HTMLElement): {
  spans: SpanIndex[]
  concatenated: string
} {
  const spans: SpanIndex[] = []
  let cursor = 0
  let concatenated = ''
  for (const el of container.querySelectorAll<HTMLElement>('span')) {
    const text = el.textContent ?? ''
    const trimmed = normalize(text)
    if (!trimmed.length) continue
    spans.push({ el, start: cursor, end: cursor + trimmed.length })
    concatenated += trimmed + SEPARATOR
    cursor += trimmed.length + SEPARATOR.length
  }
  return { spans, concatenated }
}

const normalizeQuery = normalize

// Build a parallel position map between `concatenated` and the same
// string with whitespace squashed out. Index i of the squashed string
// maps back to position squashedToConcat[i] in the original. Used so
// that we can match a query whose word ran across span boundaries
// (e.g. pdfjs producing two spans "pem" and "balajaran").
function buildSquashedIndex(concatenated: string): {
  squashed: string
  map: number[]
} {
  const squashed: string[] = []
  const map: number[] = []
  for (let i = 0; i < concatenated.length; i++) {
    const c = concatenated[i]
    if (c && !/\s/.test(c)) {
      squashed.push(c)
      map.push(i)
    }
  }
  return { squashed: squashed.join(''), map }
}

export function findTarget(
  concatenated: string,
  rawQuery: string,
): { start: number; end: number } | null {
  const normalized = normalizeQuery(rawQuery)
  if (!normalized) return null

  const direct = concatenated.indexOf(normalized)
  if (direct >= 0) return { start: direct, end: direct + normalized.length }

  // Excerpts from the analyzer don't always line up exactly with the
  // text layer (line breaks, hyphenation, glyph spacing all drift). Peel
  // words off each end and try the remaining substring — most of the
  // phrase still uniquely identifies the location.
  const words = normalized.split(/\s+/)
  for (let trimL = 0; trimL <= 3 && trimL < words.length; trimL++) {
    for (let trimR = 0; trimR + trimL < words.length && trimR <= 3; trimR++) {
      if (trimL === 0 && trimR === 0) continue
      const slice = words.slice(trimL, words.length - trimR).join(' ')
      if (slice.length < 8) continue
      const i = concatenated.indexOf(slice)
      if (i >= 0) return { start: i, end: i + slice.length }
    }
  }

  const longest = normalized
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 3)
    .toSorted((a, b) => b.length - a.length)

  for (const word of longest) {
    const idx = concatenated.indexOf(word)
    if (idx >= 0) return { start: idx, end: idx + word.length }
  }

  // pdfjs sometimes splits a single word across spans, so the
  // concatenated text contains whitespace mid-word. Search again with
  // all whitespace stripped, then map the position back.
  const queryNoSpace = normalized.replace(/\s+/g, '')
  if (queryNoSpace.length >= 4) {
    const { squashed, map } = buildSquashedIndex(concatenated)
    const idx = squashed.indexOf(queryNoSpace)
    if (idx >= 0) {
      const start = map[idx]
      const endMap = map[idx + queryNoSpace.length - 1]
      if (start !== undefined && endMap !== undefined) {
        return { start, end: endMap + 1 }
      }
    }
    for (const word of longest) {
      const wordNoSpace = word.replace(/\s+/g, '')
      if (wordNoSpace.length < 4) continue
      const i = squashed.indexOf(wordNoSpace)
      if (i >= 0) {
        const start = map[i]
        const endMap = map[i + wordNoSpace.length - 1]
        if (start !== undefined && endMap !== undefined) {
          return { start, end: endMap + 1 }
        }
      }
    }
  }

  return null
}

function scrollIntoCenter(target: HTMLElement, scrollTarget: HTMLElement): void {
  const spanRect = target.getBoundingClientRect()
  const containerRect = scrollTarget.getBoundingClientRect()
  const delta = spanRect.top - containerRect.top - 80
  scrollTarget.scrollTop = Math.max(0, scrollTarget.scrollTop + delta)
}

export function applyHighlight(
  container: HTMLElement,
  query: string,
  scrollTarget: HTMLElement | null,
): void {
  for (const el of container.querySelectorAll(
    '.citetrack-highlight, .citetrack-highlight-active',
  )) {
    el.classList.remove('citetrack-highlight', 'citetrack-highlight-active')
  }

  if (!query.trim()) return

  const { spans, concatenated } = collectSpanIndex(container)
  if (!spans.length) return

  const match = findTarget(concatenated, query)
  if (!match) return

  let firstMatch: HTMLElement | null = null
  for (const span of spans) {
    if (span.end <= match.start || span.start >= match.end) continue
    span.el.classList.add('citetrack-highlight')
    if (!firstMatch) firstMatch = span.el
  }

  if (firstMatch && scrollTarget) {
    scrollIntoCenter(firstMatch, scrollTarget)
  }
}

function findAllMatches(concatenated: string, normalized: string): Array<{
  start: number
  end: number
}> {
  const matches: Array<{ start: number; end: number }> = []
  if (!normalized) return matches

  // Direct substring pass — fast path for the common case where the
  // word lives in one span (or pdfjs joined it whole).
  let from = 0
  while (from < concatenated.length) {
    const idx = concatenated.indexOf(normalized, from)
    if (idx < 0) break
    matches.push({ start: idx, end: idx + normalized.length })
    from = idx + Math.max(1, normalized.length)
  }
  if (matches.length > 0) return matches

  // Fragmented-span fallback. pdfjs sometimes emits a single word as
  // multiple positioned spans (e.g. "pem" + "balajaran"); after the
  // collectSpanIndex joiner that becomes "pem balajaran" in the
  // concatenated string and direct indexOf misses. Strip every space
  // from both sides, search again, and map each hit back to a span
  // range via the position map.
  const queryNoSpace = normalized.replace(/\s+/g, '')
  if (queryNoSpace.length < 4) return matches
  const { squashed, map } = buildSquashedIndex(concatenated)
  let fromS = 0
  while (fromS < squashed.length) {
    const i = squashed.indexOf(queryNoSpace, fromS)
    if (i < 0) break
    const start = map[i]
    const endMap = map[i + queryNoSpace.length - 1]
    if (start !== undefined && endMap !== undefined) {
      matches.push({ start, end: endMap + 1 })
    }
    fromS = i + Math.max(1, queryNoSpace.length)
  }
  return matches
}

export interface SearchHighlightResult {
  occurrenceCount: number
  activeFound: boolean
}

export function applySearchHighlights(
  container: HTMLElement,
  query: string,
  activeOccurrence: number,
  scrollTarget: HTMLElement | null,
): SearchHighlightResult {
  for (const el of container.querySelectorAll(
    '.citetrack-highlight, .citetrack-highlight-active',
  )) {
    el.classList.remove('citetrack-highlight', 'citetrack-highlight-active')
  }

  const normalized = normalizeQuery(query)
  if (!normalized) return { occurrenceCount: 0, activeFound: false }

  const { spans, concatenated } = collectSpanIndex(container)
  if (!spans.length) return { occurrenceCount: 0, activeFound: false }

  const ranges = findAllMatches(concatenated, normalized)
  if (ranges.length === 0) return { occurrenceCount: 0, activeFound: false }

  let activeFound = false
  let activeAnchor: HTMLElement | null = null
  const activeIdx = Math.min(Math.max(0, activeOccurrence), ranges.length - 1)

  for (const [rangeIdx, range] of ranges.entries()) {
    const isActive = rangeIdx === activeIdx
    for (const span of spans) {
      if (span.end <= range.start || span.start >= range.end) continue
      span.el.classList.add('citetrack-highlight')
      if (isActive) {
        span.el.classList.add('citetrack-highlight-active')
        activeFound = true
        if (!activeAnchor) activeAnchor = span.el
      }
    }
  }

  if (activeAnchor && scrollTarget) {
    scrollIntoCenter(activeAnchor, scrollTarget)
  }

  return { occurrenceCount: ranges.length, activeFound }
}

export function inferStatus(err: unknown): ViewerStatus {
  const e = err as PdfJsErrorShape
  if (e?.name === 'PasswordException') return 'password'
  if (e?.status === 404 || e?.name === 'MissingPDFException') return 'not-found'
  return 'error'
}
