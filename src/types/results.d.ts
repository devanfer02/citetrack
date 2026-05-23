interface CitationTraceRow {
  citationKey: string
  thesisPage: number
  thesisContext: string
  referenceTitle: string | null
  referenceAuthor: string | null
  matchType: string | null
  matchConfidence: number | null
  sourcePage: number | null
  matchedPassage: string | null
  passageConfidence: number | null
  reasoning: string | null
  sourceStatus: string | null
  status: 'verified' | 'needs-review' | 'no-source' | 'not-found'
}

interface ResultsSummary {
  jobId: string
  filename: string
  totalCitations: number
  uniqueCitations: number
  matched: number
  passagesFound: number
  avgConfidence: number
  traces: CitationTraceRow[]
}

type SortKey = 'thesisPage' | 'confidence' | 'status'
type StatusFilter =
  | 'all'
  | 'verified'
  | 'needs-review'
  | 'no-source'
  | 'not-found'
