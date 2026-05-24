import { lt } from 'drizzle-orm'
import { db } from '#/db'
import { evaluationJobs, jobs } from '#/db/schema'
import { env } from '#/env'

// Daily retention job. Deletes jobs (and via FK cascade their pages,
// citations, source_pdfs, source_pages, source_window_embeddings,
// passage_match_batches, passage_matches) and evaluation_jobs older
// than JOB_RETENTION_DAYS. Keeps disk and pg state bounded on a
// shared public VPS without manual housekeeping.

const ONE_DAY_MS = 24 * 60 * 60 * 1000

export interface RetentionRunResult {
  deletedJobs: number
  deletedEvaluationJobs: number
  thresholdIso: string
  durationMs: number
}

export async function runRetention(): Promise<RetentionRunResult> {
  const startedAt = Date.now()
  const threshold = new Date(
    Date.now() - env.JOB_RETENTION_DAYS * ONE_DAY_MS,
  )

  const [deletedJobs, deletedEval] = await Promise.all([
    db
      .delete(jobs)
      .where(lt(jobs.createdAt, threshold))
      .returning({ id: jobs.id }),
    db
      .delete(evaluationJobs)
      .where(lt(evaluationJobs.createdAt, threshold))
      .returning({ id: evaluationJobs.id }),
  ])

  return {
    deletedJobs: deletedJobs.length,
    deletedEvaluationJobs: deletedEval.length,
    thresholdIso: threshold.toISOString(),
    durationMs: Date.now() - startedAt,
  }
}

let scheduled = false

export function scheduleRetention(): void {
  if (scheduled) return
  scheduled = true

  // Fire-and-forget initial run a minute after boot so we don't slow
  // first-request latency, then once every 24 hours.
  const initialDelayMs = 60 * 1000
  setTimeout(() => {
    runRetention()
      .then((r) =>
        console.log(
          `[retention] initial sweep: deleted ${r.deletedJobs} track + ${r.deletedEvaluationJobs} evaluation jobs older than ${r.thresholdIso} in ${r.durationMs}ms`,
        ),
      )
      .catch((err) =>
        console.error('[retention] initial sweep failed', err),
      )
  }, initialDelayMs).unref()

  setInterval(() => {
    runRetention()
      .then((r) =>
        console.log(
          `[retention] daily sweep: deleted ${r.deletedJobs} track + ${r.deletedEvaluationJobs} evaluation jobs older than ${r.thresholdIso} in ${r.durationMs}ms`,
        ),
      )
      .catch((err) =>
        console.error('[retention] daily sweep failed', err),
      )
  }, ONE_DAY_MS).unref()
}
