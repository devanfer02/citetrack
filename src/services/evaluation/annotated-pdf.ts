import { asc, eq } from 'drizzle-orm'
import {
  PDFArray,
  PDFDocument,
  PDFName,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from 'pdf-lib'
import {
  getDocument,
  VerbosityLevel,
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

interface LinkRect {
  x: number
  y: number
  width: number
  height: number
}

function extractHighlightNeedle(f: EvaluationFinding): string | null {
  const fromColumn = f.token?.trim()
  if (fromColumn) return fromColumn
  const normalized = f.message.replace(/[“”‘’]/g, '"')
  const quoted = /"([^"]+)"/.exec(normalized)
  if (quoted?.[1]) {
    const text = quoted[1].trim()
    if (text) return text
  }
  if (f.excerpt) {
    const word = f.excerpt
      .split(/\s+/)
      .map((w) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''))
      .find((w) => w.length >= 5)
    if (word) return word
  }
  return null
}

// Build line-merged text from a PDF page so a needle that spans multiple
// pdfjs text items (kerning, sub-runs, partial glyphs) still matches, and
// only at word boundaries so "progress" doesn't match inside "metaprogress".
async function findHighlightRects(
  page: PDFPageProxy,
  needle: string,
): Promise<HighlightRect[]> {
  const trimmed = needle.trim()
  if (trimmed.length < 2) return []
  const needleLower = trimmed.toLowerCase()
  const textContent = await page.getTextContent()

  type Item = { str: string; width: number; height: number; transform: number[] }
  const items: Item[] = []
  for (const it of textContent.items) {
    if (!('str' in it)) continue
    const s = (it as { str: string }).str
    if (typeof s !== 'string' || !s) continue
    items.push(it as Item)
  }

  // Bucket items by baseline y (rounded to 1pt). pdfjs sorts items left-to-
  // right within a line, but we re-sort by x to be defensive.
  const byBaseline = new Map<number, Item[]>()
  for (const it of items) {
    const key = Math.round(it.transform[5] ?? 0)
    const arr = byBaseline.get(key) ?? []
    arr.push(it)
    byBaseline.set(key, arr)
  }

  const rects: HighlightRect[] = []

  for (const lineItems of byBaseline.values()) {
    lineItems.sort((a, b) => (a.transform[4] ?? 0) - (b.transform[4] ?? 0))

    // Merge items into one string + per-char x/width tables. When there's
    // a visible gap between items, insert a synthetic space so word
    // boundaries still align with the needle.
    let merged = ''
    const charX: number[] = []
    const charW: number[] = []
    let baseY = lineItems[0]?.transform[5] ?? 0
    let height = 0
    let lastEnd = Number.NEGATIVE_INFINITY
    for (const it of lineItems) {
      const itemBaseX = it.transform[4] ?? 0
      const itemBaseY = it.transform[5] ?? 0
      const itemWidth = it.width ?? 0
      const itemHeight = it.height ?? Math.abs(it.transform[3] ?? 10)
      if (itemHeight > height) height = itemHeight
      baseY = itemBaseY
      const gap = itemBaseX - lastEnd
      if (lastEnd !== Number.NEGATIVE_INFINITY && gap > itemHeight * 0.2) {
        merged += ' '
        charX.push(lastEnd)
        charW.push(Math.max(0, gap))
      }
      const str = it.str
      const cw = str.length > 0 ? itemWidth / str.length : 0
      for (let i = 0; i < str.length; i++) {
        merged += str[i]
        charX.push(itemBaseX + i * cw)
        charW.push(cw)
      }
      lastEnd = itemBaseX + itemWidth
    }
    if (!merged) continue

    const lowerLine = merged.toLowerCase()
    let from = 0
    while (from <= lowerLine.length - needleLower.length) {
      const idx = lowerLine.indexOf(needleLower, from)
      if (idx === -1) break
      const before = idx === 0 ? ' ' : lowerLine[idx - 1]
      const afterIdx = idx + needleLower.length
      const after = afterIdx >= lowerLine.length ? ' ' : lowerLine[afterIdx]
      if (isWordBoundary(before) && isWordBoundary(after)) {
        const startX = charX[idx]
        const endIdx = idx + needleLower.length - 1
        const endX = (charX[endIdx] ?? startX) + (charW[endIdx] ?? 0)
        // Tight box: cover the glyph height with a small ascender bonus
        // and no descender padding — keeps highlights from spilling onto
        // the line above.
        const padTop = height * 0.08
        rects.push({
          x: startX,
          y: baseY,
          width: Math.max(0, endX - startX),
          height: height + padTop,
        })
      }
      from = idx + needleLower.length
    }
  }
  return rects
}

