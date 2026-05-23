import { getDocument, type PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs'

const LOW_TEXT_DENSITY_THRESHOLD = 50

export async function extractPdfText(
  data: Uint8Array,
): Promise<ExtractionResult> {
  const doc: PDFDocumentProxy = await getDocument({ data }).promise
  const totalPages = doc.numPages
  const pages: ExtractedPage[] = []
  let lowDensityCount = 0

  for (let i = 1; i <= totalPages; i++) {
    const page = await doc.getPage(i)
    const textContent = await page.getTextContent()
    const content = textContent.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()

    const charCount = content.length
    const lowTextDensity = charCount < LOW_TEXT_DENSITY_THRESHOLD

    if (lowTextDensity) lowDensityCount++

    pages.push({ pageNumber: i, content, charCount, lowTextDensity })
  }

  await doc.destroy()

  const scannedWarning = lowDensityCount > totalPages * 0.5

  return { totalPages, pages, scannedWarning }
}
