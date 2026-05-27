import { and, eq, isNull, lt, or, sql } from 'drizzle-orm'
import { db } from '#/db'
import type { evaluationJobs, jobs } from '#/db/schema'

// Tunables for the background-job lifecycle. Module constants rather
// than env vars: these are operational knobs that rarely change and
// don't belong in per-deploy config. STALE_MS matches the passage-batch
// STALE_RUNNING_MS so "stuck" means the same thing across the app.
export const HEARTBEAT_MS = 10_000
export const STALE_MS = 2 * 60_000
export const MAX_ATTEMPTS = 3
export const RECOVERY_INTERVAL_MS = 60_000

export type JobTable = typeof jobs | typeof evaluationJobs

// Atomically claim a new or stranded job: bump `attempts` and stamp
// `heartbeatAt`, but only if nobody else holds a fresh heartbeat. The
// WHERE clause is the real concurrency guard — if two dispatchers race
// (e.g. the upload handler and a recovery sweep), only one UPDATE
// matches and the loser gets an empty result and skips.
export async function claimJob(table: JobTable, id: string): Promise<boolean> {
  const staleBefore = new Date(Date.now() - STALE_MS)
  const claimed = await db
    .update(table)
    .set({ heartbeatAt: new Date(), attempts: sql`${table.attempts} + 1` })
    .where(
      and(
        eq(table.id, id),
        or(isNull(table.heartbeatAt), lt(table.heartbeatAt, staleBefore)),
      ),
    )
    .returning({ id: table.id })
  return claimed.length > 0
}

export async function clearHeartbeat(
  table: JobTable,
  id: string,
): Promise<void> {
  await db.update(table).set({ heartbeatAt: null }).where(eq(table.id, id))
}

// Runs `work` while ticking the job's heartbeat every HEARTBEAT_MS, so
// the recovery sweep can tell an actively-running job from a stranded
// one. Assumes the job is already claimed. Always nulls the heartbeat on
// exit (success or failure) so a finished job is never re-grabbed.
export async function withHeartbeat<T>(
  table: JobTable,
  id: string,
  work: () => Promise<T>,
): Promise<T> {
  const timer = setInterval(() => {
    void (async () => {
      try {
        await db
          .update(table)
          .set({ heartbeatAt: new Date() })
          .where(eq(table.id, id))
      } catch {
        // Best-effort tick; a missed beat just risks an early re-claim.
      }
    })()
  }, HEARTBEAT_MS)
  timer.unref?.()
  try {
    return await work()
  } finally {
    clearInterval(timer)
    try {
      await clearHeartbeat(table, id)
    } catch {
      // If clearing fails the sweep will eventually re-evaluate by status.
    }
  }
}
