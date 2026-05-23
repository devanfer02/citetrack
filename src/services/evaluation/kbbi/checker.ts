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

export async function runKbbiCheck(evalJobId: string): Promise<number> {
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
  const rows: Array<typeof evaluationFindings.$inferInsert> = []

  for (const page of pages) {
    if (page.pageNumber < startPage) continue

    const unknown = await findUnknownTokens(page.content, 16)
    const seen = new Set<string>()

    for (const { token, offset } of unknown) {
      if (seen.has(token)) continue
      seen.add(token)

      rows.push({
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
  }

  if (rows.length) {
    await db.insert(evaluationFindings).values(rows)
  }

  return rows.length
}
