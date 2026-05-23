import { fileURLToPath } from 'node:url'
import {
  getDocument,
  type PDFDocumentProxy,
  type PDFPageProxy,
} from 'pdfjs-dist/legacy/build/pdf.mjs'

const LOW_TEXT_DENSITY_THRESHOLD = 50
const ITALIC_NAME_RE = /italic|oblique|ital\b/i
const MONO_NAME_RE = /mono|courier|consolas|menlo|fixed/i
const PUNCT_LEADING = ',.;:!?)]}'

const STANDARD_FONT_DATA_URL = fileURLToPath(
  new URL('../../../node_modules/pdfjs-dist/standard_fonts/', import.meta.url),
)

type FontMeta = { isItalic: boolean; isMono: boolean }
type ItemMeta = {
  start: number
  end: number
  isItalic: boolean
  isMono: boolean
}

export async function extractPdfText(
  data: Uint8Array,
): Promise<ExtractionResult> {
  const doc: PDFDocumentProxy = await getDocument({
    data,
    standardFontDataUrl: STANDARD_FONT_DATA_URL,
  }).promise
  const totalPages = doc.numPages

  const pages: ExtractedPage[] = []
  for (let i = 1; i <= totalPages; i++) {
    pages.push(await extractPage(doc, i))
  }

  await doc.destroy()

  const lowDensityCount = pages.reduce(
    (count, page) => count + (page.lowTextDensity ? 1 : 0),
    0,
  )
  const scannedWarning = lowDensityCount > totalPages * 0.5

  return { totalPages, pages, scannedWarning }
}

const resolveFontMeta = (
  fontName: string,
  styles: Record<string, { fontFamily?: string } | undefined>,
  page: PDFPageProxy,
  cache: Map<string, FontMeta>,
): FontMeta => {
  const cached = cache.get(fontName)
  if (cached) return cached

  const style = styles[fontName]
  const fontFamily = style?.fontFamily ?? ''

  let isItalic = ITALIC_NAME_RE.test(fontName)
  let isMono = fontFamily === 'monospace' || MONO_NAME_RE.test(fontName)

  try {
    const fontObj = page.commonObjs.get(fontName) as
      | {
          italic?: boolean
          bold?: boolean
          name?: string
          isMonospace?: boolean
        }
      | null
      | undefined
    if (fontObj) {
      if (fontObj.italic === true) isItalic = true
      if (fontObj.isMonospace === true) isMono = true
      const realName = fontObj.name ?? ''
      if (ITALIC_NAME_RE.test(realName)) isItalic = true
      if (MONO_NAME_RE.test(realName)) isMono = true
    }
  } catch {
    // commonObjs may throw if not yet resolved; fall back to name/style signals
  }

  const meta: FontMeta = { isItalic, isMono }
  cache.set(fontName, meta)
  return meta
}

const mergeRanges = (
  metas: ItemMeta[],
  predicate: (m: ItemMeta) => boolean,
): PdfRange[] => {
  const ranges: PdfRange[] = []
  let cur: PdfRange | null = null
  for (const m of metas) {
    if (m.end <= m.start) continue
    if (predicate(m)) {
      if (cur && m.start <= cur[1] + 2) {
        cur[1] = m.end
      } else {
        if (cur) ranges.push(cur)
        cur = [m.start, m.end]
      }
    } else if (cur) {
      ranges.push(cur)
      cur = null
    }
  }
  if (cur) ranges.push(cur)
  return ranges
}

async function extractPage(
  doc: PDFDocumentProxy,
  pageNumber: number,
): Promise<ExtractedPage> {
  const page = await doc.getPage(pageNumber)
  try {
    await page.getOperatorList()
  } catch {
    // operator list may fail on malformed pages; proceed anyway
  }
  const textContent = await page.getTextContent()
  const styles = textContent.styles as Record<
    string,
    { fontFamily?: string } | undefined
  >
  const fontCache = new Map<string, FontMeta>()

  let buffer = ''
  let lastWasSpace = true
  let pendingSpace = false
  const metas: ItemMeta[] = []

  const firstNonSpace = (str: string): string => {
    for (const ch of str) {
      if (ch !== ' ' && ch !== '\t' && ch !== '\n' && ch !== '\r') return ch
    }
    return ''
  }

  for (const item of textContent.items) {
    if (!('str' in item)) continue
    const str = item.str
    const hasEOL = 'hasEOL' in item && item.hasEOL === true

    const fontName =
      'fontName' in item && typeof item.fontName === 'string'
        ? item.fontName
        : ''
    const meta = fontName
      ? resolveFontMeta(fontName, styles, page, fontCache)
      : { isItalic: false, isMono: false }

    const leading = firstNonSpace(str)
    const leadingIsPunct = leading !== '' && PUNCT_LEADING.includes(leading)

    if (pendingSpace && !leadingIsPunct && buffer.length > 0) {
      buffer += ' '
      lastWasSpace = true
    }
    pendingSpace = false

    const start = buffer.length
    let wroteNonSpace = false
    for (const ch of str) {
      if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
        if (lastWasSpace) continue
        buffer += ' '
        lastWasSpace = true
      } else {
        buffer += ch
        lastWasSpace = false
        wroteNonSpace = true
      }
    }

    if (hasEOL && !lastWasSpace) {
      buffer += ' '
      lastWasSpace = true
    } else if (wroteNonSpace && !lastWasSpace) {
      pendingSpace = true
    }

    const end = buffer.length
    metas.push({ start, end, isItalic: meta.isItalic, isMono: meta.isMono })
  }

  page.cleanup()

  const content = buffer.trimEnd().replace(/ \n/g, '\n').replace(/\n +/g, '\n')
  const deltaEnd = content.length

  const codeRanges = clampRanges(
    mergeRanges(metas, (m) => m.isMono),
    deltaEnd,
  )
  const italicRanges = clampRanges(
    mergeRanges(metas, (m) => m.isItalic && !m.isMono),
    deltaEnd,
  )

  const charCount = content.length
  const lowTextDensity = charCount < LOW_TEXT_DENSITY_THRESHOLD

  return {
    pageNumber,
    content,
    charCount,
    lowTextDensity,
    codeRanges,
    italicRanges,
  }
}

const clampRanges = (ranges: PdfRange[], max: number): PdfRange[] => {
  const out: PdfRange[] = []
  for (const [s, e] of ranges) {
    const start = Math.max(0, Math.min(s, max))
    const end = Math.max(0, Math.min(e, max))
    if (end > start) out.push([start, end])
  }
  return out
}
