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
