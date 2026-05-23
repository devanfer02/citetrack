interface CitationMatch {
  citationKey: string
  thesisPage: number
  thesisContext: string
  rawMatch: string
}

interface GroupedCitation {
  citationKey: string
  occurrences: Omit<CitationMatch, 'citationKey'>[]
  count: number
}
