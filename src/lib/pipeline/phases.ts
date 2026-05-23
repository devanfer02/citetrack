export const PIPELINE_PHASES = [
  'upload',
  'parsing-citations',
  'review-citations',
  'parsing-references',
  'review-references',
  'matching',
  'review-matches',
  'upload-sources',
  'matching-passages',
  'review-passages',
  'error',
] as const satisfies readonly PipelinePhase[]

export const PHASE_STEP: Record<PipelinePhase, number> = {
  upload: 1,
  'parsing-citations': 2,
  'review-citations': 2,
  'parsing-references': 3,
  'review-references': 3,
  matching: 4,
  'review-matches': 4,
  'upload-sources': 5,
  'matching-passages': 6,
  'review-passages': 6,
  error: 0,
}

export const PHASE_LABEL: Record<PipelinePhase, string> = {
  upload: 'Upload Your Thesis',
  'parsing-citations': 'Parsing Citations...',
  'review-citations': 'Review Citations',
  'parsing-references': 'Parsing References...',
  'review-references': 'Review References',
  matching: 'Matching Citations to References...',
  'review-matches': 'Citation Matching Results',
  'upload-sources': 'Upload Reference PDFs',
  'matching-passages': 'Finding Passages...',
  'review-passages': 'Citation Trace Results',
  error: 'Error',
}

export const LOADING_MESSAGES: Partial<Record<PipelinePhase, string>> = {
  'parsing-citations': 'Scanning for in-text citations...',
  'parsing-references': 'Detecting and parsing Daftar Pustaka...',
  matching: 'Matching citations to reference entries...',
}

export const PREVIOUS_PHASE: Partial<Record<PipelinePhase, PipelinePhase>> = {
  'review-references': 'review-citations',
  'review-matches': 'review-references',
  'upload-sources': 'review-matches',
  'review-passages': 'upload-sources',
}

export const REVIEW_PHASES = [
  'review-citations',
  'review-references',
  'review-matches',
  'upload-sources',
  'review-passages',
] as const satisfies readonly PipelinePhase[]

export type ReviewPhase = (typeof REVIEW_PHASES)[number]

export const STEP_TO_PHASE: Record<number, ReviewPhase | 'upload'> = {
  1: 'upload',
  2: 'review-citations',
  3: 'review-references',
  4: 'review-matches',
  5: 'upload-sources',
  6: 'review-passages',
}
