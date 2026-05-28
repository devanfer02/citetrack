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
  upload: 'Unggah skripsi',
  'parsing-citations': 'Membaca sitasi…',
  'review-citations': 'Tinjau sitasi',
  'parsing-references': 'Membaca daftar pustaka…',
  'review-references': 'Tinjau daftar pustaka',
  matching: 'Mencocokkan sitasi ke daftar pustaka…',
  'review-matches': 'Hasil pencocokan sitasi',
  'upload-sources': 'Unggah PDF sumber',
  'matching-passages': 'Mencari kalimat sumber…',
  'review-passages': 'Hasil jejak sitasi',
  error: 'Ada yang gagal',
}

export const LOADING_MESSAGES: Partial<Record<PipelinePhase, string>> = {
  'parsing-citations': 'Menyusuri sitasi di setiap halaman…',
  'parsing-references': 'Mengurai daftar pustaka…',
  matching: 'Mencocokkan setiap sitasi ke entri daftar pustaka…',
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
