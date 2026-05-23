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
  const pageCount = bodyPages.length
  const PROGRESS_SCALE = 100
  const PROGRESS_THROTTLE_MS = 500
  const total = pageCount * PROGRESS_SCALE

  await onProgress?.(0, total)

  let totalFindings = 0
  let lastProgressAt = 0
  let lastProgressValue = -1
  const reportProgress = async (value: number, force = false): Promise<void> => {
    if (!onProgress) return
    const now = Date.now()
    if (
      !force &&
      (value === lastProgressValue ||
        now - lastProgressAt < PROGRESS_THROTTLE_MS)
    ) {
      return
    }
    lastProgressAt = now
    lastProgressValue = value
    await onProgress(value, total)
  }

  for (const [index, page] of bodyPages.entries()) {
    const base = index * PROGRESS_SCALE
    const unknown = await findUnknownTokens(page.content, 8, (processed, totalTokens) => {
      if (totalTokens === 0) return
      const within = Math.floor((processed / totalTokens) * PROGRESS_SCALE)
      return reportProgress(base + within)
    })
    const seen = new Set<string>()
    const pageRows: Array<typeof evaluationFindings.$inferInsert> = []

    for (const { token, offset, databaseOnly } of unknown) {
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
        message: databaseOnly
          ? `Kata "${token}" evaluated using database only`
          : `Kata "${token}" tidak ditemukan di KBBI`,
        ruleId: databaseOnly ? 'kbbi.unknown-word.database-only' : 'kbbi.unknown-word',
      })
    }

    if (pageRows.length) {
      await db.insert(evaluationFindings).values(pageRows)
      totalFindings += pageRows.length
    }

    await reportProgress((index + 1) * PROGRESS_SCALE, true)
  }

  return totalFindings
}
