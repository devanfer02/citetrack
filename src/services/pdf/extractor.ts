import path from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import {
  getDocument,
  GlobalWorkerOptions,
  VerbosityLevel,
  type PDFDocumentProxy,
  type PDFPageProxy,
} from 'pdfjs-dist/legacy/build/pdf.mjs'

const LOW_TEXT_DENSITY_THRESHOLD = 50
const ITALIC_NAME_RE = /italic|oblique|ital\b/i
const MONO_NAME_RE = /mono|courier|consolas|menlo|fixed/i
const PUNCT_LEADING = ',.;:!?)]}'

// Resolve pdfjs-dist paths via the package itself rather than a relative
// `../../../node_modules` walk, because after Nitro bundles the server the
// source file is no longer at src/services/pdf/extractor.ts — it gets
// flattened into .output/server, and any path computed from `import.meta.url`
// won't reach node_modules. require.resolve walks up correctly from any
// location.
const PDFJS_PKG_DIR = path.dirname(
  createRequire(import.meta.url).resolve('pdfjs-dist/package.json'),
)

// pdfjs sets up a "fake worker" in Node by dynamically importing
// './pdf.worker.mjs' next to itself. When the package is bundled this lookup
// fails with "Setting up fake worker failed". Pinning workerSrc to the real
// file in node_modules sidesteps the dynamic import.
GlobalWorkerOptions.workerSrc = pathToFileURL(
  path.join(PDFJS_PKG_DIR, 'legacy/build/pdf.worker.mjs'),
).href

const STANDARD_FONT_DATA_URL = path.join(PDFJS_PKG_DIR, 'standard_fonts') + '/'

type FontMeta = { isItalic: boolean; isMono: boolean }
type ItemMeta = {
  start: number
  end: number
  fontName: string
  size: number
  nameIsItalic: boolean
  isMono: boolean
}

export async function extractPdfText(
  data: Uint8Array,
): Promise<ExtractionResult> {
  // pdfjs transfers `data` to its worker, which detaches the underlying
  // ArrayBuffer. Callers that need to re-use the buffer (e.g. write it to
  // disk after extracting) would otherwise see "detached ArrayBuffer" errors.
  // .slice() gives pdfjs a copy it can detach without harming the caller.
  const doc: PDFDocumentProxy = await getDocument({
    data: data.slice(),
    standardFontDataUrl: STANDARD_FONT_DATA_URL,
    // Suppress noisy TT (TrueType interpreter) warnings — "undefined function"
    // / "invalid function id" fire on PDFs with non-standard font subsetting
    // and don't actually affect text extraction. Errors still surface.
    verbosity: VerbosityLevel.ERRORS,
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

const firstNonSpace = (str: string): string => {
  for (const ch of str) {
    if (ch !== ' ' && ch !== '\t' && ch !== '\n' && ch !== '\r') return ch
  }
  return ''
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

    const transform =
      'transform' in item && Array.isArray(item.transform)
        ? (item.transform as number[])
        : []
    const rawSize = transform[0] ?? 0
    const size = Math.round(rawSize * 100) / 100

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
    metas.push({
      start,
      end,
      fontName,
      size,
      nameIsItalic: meta.isItalic,
      isMono: meta.isMono,
    })
  }

  page.cleanup()

  const content = buffer.trimEnd().replace(/ \n/g, '\n').replace(/\n +/g, '\n')
  const deltaEnd = content.length

  const heuristicItalicFonts = detectHeuristicItalicFonts(metas)

  const codeRanges = clampRanges(
    mergeRanges(metas, (m) => m.isMono),
    deltaEnd,
  )
  const italicRanges = clampRanges(
    mergeRanges(
      metas,
      (m) =>
        !m.isMono &&
        (m.nameIsItalic || heuristicItalicFonts.has(m.fontName)),
    ),
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

const SIZE_TOLERANCE = 0.05
const MIN_CHARS_FOR_HEURISTIC = 200
const ITALIC_MAX_CHAR_RATIO = 0.5

const detectHeuristicItalicFonts = (metas: ItemMeta[]): Set<string> => {
  const italic = new Set<string>()
  const totalChars = metas.reduce((sum, m) => sum + (m.end - m.start), 0)
  if (totalChars < MIN_CHARS_FOR_HEURISTIC) return italic

  const sizeChars = new Map<number, number>()
  const fontSizeChars = new Map<string, number>()
  for (const m of metas) {
    if (m.isMono) continue
    if (!m.fontName || m.size <= 0) continue
    const chars = m.end - m.start
    if (chars <= 0) continue
    sizeChars.set(m.size, (sizeChars.get(m.size) ?? 0) + chars)
    const key = `${m.fontName}${m.size}`
    fontSizeChars.set(key, (fontSizeChars.get(key) ?? 0) + chars)
  }
  if (!sizeChars.size) return italic

  let bodySize = 0
  let bodySizeChars = 0
  for (const [size, chars] of sizeChars) {
    if (chars > bodySizeChars) {
      bodySize = size
      bodySizeChars = chars
    }
  }
  if (bodySize <= 0) return italic

  let bodyFont = ''
  let bodyFontChars = 0
  for (const [key, chars] of fontSizeChars) {
    const sep = key.indexOf('')
    const size = Number(key.slice(sep + 1))
    if (Math.abs(size - bodySize) / bodySize > SIZE_TOLERANCE) continue
    if (chars > bodyFontChars) {
      bodyFont = key.slice(0, sep)
      bodyFontChars = chars
    }
  }
  if (!bodyFont || bodyFontChars <= 0) return italic

  for (const [key, chars] of fontSizeChars) {
    const sep = key.indexOf('')
    const fontName = key.slice(0, sep)
    if (fontName === bodyFont) continue
    const size = Number(key.slice(sep + 1))
    if (Math.abs(size - bodySize) / bodySize > SIZE_TOLERANCE) continue
    if (chars / bodyFontChars > ITALIC_MAX_CHAR_RATIO) continue
    italic.add(fontName)
  }
  return italic
}

export type ItemMetaForTest = {
  start: number
  end: number
  fontName: string
  size: number
  nameIsItalic: boolean
  isMono: boolean
}

export const detectHeuristicItalicFontsForTest = (
  metas: ItemMetaForTest[],
): Set<string> => detectHeuristicItalicFonts(metas)

const clampRanges = (ranges: PdfRange[], max: number): PdfRange[] => {
  const out: PdfRange[] = []
  for (const [s, e] of ranges) {
    const start = Math.max(0, Math.min(s, max))
    const end = Math.max(0, Math.min(e, max))
    if (end > start) out.push([start, end])
  }
  return out
}
