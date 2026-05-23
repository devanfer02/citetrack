type PdfRange = [number, number]

interface ExtractedPage {
  pageNumber: number
  content: string
  charCount: number
  lowTextDensity: boolean
  codeRanges: PdfRange[]
  italicRanges: PdfRange[]
}

interface ExtractionResult {
  totalPages: number
  pages: ExtractedPage[]
  scannedWarning: boolean
}

interface AnalyzedPage {
  pageNumber: number
  content: string
  codeRanges: PdfRange[]
  italicRanges: PdfRange[]
}

interface FindPdfOptions {
  doi: string | null
  title: string
  author: string
}

type ViewerStatus = 'loading' | 'ready' | 'not-found' | 'error' | 'password'

interface PdfJsErrorShape {
  name?: string
  message?: string
  status?: number
}
