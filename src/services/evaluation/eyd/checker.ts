import { asc, eq } from 'drizzle-orm'
import { db } from '#/db'
import { evaluationFindings, evaluationPages } from '#/db/schema'
import { analyzeEyd } from '#/services/evaluation/eyd/analyzer'
import { stripLoneSurrogates } from '#/services/evaluation/text-utils'

type DbFinding = typeof evaluationFindings.$inferInsert
type Row = {
  pageNumber: number
  content: string
  codeRanges: unknown
  italicRanges: unknown
}

const buildExcerpt = (content: string, offset: number, length: number): string => {
  const start = Math.max(0, offset - 30)
  const end = Math.min(content.length, offset + length + 30)
  return content.slice(start, end).replace(/\s+/g, ' ').trim()
}

const parseRanges = (value: unknown): Array<[number, number]> => {
  if (!value) return []
  if (Array.isArray(value)) return value as Array<[number, number]>
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? (parsed as Array<[number, number]>) : []
    } catch {
      return []
    }
  }
  return []
}

export type ProgressReporter = (
  processed: number,
  total: number,
) => Promise<void> | void

export async function runEydCheck(
  evalJobId: string,
  onProgress?: ProgressReporter,
): Promise<number> {
  const rows = (await db
    .select({
      pageNumber: evaluationPages.pageNumber,
      content: evaluationPages.content,
      codeRanges: evaluationPages.codeRanges,
      italicRanges: evaluationPages.italicRanges,
    })
    .from(evaluationPages)
    .where(eq(evaluationPages.evalJobId, evalJobId))
    .orderBy(asc(evaluationPages.pageNumber))) as Row[]

  if (!rows.length) return 0

  const pages: AnalyzedPage[] = rows.map((r) => ({
    pageNumber: r.pageNumber,
    content: r.content,
    codeRanges: parseRanges(r.codeRanges),
    italicRanges: parseRanges(r.italicRanges),
  }))

  const total = pages.length
  await onProgress?.(0, total)

  const allFindings = await analyzeEyd(pages)
  const dedupe = new Set<string>()
  let totalFindings = 0

  for (const [index, page] of pages.entries()) {
    const pageFindings = allFindings.filter(
      (f) => f.pageNumber === page.pageNumber,
    )
    const pageRows: DbFinding[] = []

    for (const f of pageFindings) {
      const key = `${page.pageNumber}:${f.offset}:${f.ruleId}`
      if (dedupe.has(key)) continue
      dedupe.add(key)
      pageRows.push({
        evalJobId,
        category: 'eyd',
        severity: f.severity,
        pageNumber: page.pageNumber,
        offset: f.offset,
        length: f.length,
        excerpt: stripLoneSurrogates(
          buildExcerpt(page.content, f.offset, f.length),
        ),
        token: stripLoneSurrogates(
          page.content.slice(f.offset, f.offset + f.length),
        ),
        message: f.message,
        suggestion: f.suggestion ?? null,
        ruleId: f.ruleId,
      })
    }

    if (pageRows.length) {
      await db.insert(evaluationFindings).values(pageRows)
      totalFindings += pageRows.length
    }

    await onProgress?.(index + 1, total)
  }

  return totalFindings
}
