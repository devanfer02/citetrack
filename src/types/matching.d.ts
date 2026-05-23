interface MatchResult {
  citationKey: string
  referenceId: number | null
  referenceTitle: string | null
  confidence: number
  matchType: 'exact' | 'fuzzy' | 'unmatched'
}

interface MatchSummary {
  matches: MatchResult[]
  orphanCitations: string[]
  unusedReferences: { id: number; author: string; year: string; title: string }[]
}
