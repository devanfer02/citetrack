import { eq, lt } from 'drizzle-orm'
import { db } from '#/db'
import { configurations, evaluationJobs, jobs } from '#/db/schema'
import { env } from '#/env'
import {
  CONFIG_DEFAULTS,
  CONFIG_DESCRIPTIONS,
} from '#/lib/configurations'
import {
  clearConfigCache,
  getConfig,
} from '#/services/configurations-cache'

// Daily retention job. Deletes jobs (and via FK cascade their pages,
// citations, source_pdfs, source_pages, source_window_embeddings,
// passage_match_batches, passage_matches) and evaluation_jobs older
// than the value at configurations.purge.retention_days. Keeps disk
// and pg state bounded on a shared public VPS without manual
// housekeeping.
//
// Source of truth is the DB row, so the same number governs both the
// daily sweep and the "Bersihkan sekarang" button in /settings. On
// first boot when no row exists, we seed it from env.JOB_RETENTION_DAYS
// once; after that the DB wins.

const ONE_DAY_MS = 24 * 60 * 60 * 1000

export interface RetentionRunResult {
  deletedJobs: number
  deletedEvaluationJobs: number
  thresholdIso: string
  durationMs: number
}

export async function ensureRetentionConfigSeeded(): Promise<void> {
  const [row] = await db
    .select({ code: configurations.code })
    .from(configurations)
    .where(eq(configurations.code, 'purge.retention_days'))
    .limit(1)
  if (row) return

  const seedValue =
    env.JOB_RETENTION_DAYS ?? CONFIG_DEFAULTS['purge.retention_days']
  await db
    .insert(configurations)
    .values({
      code: 'purge.retention_days',
      value: seedValue,
      description: CONFIG_DESCRIPTIONS['purge.retention_days'],
    })
    .onConflictDoNothing()
  clearConfigCache()
}

export async function runRetention(): Promise<RetentionRunResult> {
  const startedAt = Date.now()
  await ensureRetentionConfigSeeded()
  const retentionDays = await getConfig('purge.retention_days')
  const threshold = new Date(Date.now() - retentionDays * ONE_DAY_MS)

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
