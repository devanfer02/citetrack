import { asc, eq } from 'drizzle-orm'
import { db } from '#/db'
import { evaluationFindings, evaluationPages } from '#/db/schema'
import { analyzeKbbi } from '#/services/evaluation/kbbi/analyzer'

type Row = {
  pageNumber: number
  content: string
  codeRanges: unknown
  italicRanges: unknown
}

const buildExcerpt = (content: string, offset: number, token: string): string => {
  const start = Math.max(0, offset - 30)
  const end = Math.min(content.length, offset + token.length + 30)
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

export async function runKbbiCheck(
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

  const PROGRESS_SCALE = 100
  const total = pages.length * PROGRESS_SCALE
  await onProgress?.(0, total)

  const findings = await analyzeKbbi(pages)
  const byPage = new Map<number, typeof findings>()
  for (const f of findings) {
    const list = byPage.get(f.pageNumber)
    if (list) list.push(f)
    else byPage.set(f.pageNumber, [f])
  }

  let totalFindings = 0
  for (const [index, page] of pages.entries()) {
    const pageFindings = byPage.get(page.pageNumber) ?? []
    if (pageFindings.length) {
      await db.insert(evaluationFindings).values(
        pageFindings.map((f) => ({
          evalJobId,
          category: 'kbbi' as const,
          severity: 'warning' as const,
          pageNumber: f.pageNumber,
          offset: f.offset,
          length: f.token.length,
          excerpt: buildExcerpt(page.content, f.offset, f.token),
          token: f.token,
          message: f.message,
          suggestion: f.suggestion,
          ruleId: f.ruleId,
        })),
      )
      totalFindings += pageFindings.length
    }
    await onProgress?.((index + 1) * PROGRESS_SCALE, total)
  }

  return totalFindings
}
