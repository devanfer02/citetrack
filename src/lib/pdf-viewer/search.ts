import type { PDFDocumentProxy } from './index'

export interface SearchOccurrence {
  pageNumber: number
  // 0-based index of this occurrence within the page
  occurrenceOnPage: number
}

const normalize = (raw: string): string =>
  raw.toLowerCase().replace(/\s+/g, ' ').trim()

async function extractPageText(
  document: PDFDocumentProxy,
  pageNumber: number,
): Promise<string> {
  const page = await document.getPage(pageNumber)
  try {
    const text = await page.getTextContent()
    return text.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim()
  } finally {
    page.cleanup()
  }
}

export type PageTextIndex = Map<number, string>

export async function buildPageTextIndex(
  document: PDFDocumentProxy,
  signal?: AbortSignal,
): Promise<PageTextIndex> {
  const index: PageTextIndex = new Map()
  for (let n = 1; n <= document.numPages; n++) {
    if (signal?.aborted) throw new DOMException('aborted', 'AbortError')
    const text = await extractPageText(document, n)
    index.set(n, text)
  }
  return index
}

export function searchIndex(
  index: PageTextIndex,
  rawQuery: string,
): SearchOccurrence[] {
  const query = normalize(rawQuery)
  if (!query) return []

  const matches: SearchOccurrence[] = []
  for (const [pageNumber, text] of index) {
    let from = 0
    let occurrenceOnPage = 0
    while (from < text.length) {
      const idx = text.indexOf(query, from)
      if (idx < 0) break
      matches.push({ pageNumber, occurrenceOnPage })
      occurrenceOnPage++
      from = idx + Math.max(1, query.length)
    }
  }
  return matches
}
