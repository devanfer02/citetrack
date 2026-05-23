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
  const COVER_W = 612
  const COVER_H = 792
  const COVER_MARGIN_X = 56
  const COVER_MARGIN_BOTTOM = 64
  const CONTENT_WIDTH = COVER_W - COVER_MARGIN_X * 2

  // CiteTrack brand tokens (sourced from src/styles.css)
  const INK = [0.106, 0.106, 0.122] as const // #1B1B1F
  const INK_SOFT = [0.353, 0.353, 0.4] as const // #5A5A66
  const INK_FAINT = [0.541, 0.541, 0.576] as const // #8a8a93
  const BUTTER = [0.988, 0.914, 0.714] as const // #FCE9B6
  const CREAM = [0.98, 0.965, 0.922] as const // #FAF6EB
  const CORAL = [0.941, 0.451, 0.29] as const // #F0734A
  const CORAL_DEEP = [0.851, 0.345, 0.176] as const // #d9582d
  const INDIGO = [0.239, 0.431, 0.902] as const // #3D6EE6
  const MARKER_YELLOW = [0.965, 0.843, 0.467] as const // #F6D777
  const RULE = [0.85, 0.87, 0.88] as const

  let coverIdx = 0
  let cover: PDFPage = pdf.insertPage(coverIdx, COVER_SIZE)
  coverIdx++

  // Body cursor starts BELOW the hero band on the first cover page; on
  // overflow pages there's no hero, so the cursor starts higher up.
  const HERO_HEIGHT = 240
  const HERO_BOTTOM = COVER_H - HERO_HEIGHT // y of bottom edge of hero band
  const BODY_TOP_AFTER_HERO = HERO_BOTTOM - 28
  const BODY_TOP_PLAIN = COVER_H - 64
  let cursor = BODY_TOP_AFTER_HERO

  const drawHero = (page: PDFPage): void => {
    // 1. Butter background band
    page.drawRectangle({
      x: 0,
      y: HERO_BOTTOM,
      width: COVER_W,
      height: HERO_HEIGHT,
      color: rgb(BUTTER[0], BUTTER[1], BUTTER[2]),
    })
    // Cream sliver below the band so the seam reads softer
    page.drawRectangle({
      x: 0,
      y: HERO_BOTTOM - 6,
      width: COVER_W,
      height: 6,
      color: rgb(CREAM[0], CREAM[1], CREAM[2]),
    })

    // 2. Decorative doodles — same SVG paths used on the web hero.
    // DottedArc (coral) top-right
    page.drawSvgPath('M2 30 Q 22 -4, 62 14', {
      x: COVER_W - 140,
      y: COVER_H - 36,
      scale: 1.8,
      borderColor: rgb(CORAL[0], CORAL[1], CORAL[2]),
      borderWidth: 1.6,
      borderDashArray: [1, 6],
      borderLineCap: 1,
    })
    // Sparkles (coral) top-right corner
    page.drawSvgPath('M10 6 L10 14 M6 10 L14 10', {
      x: COVER_W - 70,
      y: COVER_H - 32,
      scale: 1.2,
      borderColor: rgb(CORAL[0], CORAL[1], CORAL[2]),
      borderWidth: 1.4,
      borderLineCap: 1,
    })
    page.drawSvgPath('M10 6 L10 14 M6 10 L14 10', {
      x: COVER_W - 50,
      y: COVER_H - 64,
      scale: 0.8,
      borderColor: rgb(CORAL[0], CORAL[1], CORAL[2]),
      borderWidth: 1.2,
      borderLineCap: 1,
    })
    // Squiggle (indigo) bottom-left of hero
    page.drawSvgPath('M2 8 Q 10 0, 18 8 T 34 8 T 50 8 T 62 8', {
      x: COVER_W - 180,
      y: HERO_BOTTOM + 60,
      scale: 1.4,
      borderColor: rgb(INDIGO[0], INDIGO[1], INDIGO[2]),
      borderWidth: 1.6,
      borderLineCap: 1,
    })
    // StarBurst (coral) tiny accent near the kicker pill
    page.drawSvgPath(
      'M16 4 v6 M16 22 v6 M4 16 h6 M22 16 h6 M7 7 l4 4 M21 21 l4 4 M7 25 l4 -4 M21 11 l4 -4',
      {
        x: COVER_W - 90,
        y: HERO_BOTTOM + 28,
        scale: 0.75,
        borderColor: rgb(CORAL[0], CORAL[1], CORAL[2]),
        borderWidth: 1.2,
        borderLineCap: 1,
      },
    )

    // 3. Kicker pill: white background with coral text
    const kickerText = 'LAPORAN EVALUATION'
    const kickerSize = 8
    const kickerTextW = fontBold.widthOfTextAtSize(kickerText, kickerSize)
    const kickerPadX = 10
    const kickerPadY = 5
    const kickerW = kickerTextW + kickerPadX * 2
    const kickerH = kickerSize + kickerPadY * 2
    const kickerX = COVER_MARGIN_X
    const kickerY = COVER_H - 80
    // Fake rounded pill: rectangle + circle caps
    page.drawRectangle({
      x: kickerX + kickerH / 2,
      y: kickerY,
      width: kickerW - kickerH,
      height: kickerH,
      color: rgb(1, 1, 1),
      opacity: 0.95,
    })
    page.drawCircle({
      x: kickerX + kickerH / 2,
      y: kickerY + kickerH / 2,
      size: kickerH / 2,
      color: rgb(1, 1, 1),
      opacity: 0.95,
    })
    page.drawCircle({
      x: kickerX + kickerW - kickerH / 2,
      y: kickerY + kickerH / 2,
      size: kickerH / 2,
      color: rgb(1, 1, 1),
      opacity: 0.95,
    })
    page.drawText(kickerText, {
      x: kickerX + kickerPadX,
      y: kickerY + kickerPadY,
      size: kickerSize,
      font: fontBold,
      color: rgb(CORAL_DEEP[0], CORAL_DEEP[1], CORAL_DEEP[2]),
    })

    // 4. Big title — "Cite" in ink, "Track" in coral (wordmark match)
    const titleY = COVER_H - 138
    const titleSize = 40
    page.drawText('Cite', {
      x: COVER_MARGIN_X,
      y: titleY,
      size: titleSize,
      font: fontBold,
      color: rgb(INK[0], INK[1], INK[2]),
    })
    const citeW = fontBold.widthOfTextAtSize('Cite', titleSize)
    page.drawText('Track', {
      x: COVER_MARGIN_X + citeW + 4,
      y: titleY,
      size: titleSize,
      font: fontBold,
      color: rgb(CORAL[0], CORAL[1], CORAL[2]),
    })

    // 5. Underline doodle (coral) beneath the title
    page.drawSvgPath('M2 6 Q 22 0, 40 5 T 78 4', {
      x: COVER_MARGIN_X,
      y: titleY - 4,
      scale: 1.4,
      borderColor: rgb(CORAL[0], CORAL[1], CORAL[2]),
      borderWidth: 1.8,
      borderLineCap: 1,
    })

    // 6. Subtitle line — filename with a marker-yellow highlight band
    const fileName = safeText(job.filename)
    const fileSize = 11
    const fileW = font.widthOfTextAtSize(fileName, fileSize)
    const subY = titleY - 50
    page.drawRectangle({
      x: COVER_MARGIN_X - 2,
      y: subY - 2,
      width: Math.min(fileW + 4, CONTENT_WIDTH),
      height: fileSize + 2,
      color: rgb(MARKER_YELLOW[0], MARKER_YELLOW[1], MARKER_YELLOW[2]),
      opacity: 0.5,
    })
    page.drawText(fileName, {
      x: COVER_MARGIN_X,
      y: subY,
      size: fileSize,
      font,
      color: rgb(INK[0], INK[1], INK[2]),
    })

    // 7. Summary tagline
    page.drawText(
      safeText(
        `${unresolved.length} temuan belum diselesaikan dari ${findings.length} total  ·  ${job.totalPages ?? '-'} halaman`,
      ),
      {
        x: COVER_MARGIN_X,
        y: subY - 18,
        size: 9,
        font,
        color: rgb(INK_SOFT[0], INK_SOFT[1], INK_SOFT[2]),
      },
    )
  }

  // Render the hero on the first cover page
  drawHero(cover)

  const newCoverPage = (): void => {
    cover = pdf.insertPage(coverIdx, COVER_SIZE)
    coverIdx++
    // Plain header on continuation pages: a thin coral rule + small kicker
    cover.drawRectangle({
      x: COVER_MARGIN_X,
      y: COVER_H - 56,
      width: 36,
      height: 2,
      color: rgb(CORAL[0], CORAL[1], CORAL[2]),
    })
    cover.drawText('LAPORAN EVALUATION · lanjutan', {
      x: COVER_MARGIN_X,
      y: COVER_H - 48,
      size: 8,
      font: fontBold,
      color: rgb(INK_FAINT[0], INK_FAINT[1], INK_FAINT[2]),
    })
    cursor = BODY_TOP_PLAIN
  }

  const ensureSpace = (needed: number): void => {
    if (cursor - needed < COVER_MARGIN_BOTTOM) newCoverPage()
  }

  // Section header for the findings list (on the first page, below hero)
  cover.drawText('Daftar temuan per halaman', {
    x: COVER_MARGIN_X,
    y: cursor,
    size: 11,
    font: fontBold,
    color: rgb(INK[0], INK[1], INK[2]),
  })
  cursor -= 8
  cover.drawRectangle({
    x: COVER_MARGIN_X,
    y: cursor,
    width: CONTENT_WIDTH,
    height: 0.6,
    color: rgb(RULE[0], RULE[1], RULE[2]),
  })
  cursor -= 14

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
