import { asc, eq } from 'drizzle-orm'
import { db } from '#/db'
import { evaluationFindings, evaluationPages } from '#/db/schema'
import { findUnknownTokens } from '#/services/evaluation/kbbi/lookup'

const BAB_ONE_RE = /\bBAB\s*1\b/i

const findFirstBabPage = (
  pages: Array<{ pageNumber: number; content: string }>,
): number => {
  for (const page of pages) {
    if (BAB_ONE_RE.test(page.content)) return page.pageNumber
  }
  return 1
}

const buildExcerpt = (content: string, offset: number, token: string): string => {
  const start = Math.max(0, offset - 30)
  const end = Math.min(content.length, offset + token.length + 30)
  return content.slice(start, end).replace(/\s+/g, ' ').trim()
}

export type ProgressReporter = (
  processed: number,
  total: number,
) => Promise<void> | void

export async function runKbbiCheck(
  evalJobId: string,
  onProgress?: ProgressReporter,
): Promise<number> {
  const pages = await db
    .select({
      pageNumber: evaluationPages.pageNumber,
      content: evaluationPages.content,
    })
    .from(evaluationPages)
    .where(eq(evaluationPages.evalJobId, evalJobId))
    .orderBy(asc(evaluationPages.pageNumber))

  if (!pages.length) return 0

  const startPage = findFirstBabPage(pages)
  const bodyPages = pages.filter((p) => p.pageNumber >= startPage)
  const total = bodyPages.length

  await onProgress?.(0, total)

  let totalFindings = 0
  for (const [index, page] of bodyPages.entries()) {
    const unknown = await findUnknownTokens(page.content, 16)
    const seen = new Set<string>()
    const pageRows: Array<typeof evaluationFindings.$inferInsert> = []

    for (const { token, offset } of unknown) {
      if (seen.has(token)) continue
      seen.add(token)
      pageRows.push({
        evalJobId,
        category: 'kbbi',
        severity: 'warning',
        pageNumber: page.pageNumber,
        offset,
        length: token.length,
        excerpt: buildExcerpt(page.content, offset, token),
        message: `Kata "${token}" tidak ditemukan di KBBI`,
        ruleId: 'kbbi.unknown-word',
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
