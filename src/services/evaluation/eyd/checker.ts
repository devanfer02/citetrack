import { asc, eq } from 'drizzle-orm'
import { db } from '#/db'
import { evaluationFindings, evaluationPages } from '#/db/schema'
import { env } from '#/env'
import { runEydAgent } from '#/services/evaluation/eyd/agent'
import { runEydRules, type EydFinding } from '#/services/evaluation/eyd/rules'

type Page = { pageNumber: number; content: string }
type DbFinding = typeof evaluationFindings.$inferInsert

const shouldUseAgent = (): boolean => env.MATCHER_STRATEGY === 'agent'

const buildExcerpt = (content: string, offset: number, length: number): string => {
  const start = Math.max(0, offset - 30)
  const end = Math.min(content.length, offset + length + 30)
  return content.slice(start, end).replace(/\s+/g, ' ').trim()
}

const toDbFinding = (
  evalJobId: string,
  page: Page,
  f: EydFinding,
): DbFinding => ({
  evalJobId,
  category: 'eyd',
  severity: f.severity,
  pageNumber: page.pageNumber,
  offset: f.offset,
  length: f.length,
  excerpt: buildExcerpt(page.content, f.offset, f.length),
  message: f.message,
  suggestion: f.suggestion ?? null,
  ruleId: f.ruleId,
})

export async function runEydCheck(evalJobId: string): Promise<number> {
  const pages = await db
    .select({
      pageNumber: evaluationPages.pageNumber,
      content: evaluationPages.content,
    })
    .from(evaluationPages)
    .where(eq(evaluationPages.evalJobId, evalJobId))
    .orderBy(asc(evaluationPages.pageNumber))

  if (!pages.length) return 0

  const useAgent = shouldUseAgent()
  const allRows: DbFinding[] = []
  const dedupe = new Set<string>()

  for (const page of pages) {
    const ruleFindings = runEydRules(page.content)
    for (const f of ruleFindings) {
      const key = `${page.pageNumber}:${f.offset}:${f.ruleId}`
      if (dedupe.has(key)) continue
      dedupe.add(key)
      allRows.push(toDbFinding(evalJobId, page, f))
    }

    if (useAgent) {
      const agentFindings = await runEydAgent(page.content)
      for (const f of agentFindings) {
        const key = `${page.pageNumber}:${f.offset}:${f.ruleId}`
        if (dedupe.has(key)) continue
        dedupe.add(key)
        allRows.push(toDbFinding(evalJobId, page, f))
      }
    }
  }

  if (allRows.length) {
    await db.insert(evaluationFindings).values(allRows)
  }
  return allRows.length
}
