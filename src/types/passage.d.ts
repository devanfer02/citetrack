interface SourcePage {
  pageNumber: number
  content: string
}

interface PassageMatchInput {
  citationKey: string
  thesisContext: string
  sourcePages: SourcePage[]
}

interface PassageMatchResult {
  citationKey: string
  sourcePage: number
  matchedPassage: string
  confidence: number
  reasoning: string
}

interface PassageResult {
  citationKey: string
  thesisContext: string
  thesisPage: number
  sourcePage: number | null
  matchedPassage: string | null
  confidence: number
  reasoning: string | null
  status: 'matched' | 'no-source' | 'no-match'
}
