import { eq } from 'drizzle-orm'
import { db } from '#/db'
import { jobs, pages } from '#/db/schema'
import { env } from '#/env'
import { withJobSlot } from '#/lib/concurrency'
import { claimJob, withHeartbeat } from '#/lib/jobs/heartbeat'
import { getErrorMessage } from '#/lib/utils'

// The unit of Track work, decoupled from any HTTP request: read the
// saved PDF, extract text, persist pages. Safe to re-run — it clears
// prior pages first, so a recovery sweep can resume a stranded job
// without duplicating rows.
async function extractTrackJob(jobId: string): Promise<void> {
  const { readFile } = await import('node:fs/promises')
  const { paths } = await import('#/lib/paths')
  const { extractPdfText } = await import('#/services/pdf/extractor')

  await db
    .update(jobs)
    .set({ status: 'extracting', error: null })
    .where(eq(jobs.id, jobId))

  try {
    await db.delete(pages).where(eq(pages.jobId, jobId))

    const fileBuffer = await readFile(paths.userPdf(jobId))
    const result = await extractPdfText(new Uint8Array(fileBuffer))

    if (result.totalPages > env.MAX_PDF_PAGES) {
      throw new Error(
        `PDF terlalu besar: ${result.totalPages} halaman (maksimal ${env.MAX_PDF_PAGES}). ` +
          `Untuk dokumen lebih panjang, gunakan instalasi CiteTrack lokal.`,
      )
    }

    if (result.pages.length > 0) {
      await db.insert(pages).values(
        result.pages.map((page) => ({
          jobId,
          pageNumber: page.pageNumber,
          content: page.content,
          charCount: page.charCount,
          lowTextDensity: page.lowTextDensity ? 1 : 0,
        })),
      )
    }

    await db
      .update(jobs)
      .set({
        status: 'done',
        totalPages: result.totalPages,
        extractedPages: result.pages.length,
        scannedWarning: result.scannedWarning,
      })
      .where(eq(jobs.id, jobId))
  } catch (err) {
    const message = getErrorMessage(err, 'Extraction failed')
    await db
      .update(jobs)
      .set({ status: 'failed', error: message })
      .where(eq(jobs.id, jobId))
    throw new Error(message, { cause: err })
  }
}

// Claim + run a Track job under the concurrency semaphore with a live
// heartbeat. Returns silently if another runner already owns the job.
export async function runTrackJob(jobId: string): Promise<void> {
  if (!(await claimJob(jobs, jobId))) return
  await withHeartbeat(jobs, jobId, () => withJobSlot(() => extractTrackJob(jobId)))
}

// Fire-and-forget dispatch. The HTTP handler calls this and returns
// immediately so the work survives the browser tab closing.
export function dispatchTrackJob(jobId: string): void {
  setImmediate(() => {
    runTrackJob(jobId).catch((err) => {
      console.error('[track] background job failed', jobId, err)
    })
  })
}
