import { asc, eq } from 'drizzle-orm'
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from 'pdf-lib'
import {
  getDocument,
  type PDFPageProxy,
} from 'pdfjs-dist/legacy/build/pdf.mjs'
import { db } from '#/db'
import { evaluationFindings, evaluationJobs } from '#/db/schema'
import { paths } from '#/lib/paths'

type Severity = EvaluationFinding['severity']

const SEVERITY_RGB: Record<Severity, [number, number, number]> = {
  error: [0.96, 0.31, 0.31],
  warning: [0.9, 0.72, 0.0],
  info: [0.24, 0.76, 0.93],
}

const SEVERITY_LABEL: Record<Severity, string> = {
  error: 'Error',
  warning: 'Peringatan',
  info: 'Info',
}

const CATEGORY_LABEL: Record<EvaluationFinding['category'], string> = {
  kbbi: 'KBBI',
  eyd: 'EYD',
}

function rankSeverity(s: Severity): number {
  return s === 'error' ? 0 : s === 'warning' ? 1 : 2
}

interface HighlightRect {
  x: number
  y: number
  width: number
  height: number
}

async function findHighlightRects(
  page: PDFPageProxy,
  needle: string,
): Promise<HighlightRect[]> {
  const trimmed = needle.trim().toLowerCase()
  if (trimmed.length < 2) return []
  const textContent = await page.getTextContent()
  const rects: HighlightRect[] = []
  for (const item of textContent.items) {
    if (!('str' in item)) continue
    const str = item.str
    if (!str) continue
    const lower = str.toLowerCase()
    const idx = lower.indexOf(trimmed)
    if (idx === -1) continue
    // transform is [a, b, c, d, e, f]; (e, f) is the text origin (baseline
    // bottom-left in PDF user space). width/height are in user units.
    const transform = item.transform as number[]
    const baseX = transform[4] ?? 0
    const baseY = transform[5] ?? 0
    const itemWidth = item.width ?? 0
    const height = item.height ?? Math.abs(transform[3] ?? 10)
    const charWidth = str.length > 0 ? itemWidth / str.length : itemWidth
    const x = baseX + idx * charWidth
    const width = Math.min(itemWidth, trimmed.length * charWidth)
    rects.push({
      x,
      y: baseY - height * 0.15,
      width,
      height: height * 1.15,
    })
  }
  return rects
}

function safeText(input: string): string {
  // pdf-lib's StandardFonts (WinAnsi) cannot encode many Unicode chars
  // outside Latin-1. Substitute curly quotes / em dashes and drop anything
  // unrepresentable so drawText never throws on a stray symbol.
  return input
    .replace(/[‘’′]/g, "'")
    .replace(/[“”″]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/[^\x20-\x7E]/g, '')
}

function fitToWidth(
  font: PDFFont,
  size: number,
  text: string,
  maxWidth: number,
): string {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text
  let lo = 0
  let hi = text.length
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    const candidate = `${text.slice(0, mid).trimEnd()}...`
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) lo = mid
    else hi = mid - 1
  }
  return `${text.slice(0, lo).trimEnd()}...`
}

