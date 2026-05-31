import { Document, Packer, Paragraph, TextRun } from 'docx'
import { asc, eq } from 'drizzle-orm'
import { db } from '#/db'
import { evaluationPages } from '#/db/schema'
import type { ChangeLog, Finding } from './types'

export type PageText = { pageNumber: number; content: string }

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

// Apply selected findings to one page's text by offset splice. Findings are
// applied in descending offset order so each splice leaves the offsets of
// earlier-in-the-string findings untouched. The offset indexes exactly into
// this content (see eyd/checker.ts), so we verify content.slice(offset, +len)
// still equals the recorded token before splicing; a mismatch means the source
// drifted and the edit is recorded as unlocated rather than applied blindly.
export function applyFindingsToPage(
  content: string,
  findings: readonly Finding[],
  log: ChangeLog,
): string {
  const sorted = [...findings].toSorted((a, b) => (b.offset ?? 0) - (a.offset ?? 0))
  let result = content
  for (const f of sorted) {
    const { offset, length, suggestion, token } = f
    if (offset == null || length == null || !suggestion || !token) {
      pushUnlocated(log, f, 'data perbaikan tidak lengkap')
      continue
    }
    if (result.slice(offset, offset + length) !== token) {
      pushUnlocated(log, f, 'teks sumber sudah berubah')
      continue
    }
    result =
      result.slice(0, offset) + suggestion + result.slice(offset + length)
    log.applied.push({
      findingId: f.id,
      pageNumber: f.pageNumber,
      category: f.category,
      ruleId: f.ruleId,
      before: token,
      after: suggestion,
    })
  }
  return result
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
    return {
      pageNumber: page.pageNumber,
      content: applyFindingsToPage(page.content, findings, log),
    }
  })
}

// One paragraph per source line; a page break before every page after the
// first so the rebuilt document keeps the original pagination as a rough guide.
export function buildDocxParagraphs(pages: readonly PageText[]): Paragraph[] {
  const paragraphs: Paragraph[] = []
  pages.forEach((page, pageIndex) => {
    const lines = page.content.split('\n')
    lines.forEach((line, lineIndex) => {
      paragraphs.push(
        new Paragraph({
          pageBreakBefore: pageIndex > 0 && lineIndex === 0,
          children: [new TextRun(line)],
        }),
      )
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
