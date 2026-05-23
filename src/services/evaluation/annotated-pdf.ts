import { asc, eq } from 'drizzle-orm'
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
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

function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return `${text.slice(0, max - 1).trimEnd()}…`
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

function drawWrappedText(
  page: PDFPage,
  text: string,
  options: {
    x: number
    y: number
    maxWidth: number
    font: PDFFont
    size: number
    lineHeight: number
    color: [number, number, number]
    maxLines: number
  },
): number {
  const words = safeText(text).split(/\s+/).filter(Boolean)
  if (words.length === 0) return 0
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    const width = options.font.widthOfTextAtSize(candidate, options.size)
    if (width > options.maxWidth && current) {
      lines.push(current)
      if (lines.length >= options.maxLines) break
      current = word
    } else {
      current = candidate
    }
  }
  if (current && lines.length < options.maxLines) lines.push(current)
  if (lines.length === options.maxLines && words.length > lines.join(' ').split(/\s+/).length) {
    const last = lines[lines.length - 1] ?? ''
    lines[lines.length - 1] = truncate(last, Math.max(8, last.length - 1)) + ' ' + '…'.slice(0)
  }

  for (let i = 0; i < lines.length; i++) {
    page.drawText(lines[i] ?? '', {
      x: options.x,
      y: options.y - i * options.lineHeight,
      size: options.size,
      font: options.font,
      color: rgb(options.color[0], options.color[1], options.color[2]),
    })
  }
  return lines.length
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

  // Append a cover summary page at the end with all findings grouped by page
  const cover = pdf.addPage([612, 792])
  let cursor = 760
  cover.drawText('Laporan Evaluation CiteTrack', {
    x: 48,
    y: cursor,
    size: 18,
    font: fontBold,
    color: rgb(0.05, 0.24, 0.31),
  })
  cursor -= 22
  cover.drawText(safeText(job.filename), {
    x: 48,
    y: cursor,
    size: 11,
    font,
    color: rgb(0.3, 0.4, 0.45),
  })
  cursor -= 16
  cover.drawText(
    `${unresolved.length} temuan belum diselesaikan / ${findings.length} total`,
    {
      x: 48,
      y: cursor,
      size: 10,
      font,
      color: rgb(0.3, 0.4, 0.45),
    },
  )
  cursor -= 20

  if (unresolved.length === 0) {
    cover.drawText(
      'Tidak ada temuan yang belum diselesaikan. Naskahmu bersih.',
      {
        x: 48,
        y: cursor,
        size: 11,
        font,
        color: rgb(0.05, 0.24, 0.31),
      },
    )
  } else {
    const sortedPages = [...byPage.keys()].toSorted((a, b) => a - b)
    for (const pageNumber of sortedPages) {
      if (cursor < 90) break
      const list = byPage.get(pageNumber) ?? []
      cover.drawText(`Halaman ${pageNumber} — ${list.length} temuan`, {
        x: 48,
        y: cursor,
        size: 11,
        font: fontBold,
        color: rgb(0.05, 0.24, 0.31),
      })
      cursor -= 14
      for (const f of list.slice(0, 6)) {
        if (cursor < 80) break
        const color = SEVERITY_RGB[f.severity]
        cover.drawRectangle({
          x: 48,
          y: cursor + 1,
          width: 6,
          height: 6,
          color: rgb(color[0], color[1], color[2]),
          opacity: 0.9,
        })
        const prefix = `[${CATEGORY_LABEL[f.category]} · ${SEVERITY_LABEL[f.severity]}] `
        const message = `${prefix}${f.message}`
        const lines = drawWrappedText(cover, message, {
          x: 60,
          y: cursor + 7,
          maxWidth: 504,
          font,
          size: 9,
          lineHeight: 11,
          color: [0.18, 0.24, 0.27],
          maxLines: 2,
        })
        cursor -= lines * 11 + 4
      }
      if (list.length > 6) {
        cover.drawText(`… ${list.length - 6} temuan lainnya di halaman ini`, {
          x: 60,
          y: cursor + 4,
          size: 9,
          font,
          color: rgb(0.45, 0.5, 0.55),
        })
        cursor -= 14
      }
      cursor -= 6
    }
  }

  const buffer = Buffer.from(await pdf.save())
  const cleanName = job.filename.replace(/\.pdf$/i, '')
  return {
    buffer,
    filename: `${cleanName}-annotated.pdf`,
  }
}
