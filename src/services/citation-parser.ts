const AUTHOR = `[A-Z][a-zA-Zà-öø-ÿÀ-ÖØ-Ý'\\-]+`
const YEAR = `\\d{4}[a-z]?`
const ET_AL = `(?:\\s+(?:et\\s+al\\.?|dkk\\.?))`
const AND = `(?:\\s*(?:&|and|dan)\\s*${AUTHOR})*`
const PAGE = `(?:,\\s*(?:p\\.|pp\\.|hlm\\.|hal\\.)\\s*[\\d\\-–]+)?`
const MULTI_SEP = `(?:\\s*;\\s*)`

// Parenthetical: (Author, Year), (Author & Author, Year), (Author et al., Year)
// Bahasa: (dalam Author, Year), (dikutip dari Author, Year), (dalam Author & Author, Year)
// Multi-citation: (Author, Year; Author, Year)
// Page-specific: (Author, Year, p. 42), (Author, Year, hlm. 42)
const PAREN_SINGLE = `(?:(?:dalam|dikutip\\s+dari|dalam\\s+penelitian|lihat|see|in)\\s+)?${AUTHOR}${ET_AL}?${AND}(?:,\\s*${YEAR})${PAGE}`
const PARENTHETICAL_RE = new RegExp(
  `\\(\\s*(${PAREN_SINGLE}(?:${MULTI_SEP}${PAREN_SINGLE})*)\\s*\\)`,
  'g',
)

// Narrative: Author (Year), Author et al. (Year), Author & Author (Year)
// Bahasa: Menurut Author (Year), Menurut Author et al. (Year)
const NARRATIVE_PREFIX = `(?:(?:[Mm]enurut|[Bb]erdasarkan|[Ss]ebagaimana|[Aa]ccording\\s+to)\\s+)?`
const NARRATIVE_RE = new RegExp(
  `${NARRATIVE_PREFIX}(${AUTHOR}${ET_AL}?${AND})\\s+\\((${YEAR}${PAGE})\\)`,
  'g',
)

function normalizeCitationKey(author: string, year: string): string {
  const cleanAuthor = author
    .replace(/\s+(?:et\s+al\.?|dkk\.?)/i, ' et al.')
    .replace(/\s*(?:&|and|dan)\s*/g, ' & ')
    .trim()
  const cleanYear = year.replace(/[,\s].*/g, '').trim()
  return `${cleanAuthor}, ${cleanYear}`
}

function extractContext(
  text: string,
  matchStart: number,
  matchEnd: number,
): string {
  const CONTEXT_CHARS = 150
  const start = Math.max(0, matchStart - CONTEXT_CHARS)
  const end = Math.min(text.length, matchEnd + CONTEXT_CHARS)

  let contextStart = start
  if (start > 0) {
    const sentenceStart = text.lastIndexOf('. ', matchStart)
    if (sentenceStart > start) contextStart = sentenceStart + 2
  }

  let contextEnd = end
  const sentenceEnd = text.indexOf('. ', matchEnd)
  if (sentenceEnd !== -1 && sentenceEnd < end) contextEnd = sentenceEnd + 1

  return text.slice(contextStart, contextEnd).trim()
}

function splitMultiCitation(raw: string): { author: string; year: string }[] {
  const parts = raw.split(/\s*;\s*/)
  const results: { author: string; year: string }[] = []

  for (const part of parts) {
    const match = part.match(
      new RegExp(
        `(?:(?:dalam|dikutip\\s+dari|dalam\\s+penelitian|lihat|see|in)\\s+)?(${AUTHOR}${ET_AL}?${AND}),\\s*(${YEAR})`,
      ),
    )
    if (match) {
      results.push({ author: match[1], year: match[2] })
    }
  }

  return results
}

export function parseCitations(
  pageText: string,
  pageNumber: number,
): CitationMatch[] {
  const matches: CitationMatch[] = []
  const seen = new Set<string>()

  // Parenthetical citations
  let match: RegExpExecArray | null
  PARENTHETICAL_RE.lastIndex = 0
  while ((match = PARENTHETICAL_RE.exec(pageText)) !== null) {
    const rawMatch = match[0]
    const inner = match[1]
    const context = extractContext(
      pageText,
      match.index,
      match.index + rawMatch.length,
    )

    const citations = splitMultiCitation(inner)
    for (const { author, year } of citations) {
      const citationKey = normalizeCitationKey(author, year)
      const dedupeKey = `${citationKey}:${pageNumber}:${match.index}`
      if (seen.has(dedupeKey)) continue
      seen.add(dedupeKey)
      matches.push({ citationKey, thesisPage: pageNumber, thesisContext: context, rawMatch })
    }
  }

  // Narrative citations
  NARRATIVE_RE.lastIndex = 0
  while ((match = NARRATIVE_RE.exec(pageText)) !== null) {
    const rawMatch = match[0]
    const author = match[1]
    const yearPart = match[2]
    const year = yearPart.replace(/[,\s].*/g, '').trim()
    const citationKey = normalizeCitationKey(author, year)
    const dedupeKey = `${citationKey}:${pageNumber}:${match.index}`
    if (seen.has(dedupeKey)) continue
    seen.add(dedupeKey)

    const context = extractContext(
      pageText,
      match.index,
      match.index + rawMatch.length,
    )
    matches.push({ citationKey, thesisPage: pageNumber, thesisContext: context, rawMatch })
  }

  return matches
}

export function parseCitationsFromPages(
  pages: { pageNumber: number; content: string }[],
): CitationMatch[] {
  return pages.flatMap((page) => parseCitations(page.content, page.pageNumber))
}

export function groupCitations(matches: CitationMatch[]): GroupedCitation[] {
  const groups = new Map<string, Omit<CitationMatch, 'citationKey'>[]>()

  for (const { citationKey, ...rest } of matches) {
    const existing = groups.get(citationKey) ?? []
    existing.push(rest)
    groups.set(citationKey, existing)
  }

  return Array.from(groups.entries())
    .map(([citationKey, occurrences]) => ({
      citationKey,
      occurrences,
      count: occurrences.length,
    }))
    .toSorted((a, b) => b.count - a.count)
}
