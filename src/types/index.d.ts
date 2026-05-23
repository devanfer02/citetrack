// PDF Extraction
interface ExtractedPage {
  pageNumber: number
  content: string
  charCount: number
  lowTextDensity: boolean
}

interface ExtractionResult {
  totalPages: number
  pages: ExtractedPage[]
  scannedWarning: boolean
}

// Citation Parsing
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

// Reference Parsing
interface ParsedReference {
  author: string
  year: string
  title: string
  doi: string | null
  url: string | null
  publisher: string | null
  journal: string | null
  rawText: string
  startPage: number | null
}

interface ReferenceSection {
  startPage: number
  text: string
}

// Citation ↔ Reference Matching
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

// PDF Finder
interface FindPdfOptions {
  doi: string | null
  title: string
  author: string
}

// Passage Matching
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

// Source PDF Fetching
interface SourceFetchResult {
  referenceId: number
  author: string
  title: string
  status: 'done' | 'failed'
  pdfUrl: string | null
  fetchSource: string | null
  totalPages: number | null
  error: string | null
}

// Upload Pipeline
interface CitationData {
  totalCitations: number
  uniqueCitations: number
  citations: GroupedCitation[]
}

interface ReferenceData {
  totalReferences: number
  references: ParsedReference[]
}

type PipelinePhase =
  | 'upload'
  | 'parsing-citations'
  | 'review-citations'
  | 'parsing-references'
  | 'review-references'
  | 'matching'
  | 'review-matches'
  | 'fetching-sources'
  | 'review-sources'
  | 'matching-passages'
  | 'review-passages'
  | 'error'

type PipelineStep =
  | { phase: 'upload' }
  | { phase: 'parsing-citations'; jobId: string }
  | {
      phase: 'review-citations'
      jobId: string
      totalCitations: number
      uniqueCitations: number
      citations: GroupedCitation[]
    }
  | { phase: 'parsing-references'; jobId: string; citationData: CitationData }
  | {
      phase: 'review-references'
      jobId: string
      citationData: CitationData
      totalReferences: number
      references: ParsedReference[]
    }
  | {
      phase: 'matching'
      jobId: string
      citationData: CitationData
      referenceData: ReferenceData
    }
  | {
      phase: 'review-matches'
      jobId: string
      citationData: CitationData
      referenceData: ReferenceData
      matchSummary: MatchSummary
    }
  | {
      phase: 'fetching-sources'
      jobId: string
      matchSummary: MatchSummary
    }
  | {
      phase: 'review-sources'
      jobId: string
      matchSummary: MatchSummary
      sourceResults: SourceFetchResult[]
      found: number
      failed: number
      total: number
    }
  | {
      phase: 'matching-passages'
      jobId: string
      matcherStrategy: 'api' | 'agent'
    }
  | {
      phase: 'review-passages'
      jobId: string
      passageResults: PassageResult[]
      matched: number
      noSource: number
      noMatch: number
      total: number
      avgConfidence: number
      matcherStrategy: 'api' | 'agent'
    }
  | { phase: 'error'; jobId: string; message: string }

// Results Dashboard
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
