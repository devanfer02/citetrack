const MAX_CANDIDATE_PAGES = 10

export function extractKeywords(text: string): string[] {
  const words = text.split(/\s+/)
  const keywords: string[] = []

  for (const word of words) {
    const clean = word.replace(/[.,;:!?()"']/g, '')
    if (!clean) continue

    if (/^[A-Z][a-z]+/.test(clean) && clean.length > 2) {
      keywords.push(clean.toLowerCase())
    }

    if (/\d{2,}/.test(clean)) {
      keywords.push(clean)
    }

    if (/^[A-Z]{2,}$/.test(clean)) {
      keywords.push(clean.toLowerCase())
    }
  }

  return [...new Set(keywords)]
}

export function scorePageRelevance(
  keywords: string[],
  pageContent: string,
): number {
  if (keywords.length === 0) return 0
  const lower = pageContent.toLowerCase()
  let hits = 0
  for (const kw of keywords) {
    if (lower.includes(kw)) hits++
  }
  return hits / keywords.length
}

export function preFilterPages(
  thesisContext: string,
  sourcePages: SourcePage[],
  maxPages: number = MAX_CANDIDATE_PAGES,
): SourcePage[] {
  const keywords = extractKeywords(thesisContext)

  if (keywords.length === 0) {
    return sourcePages.slice(0, maxPages)
  }

  const scored = sourcePages
    .map((p) => ({ page: p, score: scorePageRelevance(keywords, p.content) }))
    .filter((s) => s.score > 0)
    .toSorted((a, b) => b.score - a.score)

  if (scored.length === 0) {
    return sourcePages.slice(0, maxPages)
  }

  return scored.slice(0, maxPages).map((s) => s.page)
}
