import { and, eq, inArray, lt, sql } from 'drizzle-orm'
import { db } from '#/db'
import { evaluationJobs, jobs } from '#/db/schema'
import { MAX_ATTEMPTS, RECOVERY_INTERVAL_MS, STALE_MS } from '#/lib/jobs/heartbeat'

// Recovery sweep for stranded background jobs. A job is "stranded" when
// it sits in a non-terminal status but its heartbeat (or, before it ever
// ran, its updatedAt) hasn't advanced within STALE_MS — meaning the
// process that owned it crashed, restarted, or had its request aborted.
//
// Stranded jobs under the attempt cap are re-dispatched (the runners
// claim atomically, so a sweep racing a live runner is harmless). Jobs
// that have already burned MAX_ATTEMPTS are marked failed so a genuinely
// bad PDF can't loop forever.

const RETRY_EXHAUSTED_MESSAGE =
  'Gagal diproses setelah beberapa percobaan. Coba unggah ulang.'

export interface JobRecoveryResult {
  trackRequeued: number
  trackFailed: number
  evaluationRequeued: number
  evaluationFailed: number
}

export interface StaleJob {
  id: string
  attempts: number
}

// Splits stranded jobs into those worth re-dispatching and those that
// have burned the attempt budget. Pure so the cap boundary (a job at
// exactly MAX_ATTEMPTS must fail, not loop) is unit-testable without a DB.
export function partitionStaleJobs(rows: StaleJob[]): {
  requeue: string[]
  fail: string[]
} {
  const requeue: string[] = []
  const fail: string[] = []
  for (const row of rows) {
    if (row.attempts >= MAX_ATTEMPTS) fail.push(row.id)
    else requeue.push(row.id)
  }
  return { requeue, fail }
}

export async function runJobRecovery(): Promise<JobRecoveryResult> {
  const staleBefore = new Date(Date.now() - STALE_MS)

  const [staleTrack, staleEval] = await Promise.all([
    db
      .select({ id: jobs.id, attempts: jobs.attempts })
      .from(jobs)
      .where(
        and(
          inArray(jobs.status, ['pending', 'extracting']),
          lt(
            sql`coalesce(${jobs.heartbeatAt}, ${jobs.updatedAt})`,
            staleBefore,
          ),
        ),
      ),
    db
      .select({ id: evaluationJobs.id, attempts: evaluationJobs.attempts })
      .from(evaluationJobs)
      .where(
        and(
          inArray(evaluationJobs.status, ['pending', 'extracting', 'analyzing']),
          lt(
            sql`coalesce(${evaluationJobs.heartbeatAt}, ${evaluationJobs.updatedAt})`,
            staleBefore,
          ),
        ),
      ),
  ])

  const result: JobRecoveryResult = {
    trackRequeued: 0,
    trackFailed: 0,
    evaluationRequeued: 0,
    evaluationFailed: 0,
  }

  const track = partitionStaleJobs(staleTrack)
  const { dispatchTrackJob } = await import('#/services/pdf/job-runner')
  for (const id of track.fail) {
    await db
      .update(jobs)
      .set({ status: 'failed', error: RETRY_EXHAUSTED_MESSAGE, heartbeatAt: null })
      .where(eq(jobs.id, id))
  }
  for (const id of track.requeue) dispatchTrackJob(id)
  result.trackFailed = track.fail.length
  result.trackRequeued = track.requeue.length

  const evaluation = partitionStaleJobs(staleEval)
  const { dispatchEvaluationJob } = await import(
    '#/services/evaluation/job-runner'
  )
  for (const id of evaluation.fail) {
    await db
      .update(evaluationJobs)
      .set({
        status: 'failed',
        error: RETRY_EXHAUSTED_MESSAGE,
        currentStep: null,
        heartbeatAt: null,
      })
      .where(eq(evaluationJobs.id, id))
  }
  for (const id of evaluation.requeue) dispatchEvaluationJob(id)
  result.evaluationFailed = evaluation.fail.length
  result.evaluationRequeued = evaluation.requeue.length

  return result
}

let scheduled = false

function logSweep(label: string, r: JobRecoveryResult): void {
  console.log(
    `[job-recovery] ${label}: requeued ${r.trackRequeued} track + ${r.evaluationRequeued} evaluation, ` +
      `failed ${r.trackFailed} track + ${r.evaluationFailed} evaluation`,
  )
}

export function scheduleJobRecovery(): void {
  if (scheduled) return
  scheduled = true

  // Initial sweep shortly after boot catches jobs the previous process
  // abandoned on restart. Delayed so it doesn't compete with first-request
  // warmup.
  setTimeout(() => {
    runJobRecovery()
      .then((r) => logSweep('boot sweep', r))
      .catch((err) => console.error('[job-recovery] boot sweep failed', err))
  }, 15_000).unref()

  setInterval(() => {
    runJobRecovery()
      .then((r) => logSweep('sweep', r))
      .catch((err) => console.error('[job-recovery] sweep failed', err))
  }, RECOVERY_INTERVAL_MS).unref()
}
