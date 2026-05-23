import { asc, eq } from 'drizzle-orm'
import { db } from '#/db'
import { evaluationFindings, evaluationPages } from '#/db/schema'
import { env } from '#/env'
import { runEydAgent } from '#/services/evaluation/eyd/agent'
import { extractItalicWordsPerPage } from '#/services/evaluation/eyd/italic'
import { runEydRules, type EydFinding } from '#/services/evaluation/eyd/rules'
import { isEnglishWord } from '#/services/evaluation/kbbi/english'
import { isKnownWord } from '#/services/evaluation/kbbi/lookup'

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

export type ProgressReporter = (
  processed: number,
  total: number,
) => Promise<void> | void

const TOKEN_RE = /[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'-]*/g

async function checkForeignNotItalic(
  page: Page,
  italicWords: Set<string> | undefined,
): Promise<EydFinding[]> {
  const findings: EydFinding[] = []
  const seen = new Set<string>()
  for (const match of page.content.matchAll(TOKEN_RE)) {
    const token = match[0]
    if (token.length < 4) continue
    const lower = token.toLowerCase()
    if (seen.has(lower)) continue

    const isFirstOfSentence = (match.index ?? 0) === 0
    if (!isFirstOfSentence && /^[A-Z]/.test(token)) continue

    if (!(await isEnglishWord(lower))) continue

    const kbbiResult = await isKnownWord(token)
    if (kbbiResult.known && !kbbiResult.isEnglish) continue

    seen.add(lower)
    if (italicWords?.has(lower)) continue

    findings.push({
      ruleId: 'eyd.foreign-not-italic',
      severity: 'warning',
      offset: match.index ?? 0,
      length: token.length,
      message: `Istilah asing "${token}" sebaiknya ditulis miring.`,
      suggestion: null,
    })
  }
  return findings
}

export async function runEydCheck(
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

  const useAgent = shouldUseAgent()
  const total = pages.length
  await onProgress?.(0, total)

  let italicPerPage: Map<number, Set<string>>
  try {
    italicPerPage = await extractItalicWordsPerPage(evalJobId)
  } catch (err) {
    console.warn('[eyd] italic extraction failed, skipping foreign-italic rule', err)
    italicPerPage = new Map()
  }

  let totalFindings = 0
  const dedupe = new Set<string>()

  for (const [index, page] of pages.entries()) {
    const pageRows: DbFinding[] = []

    for (const f of runEydRules(page.content)) {
      const key = `${page.pageNumber}:${f.offset}:${f.ruleId}`
      if (dedupe.has(key)) continue
      dedupe.add(key)
      pageRows.push(toDbFinding(evalJobId, page, f))
    }

    for (const f of await checkForeignNotItalic(
      page,
      italicPerPage.get(page.pageNumber),
    )) {
      const key = `${page.pageNumber}:${f.offset}:${f.ruleId}`
      if (dedupe.has(key)) continue
      dedupe.add(key)
      pageRows.push(toDbFinding(evalJobId, page, f))
    }

    if (useAgent) {
      for (const f of await runEydAgent(page.content)) {
        const key = `${page.pageNumber}:${f.offset}:${f.ruleId}`
        if (dedupe.has(key)) continue
        dedupe.add(key)
        pageRows.push(toDbFinding(evalJobId, page, f))
      }
    }

    if (pageRows.length) {
      await db.insert(evaluationFindings).values(pageRows)
      totalFindings += pageRows.length
    }

    await onProgress?.(index + 1, total)
  }

  return totalFindings
}
