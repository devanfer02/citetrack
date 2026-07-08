import { eq, sql } from 'drizzle-orm'
import { db } from '#/db'
import { evaluationFindings, evaluationJobs, evaluationPages } from '#/db/schema'
import { env } from '#/env'
import { withJobSlot } from '#/lib/concurrency'
import { claimJob, withHeartbeat } from '#/lib/jobs/heartbeat'
import { getErrorMessage } from '#/lib/utils'

async function hasExtractedPages(evalJobId: string): Promise<boolean> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(evaluationPages)
    .where(eq(evaluationPages.evalJobId, evalJobId))
  return (row?.count ?? 0) > 0
}

// CPU-heavy extraction, held under the concurrency semaphore. Idempotent:
// only runs when no pages exist yet, so a resumed job that already
// extracted skips straight to analysis.
async function extractEvaluationPages(evalJobId: string): Promise<void> {
  const { readFile } = await import('node:fs/promises')
  const { paths } = await import('#/lib/paths')
  const { extractPdfText } = await import('#/services/pdf/extractor')

  await db
    .update(evaluationJobs)
    .set({ status: 'extracting', error: null })
    .where(eq(evaluationJobs.id, evalJobId))

  try {
    const fileBuffer = await readFile(paths.evaluationPdf(evalJobId))
    const result = await extractPdfText(new Uint8Array(fileBuffer))

    if (result.totalPages > env.MAX_PDF_PAGES) {
      throw new Error(
        `PDF terlalu besar: ${result.totalPages} halaman (maksimal ${env.MAX_PDF_PAGES}). ` +
          `Untuk dokumen lebih panjang, gunakan instalasi CiteTrack lokal.`,
      )
    }

    if (result.pages.length > 0) {
      await db.insert(evaluationPages).values(
        result.pages.map((page) => ({
          evalJobId,
          pageNumber: page.pageNumber,
          content: page.content,
          charCount: page.charCount,
          lowTextDensity: page.lowTextDensity ? 1 : 0,
          codeRanges: page.codeRanges,
          italicRanges: page.italicRanges,
        })),
      )
    }

    await db
      .update(evaluationJobs)
      .set({
        totalPages: result.totalPages,
        extractedPages: result.pages.length,
      })
      .where(eq(evaluationJobs.id, evalJobId))
  } catch (err) {
    const message = getErrorMessage(err, 'Extraction failed')
    await db
      .update(evaluationJobs)
      .set({ status: 'failed', error: message })
      .where(eq(evaluationJobs.id, evalJobId))
    throw new Error(message, { cause: err })
  }
}

async function runEvaluationJobInner(evalJobId: string): Promise<void> {
  if (!(await hasExtractedPages(evalJobId))) {
    await withJobSlot(() => extractEvaluationPages(evalJobId))
  }

  // Clear any partial findings from a prior aborted analysis — the KBBI
  // and EYD checks append rather than upsert, so a resumed run would
  // otherwise double-count.
  await db
    .delete(evaluationFindings)
    .where(eq(evaluationFindings.evalJobId, evalJobId))

  const { runEvaluationAnalysis } = await import(
    '#/services/evaluation/orchestrator'
  )
  await runEvaluationAnalysis(evalJobId)
}

// Claim + run the full evaluation pipeline (extract if needed, then
// KBBI/EYD analysis) with a live heartbeat. Returns silently if another
// runner already owns the job. Analysis runs outside the semaphore since
// it is I/O-bound (dictionary scraping), matching the prior behaviour.
export async function runEvaluationJob(evalJobId: string): Promise<void> {
  if (!(await claimJob(evaluationJobs, evalJobId))) return
  await withHeartbeat(evaluationJobs, evalJobId, () =>
    runEvaluationJobInner(evalJobId),
  )
}

export function dispatchEvaluationJob(evalJobId: string): void {
  setImmediate(() => {
    runEvaluationJob(evalJobId).catch((err) => {
      console.error('[evaluation] background job failed', evalJobId, err)
    })
  })
}
