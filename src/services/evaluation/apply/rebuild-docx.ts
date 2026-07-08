import { Document, Packer, Paragraph, TextRun } from 'docx'
import { asc, eq } from 'drizzle-orm'
import { db } from '#/db'
import { evaluationPages } from '#/db/schema'
import { isItalicFix } from './eligibility'
import type { ChangeLog, Finding } from './types'

export type ItalicRange = [number, number]
export type PageText = {
  pageNumber: number
  content: string
  italicRanges?: ItalicRange[]
}

function pushUnlocated(log: ChangeLog, f: Finding, reason: string): void {
  log.unlocated.push({
    findingId: f.id,
    pageNumber: f.pageNumber,
    ruleId: f.ruleId,
    token: f.token ?? '',
    suggestion: f.suggestion ?? '',
    reason,
  })
}

// Apply selected findings to one page's text in a single descending-offset
// pass. Text replacements splice (changing length); italic findings record a
// range to be emitted italic in the rebuilt docx (no text change). Processing
// right-to-left keeps earlier offsets valid; when a replacement shifts text,
// already-recorded italic ranges (all to its right) shift by the same delta.
// The offset indexes exactly into this content (see eyd/checker.ts), so we
// verify content.slice(offset,+len) still equals the token before acting; a
// mismatch is recorded as unlocated rather than applied blindly.
export function applyFindingsToPage(
  content: string,
  findings: readonly Finding[],
  log: ChangeLog,
): { content: string; italicRanges: ItalicRange[] } {
  const sorted = [...findings].toSorted((a, b) => (b.offset ?? 0) - (a.offset ?? 0))
  let result = content
  const italicRanges: ItalicRange[] = []
  for (const f of sorted) {
    const { offset, length, token } = f
    if (offset == null || length == null || !token) {
      pushUnlocated(log, f, 'data perbaikan tidak lengkap')
      continue
    }
    if (result.slice(offset, offset + length) !== token) {
      pushUnlocated(log, f, 'teks sumber sudah berubah')
      continue
    }
    if (isItalicFix(f)) {
      italicRanges.push([offset, offset + length])
      log.applied.push({
        findingId: f.id,
        pageNumber: f.pageNumber,
        category: f.category,
        ruleId: f.ruleId,
        kind: 'italic',
        before: token,
        after: token,
      })
      continue
    }
    const suggestion = f.suggestion
    if (!suggestion) {
      pushUnlocated(log, f, 'data perbaikan tidak lengkap')
      continue
    }
    result =
      result.slice(0, offset) + suggestion + result.slice(offset + length)
    const delta = suggestion.length - length
    if (delta !== 0) {
      for (const range of italicRanges) {
        if (range[0] >= offset + length) {
          range[0] += delta
          range[1] += delta
        }
      }
    }
    log.applied.push({
      findingId: f.id,
      pageNumber: f.pageNumber,
      category: f.category,
      ruleId: f.ruleId,
      kind: 'replace',
      before: token,
      after: suggestion,
    })
  }
  return {
    content: result,
    italicRanges: italicRanges.toSorted((a, b) => a[0] - b[0]),
  }
}

export function correctPages(
  pages: readonly PageText[],
  selected: readonly Finding[],
  log: ChangeLog,
): PageText[] {
  const byPage = new Map<number, Finding[]>()
  for (const f of selected) {
    if (f.pageNumber == null) {
      pushUnlocated(log, f, 'halaman tidak diketahui')
      continue
    }
    const bucket = byPage.get(f.pageNumber)
    if (bucket) bucket.push(f)
    else byPage.set(f.pageNumber, [f])
  }
  return pages.map((page) => {
    const findings = byPage.get(page.pageNumber)
    if (!findings || findings.length === 0) return page
    const { content, italicRanges } = applyFindingsToPage(
      page.content,
      findings,
      log,
    )
    return { pageNumber: page.pageNumber, content, italicRanges }
  })
}

// Split one line into docx TextRuns, marking the spans covered by italic
// ranges (given in page-content coordinates) as italic.
function lineRuns(
  line: string,
  lineStart: number,
  italicRanges: readonly ItalicRange[],
): TextRun[] {
  const lineEnd = lineStart + line.length
  const local = italicRanges
    .filter((r) => r[1] > lineStart && r[0] < lineEnd)
    .map((r): ItalicRange => [
      Math.max(0, r[0] - lineStart),
      Math.min(line.length, r[1] - lineStart),
    ])
    .toSorted((a, b) => a[0] - b[0])

  if (local.length === 0) return [new TextRun(line)]

  const runs: TextRun[] = []
  let cursor = 0
  for (const [s, e] of local) {
    if (s > cursor) runs.push(new TextRun(line.slice(cursor, s)))
    runs.push(new TextRun({ text: line.slice(s, e), italics: true }))
    cursor = e
  }
  if (cursor < line.length) runs.push(new TextRun(line.slice(cursor)))
  return runs
}

// One paragraph per source line; a page break before every page after the
// first so the rebuilt document keeps the original pagination as a rough guide.
export function buildDocxParagraphs(pages: readonly PageText[]): Paragraph[] {
  const paragraphs: Paragraph[] = []
  pages.forEach((page, pageIndex) => {
    const ranges = page.italicRanges ?? []
    let lineStart = 0
    const lines = page.content.split('\n')
    lines.forEach((line, lineIndex) => {
      paragraphs.push(
        new Paragraph({
          pageBreakBefore: pageIndex > 0 && lineIndex === 0,
          children: lineRuns(line, lineStart, ranges),
        }),
      )
      lineStart += line.length + 1
    })
  })
  return paragraphs
}

async function renderDocx(pages: readonly PageText[]): Promise<Buffer> {
  const doc = new Document({
    sections: [{ children: buildDocxParagraphs(pages) }],
  })
  return Packer.toBuffer(doc)
}

// PDF-only path: rebuild a corrected .docx from the stored per-page extracted
// text. Returns the document bytes plus the change log of what was applied.
export async function rebuildCorrectedDocx(
  evalJobId: string,
  selected: readonly Finding[],
  log: ChangeLog,
): Promise<Buffer> {
  const rows = (await db
    .select({
      pageNumber: evaluationPages.pageNumber,
      content: evaluationPages.content,
    })
    .from(evaluationPages)
    .where(eq(evaluationPages.evalJobId, evalJobId))
    .orderBy(asc(evaluationPages.pageNumber))) as PageText[]

  const corrected = correctPages(rows, selected, log)
  return renderDocx(corrected)
}