function isWordBoundary(ch: string): boolean {
  return !/[\p{L}\p{N}]/u.test(ch)
}

function safeText(input: string): string {
  return input
    .replace(/[‘’′]/g, "'")
    .replace(/[“”″]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/[^\x20-\x7E]/g, '')
}

// Greedy word-wrap. Falls back to per-character break when a single token
// exceeds the column width (e.g. a long unspaced URL). Never truncates.
function wrapToLines(
  font: PDFFont,
  size: number,
  text: string,
  maxWidth: number,
): string[] {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (!normalized) return ['']
  const words = normalized.split(' ')
  const lines: string[] = []
  let current = ''
  const pushChunked = (word: string): void => {
    let chunk = ''
    for (const ch of word) {
      const trial = chunk + ch
      if (font.widthOfTextAtSize(trial, size) <= maxWidth) {
        chunk = trial
      } else {
        if (chunk) lines.push(chunk)
        chunk = ch
      }
    }
    current = chunk
  }
  for (const word of words) {
    const trial = current ? `${current} ${word}` : word
    if (font.widthOfTextAtSize(trial, size) <= maxWidth) {
      current = trial
      continue
    }
    if (current) lines.push(current)
    if (font.widthOfTextAtSize(word, size) > maxWidth) {
      pushChunked(word)
    } else {
      current = word
    }
  }
  if (current) lines.push(current)
  return lines.length > 0 ? lines : ['']
}