export async function buildAnnotatedEvaluationPdf(evalJobId: string): Promise<{
  buffer: Buffer
  filename: string
}> {
  const [job] = await db
    .select()
    .from(evaluationJobs)
    .where(eq(evaluationJobs.id, evalJobId))
    .limit(1)
  if (!job) throw new Error('Evaluation job not found')

  const findings = await db
    .select()
    .from(evaluationFindings)
    .where(eq(evaluationFindings.evalJobId, evalJobId))
    .orderBy(asc(evaluationFindings.pageNumber), asc(evaluationFindings.offset))

  const { readFile } = await import('node:fs/promises')
  const filePath = paths.evaluationPdf(evalJobId)
  const original = await readFile(filePath)
  const pdf = await PDFDocument.load(new Uint8Array(original), {
    ignoreEncryption: true,
  })
  // Load with pdfjs too so we can pull per-item text positions for each
  // finding and draw highlighter rects over the actual offending tokens
  // instead of just marking the page.
  const pdfjsDoc = await getDocument({
    data: new Uint8Array(original),
  }).promise

  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold)

  // Group unresolved findings by page
  const unresolved = findings.filter((f) => f.resolvedAt === null)
  const byPage = new Map<number, EvaluationFinding[]>()
  for (const f of unresolved) {
    const p = f.pageNumber
    if (p === null) continue
    const arr = byPage.get(p) ?? []
    arr.push(f)
    byPage.set(p, arr)
  }

  const pageCount = pdf.getPageCount()
  for (const [pageNumber, pageFindings] of byPage) {
    if (pageNumber < 1 || pageNumber > pageCount) continue
    const page = pdf.getPage(pageNumber - 1)
    const { width, height } = page.getSize()

    // Severity ranking → pick worst severity for this page's stripe color
    const worst = pageFindings.reduce<Severity>(
      (acc, f) => (rankSeverity(f.severity) < rankSeverity(acc) ? f.severity : acc),
      pageFindings[0]?.severity ?? 'info',
    )
    const stripeColor = SEVERITY_RGB[worst]

    // Marginalia stripe — vertical bar on the left edge
    page.drawRectangle({
      x: 0,
      y: 0,
      width: 8,
      height,
      color: rgb(stripeColor[0], stripeColor[1], stripeColor[2]),
      opacity: 0.85,
    })

    // Highlighter rects — find the offending token on the page via pdfjs
    // text positions and draw a translucent severity-colored box over each
    // matched text item. Failures here are non-fatal: stripe + badge still
    // mark the page even if no highlight lands.
    try {
      const pdfjsPage = await pdfjsDoc.getPage(pageNumber)
      const seenRects = new Set<string>()
      for (const finding of pageFindings) {
        const needle =
          finding.token?.trim() ||
          finding.excerpt?.trim().split(/\s+/).slice(0, 4).join(' ') ||
          null
        if (!needle) continue
        const rects = await findHighlightRects(pdfjsPage, needle)
        const color = SEVERITY_RGB[finding.severity]
        for (const rect of rects) {
          const key = `${Math.round(rect.x)}:${Math.round(rect.y)}:${Math.round(rect.width)}`
          if (seenRects.has(key)) continue
          seenRects.add(key)
          page.drawRectangle({
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
            color: rgb(color[0], color[1], color[2]),
            opacity: 0.32,
          })
        }
      }
      pdfjsPage.cleanup()
    } catch {
      // pdfjs may fail on pages with unusual encodings; the page stripe +
      // badge still mark it.
    }

    // Top-right badge — finding count
    const badgeText = `${pageFindings.length} temuan`
    const badgeWidth = fontBold.widthOfTextAtSize(badgeText, 9) + 14
    const badgeHeight = 16
    const badgeX = width - badgeWidth - 14
    const badgeY = height - badgeHeight - 14
    page.drawRectangle({
      x: badgeX,
      y: badgeY,
      width: badgeWidth,
      height: badgeHeight,
      color: rgb(stripeColor[0], stripeColor[1], stripeColor[2]),
      opacity: 0.9,
      borderColor: rgb(0, 0, 0),
      borderOpacity: 0.05,
      borderWidth: 0.5,
    })
    page.drawText(badgeText, {
      x: badgeX + 7,
      y: badgeY + 4,
      size: 9,
      font: fontBold,
      color: rgb(1, 1, 1),
    })
  }

  // Prepend a cover summary at the front of the document. The summary
  // groups unresolved findings by page; if it overflows one sheet, more
  // cover pages are inserted ahead of the original PDF so the reader
  // always lands on the overview first.
  const COVER_SIZE: [number, number] = [612, 792]
  const COVER_MARGIN_X = 56
  const COVER_MARGIN_BOTTOM = 64
  const COVER_TOP = 736
  const CONTENT_WIDTH = 612 - COVER_MARGIN_X * 2
  const INK = [0.05, 0.24, 0.31] as const
  const INK_SOFT = [0.32, 0.42, 0.46] as const
  const INK_FAINT = [0.55, 0.62, 0.65] as const
  const RULE = [0.85, 0.87, 0.88] as const

  let coverIdx = 0
  let cover: PDFPage = pdf.insertPage(coverIdx, COVER_SIZE)
  coverIdx++
  let cursor = COVER_TOP

  const newCoverPage = (): void => {
    cover = pdf.insertPage(coverIdx, COVER_SIZE)
    coverIdx++
    cursor = COVER_TOP
  }

  const ensureSpace = (needed: number): void => {
    if (cursor - needed < COVER_MARGIN_BOTTOM) newCoverPage()
  }

  const drawRule = (): void => {
    cover.drawRectangle({
      x: COVER_MARGIN_X,
      y: cursor,
      width: CONTENT_WIDTH,
      height: 0.6,
      color: rgb(RULE[0], RULE[1], RULE[2]),
    })
    cursor -= 16
  }

  // Header block
  cover.drawText('LAPORAN EVALUATION', {
    x: COVER_MARGIN_X,
    y: cursor,
    size: 9,
    font: fontBold,
    color: rgb(INK_FAINT[0], INK_FAINT[1], INK_FAINT[2]),
  })
  cursor -= 16
  cover.drawText('CiteTrack', {
    x: COVER_MARGIN_X,
    y: cursor,
    size: 24,
    font: fontBold,
    color: rgb(INK[0], INK[1], INK[2]),
  })
  cursor -= 26
  cover.drawText(safeText(job.filename), {
    x: COVER_MARGIN_X,
    y: cursor,
    size: 11,
    font,
    color: rgb(INK_SOFT[0], INK_SOFT[1], INK_SOFT[2]),
  })
  cursor -= 16
  cover.drawText(
    `${unresolved.length} temuan belum diselesaikan dari ${findings.length} total · ${job.totalPages ?? '—'} halaman`,
    {
      x: COVER_MARGIN_X,
      y: cursor,
      size: 9,
      font,
      color: rgb(INK_FAINT[0], INK_FAINT[1], INK_FAINT[2]),
    },
  )
  cursor -= 22
  drawRule()
  cursor -= 6

  if (unresolved.length === 0) {
    cover.drawText(
      'Tidak ada temuan yang belum diselesaikan. Naskahmu bersih.',
      {
        x: COVER_MARGIN_X,
        y: cursor,
        size: 11,
        font,
        color: rgb(INK[0], INK[1], INK[2]),
      },
    )
  } else {
    const sortedPages = [...byPage.keys()].toSorted((a, b) => a - b)
    const FINDINGS_PER_GROUP = 8
    const FINDING_LINE_HEIGHT = 13
    const GROUP_GAP = 10

    for (const pageNumber of sortedPages) {
      const list = byPage.get(pageNumber) ?? []
      const visibleCount = Math.min(list.length, FINDINGS_PER_GROUP)
      const overflow = list.length - visibleCount
      const blockHeight =
        18 + visibleCount * FINDINGS_PER_GROUP * 0 + visibleCount * FINDING_LINE_HEIGHT + (overflow > 0 ? FINDING_LINE_HEIGHT : 0) + GROUP_GAP
      ensureSpace(blockHeight + 6)

      // Page header — "Halaman N" left, "X temuan" right
      const headerLabel = `Halaman ${pageNumber}`
      const countLabel = `${list.length} temuan`
      cover.drawText(headerLabel, {
        x: COVER_MARGIN_X,
        y: cursor,
        size: 11,
        font: fontBold,
        color: rgb(INK[0], INK[1], INK[2]),
      })
      const countWidth = font.widthOfTextAtSize(countLabel, 9)
      cover.drawText(countLabel, {
        x: COVER_MARGIN_X + CONTENT_WIDTH - countWidth,
        y: cursor + 1,
        size: 9,
        font,
        color: rgb(INK_FAINT[0], INK_FAINT[1], INK_FAINT[2]),
      })
      cursor -= 14

      for (const f of list.slice(0, FINDINGS_PER_GROUP)) {
        ensureSpace(FINDING_LINE_HEIGHT)
        const color = SEVERITY_RGB[f.severity]
        // Severity square — aligned with text baseline
        cover.drawRectangle({
          x: COVER_MARGIN_X + 4,
          y: cursor - 1,
          width: 4.5,
          height: 4.5,
          color: rgb(color[0], color[1], color[2]),
          opacity: 0.95,
        })
        // Category · severity tag
        const tag = `${CATEGORY_LABEL[f.category]} · ${SEVERITY_LABEL[f.severity].toLowerCase()}`
        cover.drawText(safeText(tag), {
          x: COVER_MARGIN_X + 16,
          y: cursor,
          size: 8,
          font: fontBold,
          color: rgb(INK_FAINT[0], INK_FAINT[1], INK_FAINT[2]),
        })
        // Message — truncated to one line that fits the remaining width
        const tagWidth = fontBold.widthOfTextAtSize(safeText(tag), 8)
        const messageX = COVER_MARGIN_X + 16 + tagWidth + 8
        const messageMaxWidth =
          COVER_MARGIN_X + CONTENT_WIDTH - messageX - 2
        const collapsed = f.message.replace(/\s+/g, ' ').trim()
        const truncated = fitToWidth(font, 9, safeText(collapsed), messageMaxWidth)
        cover.drawText(truncated, {
          x: messageX,
          y: cursor,
          size: 9,
          font,
          color: rgb(INK_SOFT[0], INK_SOFT[1], INK_SOFT[2]),
        })
        cursor -= FINDING_LINE_HEIGHT
      }

      if (overflow > 0) {
        ensureSpace(FINDING_LINE_HEIGHT)
        cover.drawText(`… ${overflow} temuan lainnya di halaman ini`, {
          x: COVER_MARGIN_X + 16,
          y: cursor,
          size: 8,
          font,
          color: rgb(INK_FAINT[0], INK_FAINT[1], INK_FAINT[2]),
        })
        cursor -= FINDING_LINE_HEIGHT
      }

      cursor -= GROUP_GAP
    }
  }

  const buffer = Buffer.from(await pdf.save())
  await pdfjsDoc.destroy()
  const cleanName = job.filename.replace(/\.pdf$/i, '')
  return {
    buffer,
    filename: `${cleanName}-annotated.pdf`,
  }
}
