import { getDocument, type PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs'

const LOW_TEXT_DENSITY_THRESHOLD = 50

export async function extractPdfText(
  data: Uint8Array,
): Promise<ExtractionResult> {
  const doc: PDFDocumentProxy = await getDocument({ data }).promise
  const totalPages = doc.numPages

  const pages = await Promise.all(
    Array.from({ length: totalPages }, (_, idx) => extractPage(doc, idx + 1)),
  )

  await doc.destroy()

  const lowDensityCount = pages.reduce(
    (count, page) => count + (page.lowTextDensity ? 1 : 0),
    0,
  )
  const scannedWarning = lowDensityCount > totalPages * 0.5

  return { totalPages, pages, scannedWarning }
}

async function extractPage(
  doc: PDFDocumentProxy,
  pageNumber: number,
): Promise<ExtractedPage> {
  const page = await doc.getPage(pageNumber)
  const textContent = await page.getTextContent()
  const content = textContent.items
    .map((item) => {
      if (!('str' in item)) return ''
      const eol = 'hasEOL' in item && item.hasEOL
      return item.str + (eol ? '\n' : ' ')
    })
    .join('')
    .replace(/[ \t]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  const charCount = content.length
  const lowTextDensity = charCount < LOW_TEXT_DENSITY_THRESHOLD

  return { pageNumber, content, charCount, lowTextDensity }
}