// Register a /Link annotation on `sourcePage` that goes to `destPage` (full
// fit). Used for cover→page jumps and page→cover back-links.
function addLinkAnnotation(
  pdf: PDFDocument,
  sourcePage: PDFPage,
  rect: LinkRect,
  destPage: PDFPage,
): void {
  const dest = PDFArray.withContext(pdf.context)
  dest.push(destPage.ref)
  dest.push(PDFName.of('Fit'))

  const linkDict = pdf.context.obj({
    Type: 'Annot',
    Subtype: 'Link',
    Rect: [rect.x, rect.y, rect.x + rect.width, rect.y + rect.height],
    Border: [0, 0, 0],
    A: {
      Type: 'Action',
      S: 'GoTo',
      D: dest,
    },
  })
  const linkRef = pdf.context.register(linkDict)

  const existing = sourcePage.node.lookupMaybe(PDFName.of('Annots'), PDFArray)
  if (existing) {
    existing.push(linkRef)
  } else {
    const annots = PDFArray.withContext(pdf.context)
    annots.push(linkRef)
    sourcePage.node.set(PDFName.of('Annots'), annots)
  }
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
  const pdfjsDoc = await getDocument({
    data: new Uint8Array(original),
    verbosity: VerbosityLevel.ERRORS,
  }).promise

  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold)

  // Capture original page wrappers BEFORE we prepend any cover pages —
  // pdf-lib page wrappers keep stable refs even after insertions, so we
  // can address the original pages by their original 0-based index later.
  const originalPages = pdf.getPages()
  const pageCount = originalPages.length

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

  // Insert the FIRST cover page now so we have a ref to back-link from
  // each annotated original page.
  const COVER_SIZE: [number, number] = [612, 792]
  const COVER_W = 612
  const COVER_H = 792
  const COVER_MARGIN_X = 56
  const COVER_MARGIN_BOTTOM = 88
  const CONTENT_WIDTH = COVER_W - COVER_MARGIN_X * 2

  let coverIdx = 0
  let cover: PDFPage = pdf.insertPage(coverIdx, COVER_SIZE)
  coverIdx++
  const firstCover = cover

  // Per-page marginalia + word highlights + clickable back-link to cover.
  for (const [pageNumber, pageFindings] of byPage) {
    if (pageNumber < 1 || pageNumber > pageCount) continue
    const page = originalPages[pageNumber - 1]
    const { width, height } = page.getSize()

    const worst = pageFindings.reduce<Severity>(
      (acc, f) => (rankSeverity(f.severity) < rankSeverity(acc) ? f.severity : acc),
      pageFindings[0]?.severity ?? 'info',
    )
    const stripeColor = SEVERITY_RGB[worst]

    page.drawRectangle({
      x: 0,
      y: 0,
      width: 8,
      height,
      color: rgb(stripeColor[0], stripeColor[1], stripeColor[2]),
      opacity: 0.85,
    })

    try {
      const pdfjsPage = await pdfjsDoc.getPage(pageNumber)
      const seenRects = new Set<string>()
      for (const finding of pageFindings) {
        const needle = extractHighlightNeedle(finding)
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
      // Page stripe + badge still mark the page if pdfjs extraction fails.
    }

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

    // Back-link: clicking the badge jumps to the cover summary.
    addLinkAnnotation(
      pdf,
      page,
      { x: badgeX, y: badgeY, width: badgeWidth, height: badgeHeight },
      firstCover,
    )
  }

  // CiteTrack brand tokens (sourced from src/styles.css)
  const INK = [0.106, 0.106, 0.122] as const
  const INK_SOFT = [0.353, 0.353, 0.4] as const
  const INK_FAINT = [0.541, 0.541, 0.576] as const
  const BUTTER = [0.988, 0.914, 0.714] as const
  const CREAM = [0.98, 0.965, 0.922] as const
  const CORAL = [0.941, 0.451, 0.29] as const
  const CORAL_DEEP = [0.851, 0.345, 0.176] as const
  const INDIGO = [0.239, 0.431, 0.902] as const
  const MARKER_YELLOW = [0.965, 0.843, 0.467] as const
  const RULE = [0.85, 0.87, 0.88] as const

  const HERO_HEIGHT = 240
  const HERO_BOTTOM = COVER_H - HERO_HEIGHT
  const BODY_TOP_AFTER_HERO = HERO_BOTTOM - 40
  const BODY_TOP_PLAIN = COVER_H - 104
  let cursor = BODY_TOP_AFTER_HERO

  const drawHero = (page: PDFPage): void => {
    page.drawRectangle({
      x: 0,
      y: HERO_BOTTOM,
      width: COVER_W,
      height: HERO_HEIGHT,
      color: rgb(BUTTER[0], BUTTER[1], BUTTER[2]),
    })
    page.drawRectangle({
      x: 0,
      y: HERO_BOTTOM - 6,
      width: COVER_W,
      height: 6,
      color: rgb(CREAM[0], CREAM[1], CREAM[2]),
    })

    page.drawSvgPath('M2 30 Q 22 -4, 62 14', {
      x: COVER_W - 140,
      y: COVER_H - 36,
      scale: 1.8,
      borderColor: rgb(CORAL[0], CORAL[1], CORAL[2]),
      borderWidth: 1.6,
      borderDashArray: [1, 6],
      borderLineCap: 1,
    })
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
    page.drawSvgPath('M2 8 Q 10 0, 18 8 T 34 8 T 50 8 T 62 8', {
      x: COVER_W - 180,
      y: HERO_BOTTOM + 60,
      scale: 1.4,
      borderColor: rgb(INDIGO[0], INDIGO[1], INDIGO[2]),
      borderWidth: 1.6,
      borderLineCap: 1,
    })
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

    const kickerText = 'LAPORAN EVALUATION'
    const kickerSize = 8
    const kickerTextW = fontBold.widthOfTextAtSize(kickerText, kickerSize)
    const kickerPadX = 10
    const kickerPadY = 5
    const kickerW = kickerTextW + kickerPadX * 2
    const kickerH = kickerSize + kickerPadY * 2
    const kickerX = COVER_MARGIN_X
    const kickerY = COVER_H - 80
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

    page.drawSvgPath('M2 6 Q 22 0, 40 5 T 78 4', {
      x: COVER_MARGIN_X,
      y: titleY - 4,
      scale: 1.4,
      borderColor: rgb(CORAL[0], CORAL[1], CORAL[2]),
      borderWidth: 1.8,
      borderLineCap: 1,
    })

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

  drawHero(cover)

  const newCoverPage = (): void => {
    cover = pdf.insertPage(coverIdx, COVER_SIZE)
    coverIdx++
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

  // ensureSpace: returns true if we had to flow to a new cover page. The
  // caller uses that signal to flush any in-progress link rect on the old
  // cover before continuing on the new one.
  const ensureSpace = (needed: number): boolean => {
    if (cursor - needed < COVER_MARGIN_BOTTOM) {
      newCoverPage()
      return true
    }
    return false
  }

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
    const PAGE_HEADER_HEIGHT = 14
    const FINDING_LINE_HEIGHT = 13
    const GROUP_GAP = 10

    for (const pageNumber of sortedPages) {
      const list = byPage.get(pageNumber) ?? []
      const targetPage =
        pageNumber >= 1 && pageNumber <= pageCount
          ? originalPages[pageNumber - 1]
          : null

      // Keep the page header glued to its first finding line. If they
      // can't fit together, flow first so the header doesn't orphan.
      ensureSpace(PAGE_HEADER_HEIGHT + FINDING_LINE_HEIGHT)

      const headerCursor = cursor
      cover.drawText(`Halaman ${pageNumber}`, {
        x: COVER_MARGIN_X,
        y: headerCursor,
        size: 11,
        font: fontBold,
        color: rgb(INK[0], INK[1], INK[2]),
      })
      const countLabel = `${list.length} temuan`
      const countWidth = font.widthOfTextAtSize(countLabel, 9)
      cover.drawText(countLabel, {
        x: COVER_MARGIN_X + CONTENT_WIDTH - countWidth,
        y: headerCursor + 1,
        size: 9,
        font,
        color: rgb(INK_FAINT[0], INK_FAINT[1], INK_FAINT[2]),
      })
      if (targetPage) {
        addLinkAnnotation(
          pdf,
          cover,
          {
            x: COVER_MARGIN_X - 4,
            y: headerCursor - 3,
            width: CONTENT_WIDTH + 8,
            height: 16,
          },
          targetPage,
        )
      }
      cursor -= PAGE_HEADER_HEIGHT

      for (const f of list) {
        const color = SEVERITY_RGB[f.severity]
        const tag = safeText(
          `${CATEGORY_LABEL[f.category]} · ${SEVERITY_LABEL[f.severity].toLowerCase()}`,
        )
        const tagWidth = fontBold.widthOfTextAtSize(tag, 8)
        const messageX = COVER_MARGIN_X + 16 + tagWidth + 8
        const messageMaxWidth =
          COVER_MARGIN_X + CONTENT_WIDTH - messageX - 2
        const collapsed = safeText(f.message.replace(/\s+/g, ' ').trim())
        const wrapped = wrapToLines(font, 9, collapsed, messageMaxWidth)

        // First line: severity square + tag + first wrapped message line.
        ensureSpace(FINDING_LINE_HEIGHT)
        const firstLineY = cursor
        cover.drawRectangle({
          x: COVER_MARGIN_X + 4,
          y: firstLineY - 1,
          width: 4.5,
          height: 4.5,
          color: rgb(color[0], color[1], color[2]),
          opacity: 0.95,
        })
        cover.drawText(tag, {
          x: COVER_MARGIN_X + 16,
          y: firstLineY,
          size: 8,
          font: fontBold,
          color: rgb(INK_FAINT[0], INK_FAINT[1], INK_FAINT[2]),
        })
        cover.drawText(wrapped[0], {
          x: messageX,
          y: firstLineY,
          size: 9,
          font,
          color: rgb(INK_SOFT[0], INK_SOFT[1], INK_SOFT[2]),
        })
        if (targetPage) {
          addLinkAnnotation(
            pdf,
            cover,
            {
              x: COVER_MARGIN_X,
              y: firstLineY - 2,
              width: CONTENT_WIDTH,
              height: FINDING_LINE_HEIGHT,
            },
            targetPage,
          )
        }
        cursor -= FINDING_LINE_HEIGHT

        // Continuation lines — wrap text only, aligned under the message
        // column. Each line gets its own link rect so the row remains
        // clickable even if it flows across cover pages.
        for (let i = 1; i < wrapped.length; i++) {
          ensureSpace(FINDING_LINE_HEIGHT)
          const lineY = cursor
          cover.drawText(wrapped[i], {
            x: messageX,
            y: lineY,
            size: 9,
            font,
            color: rgb(INK_SOFT[0], INK_SOFT[1], INK_SOFT[2]),
          })
          if (targetPage) {
            addLinkAnnotation(
              pdf,
              cover,
              {
                x: COVER_MARGIN_X,
                y: lineY - 2,
                width: CONTENT_WIDTH,
                height: FINDING_LINE_HEIGHT,
              },
              targetPage,
            )
          }
          cursor -= FINDING_LINE_HEIGHT
        }
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
