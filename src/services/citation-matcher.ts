export interface MatchResult {
  citationKey: string
  referenceId: number | null
  referenceTitle: string | null
  confidence: number
  matchType: 'exact' | 'fuzzy' | 'unmatched'
}

export interface MatchSummary {
  matches: MatchResult[]
  orphanCitations: string[]
  unusedReferences: { id: number; author: string; year: string; title: string }[]
}

interface RefEntry {
  id: number
  author: string
  year: string
  title: string
}

function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[''`]/g, "'")
    .replace(/[-–—]/g, '-')
    .trim()
}

function extractSurname(citationKey: string): string {
  // "Smith & Johnson, 2020" → "smith"
  // "Williams et al., 2020" → "williams"
  const authorPart = citationKey.replace(/,\s*\d{4}.*$/, '').trim()
  const first = authorPart.split(/\s*(?:&|et\s+al\.?)\s*/)[0]
  return normalize(first)
}

function extractYear(citationKey: string): string {
  const match = citationKey.match(/(\d{4})/)
  return match ? match[1] : ''
}

function extractRefSurnames(author: string): string[] {
  // "Creswell, J. W." → ["creswell"]
  // "Smith, J. A., & Johnson, B." → ["smith", "johnson"]
  // "Williams, R., Brown, T., & Davis, M." → ["williams", "brown", "davis"]
  const parts = author.split(/\s*(?:,\s*&|&|\band\b|\bdan\b)\s*/)
  return parts
    .map((p) => {
      const surname = p.split(',')[0].trim()
      return normalize(surname)
    })
    .filter((s) => s.length > 1)
}

function levenshtein(a: string, b: string): number {
  const m = a.length
  const n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    Array(n + 1).fill(0),
  )

  for (let i = 0; i <= m; i++) dp[i][0] = i
  for (let j = 0; j <= n; j++) dp[0][j] = j

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
    }
  }
  return dp[m][n]
}

function surnameMatch(
  citeSurname: string,
  refSurnames: string[],
): { matched: boolean; distance: number } {
  let bestDistance = Infinity

  for (const refSurname of refSurnames) {
    if (citeSurname === refSurname) return { matched: true, distance: 0 }

    // Check if one starts with the other (abbreviated)
    if (
      citeSurname.startsWith(refSurname) ||
      refSurname.startsWith(citeSurname)
    ) {
      return { matched: true, distance: 0 }
    }

    const dist = levenshtein(citeSurname, refSurname)
    if (dist < bestDistance) bestDistance = dist
  }

  // Allow fuzzy match for short edit distances
  const threshold = Math.max(1, Math.floor(citeSurname.length * 0.3))
  return { matched: bestDistance <= threshold, distance: bestDistance }
}

function matchCitationToReference(
  citationKey: string,
  refs: RefEntry[],
): { ref: RefEntry; confidence: number; matchType: 'exact' | 'fuzzy' } | null {
  const citeSurname = extractSurname(citationKey)
  const citeYear = extractYear(citationKey)
  const isEtAl = /et\s+al\./i.test(citationKey)

  let bestMatch: {
    ref: RefEntry
    confidence: number
    matchType: 'exact' | 'fuzzy'
  } | null = null

  for (const ref of refs) {
    // Year must match
    if (ref.year !== citeYear) continue

    const refSurnames = extractRefSurnames(ref.author)
    const { matched, distance } = surnameMatch(citeSurname, refSurnames)

    if (!matched) continue

    // Calculate confidence
    let confidence = 1.0

    // Penalize for edit distance
    if (distance > 0) {
      confidence -= distance * 0.15
    }

    // Bonus for et al. matching multi-author reference
    if (isEtAl && refSurnames.length >= 3) {
      confidence = Math.min(1.0, confidence + 0.05)
    }

    // Penalize et al. matching single author (less likely correct)
    if (isEtAl && refSurnames.length === 1) {
      confidence -= 0.2
    }

    const matchType = distance === 0 ? 'exact' : 'fuzzy'
    confidence = Math.max(0, Math.min(1.0, confidence))

    if (!bestMatch || confidence > bestMatch.confidence) {
      bestMatch = { ref, confidence, matchType }
    }
  }

  return bestMatch
}

export function matchCitations(
  citationKeys: string[],
  refs: RefEntry[],
): MatchSummary {
  const uniqueKeys = [...new Set(citationKeys)]
  const matchedRefIds = new Set<number>()
  const matches: MatchResult[] = []

  for (const key of uniqueKeys) {
    const result = matchCitationToReference(key, refs)

    if (result) {
      matchedRefIds.add(result.ref.id)
      matches.push({
        citationKey: key,
        referenceId: result.ref.id,
        referenceTitle: result.ref.title,
        confidence: Math.round(result.confidence * 100) / 100,
        matchType: result.matchType,
      })
    } else {
      matches.push({
        citationKey: key,
        referenceId: null,
        referenceTitle: null,
        confidence: 0,
        matchType: 'unmatched',
      })
    }
  }

  const orphanCitations = matches
    .filter((m) => m.matchType === 'unmatched')
    .map((m) => m.citationKey)

  const unusedReferences = refs
    .filter((r) => !matchedRefIds.has(r.id))
    .map((r) => ({ id: r.id, author: r.author, year: r.year, title: r.title }))

  return { matches, orphanCitations, unusedReferences }
}
