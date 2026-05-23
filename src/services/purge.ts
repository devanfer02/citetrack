import { readdir, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { and, inArray, lt } from 'drizzle-orm'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { db } from '#/db'
import { evaluationJobs, jobs, sourcePdfs } from '#/db/schema'
import { assertLocalOnly } from '#/env'
import { paths } from '#/lib/paths'
import { getConfig } from '#/services/configurations-cache'

export type PurgeResult = {
  trackJobsDeleted: number
  evaluationJobsDeleted: number
  sourcePdfsDeleted: number
  filesDeleted: number
  bytesFreed: number
  orphanFilesDeleted: number
  orphanBytesFreed: number
}

export type PruneAllResult = {
  trackJobsDeleted: number
  evaluationJobsDeleted: number
  sourcePdfsDeleted: number
  filesDeleted: number
  bytesFreed: number
}

export const PRUNE_ALL_CONFIRMATION = 'confirm prune'

async function statSize(path: string): Promise<number | null> {
  try {
    const s = await stat(path)
    return s.isFile() ? s.size : null
  } catch {
    return null
  }
}

async function removeFile(path: string): Promise<number> {
  const size = await statSize(path)
  if (size === null) return 0
  await rm(path, { force: true })
  return size
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function parseUserFilename(name: string): string | null {
  if (!name.endsWith('.pdf')) return null
  const base = name.slice(0, -'.pdf'.length)
  const id = base.replace(/_(original|preview)$/, '')
  return UUID_RE.test(id) ? id : null
}

function parseEvaluationFilename(name: string): string | null {
  if (!name.endsWith('.pdf')) return null
  const id = name.slice(0, -'.pdf'.length)
  return UUID_RE.test(id) ? id : null
}

function parseSourceFilename(name: string): number | null {
  if (!name.endsWith('.pdf')) return null
  const base = name.slice(0, -'.pdf'.length)
  if (!/^\d+$/.test(base)) return null
  const n = Number.parseInt(base, 10)
  return Number.isInteger(n) && n > 0 ? n : null
}

async function safeReaddir(dir: string): Promise<string[]> {
  try {
    return await readdir(dir)
  } catch {
    return []
  }
}

async function sweepOrphans(
  dir: string,
  cutoffMs: number,
  isReferenced: (name: string) => boolean,
): Promise<{ count: number; bytes: number }> {
  const entries = await safeReaddir(dir)
  let count = 0
  let bytes = 0
  for (const name of entries) {
    if (isReferenced(name)) continue
    const full = join(dir, name)
    let info
    try {
      info = await stat(full)
    } catch {
      continue
    }
    if (!info.isFile()) continue
    if (info.mtimeMs > cutoffMs) continue
    bytes += info.size
    await rm(full, { force: true })
    count += 1
  }
  return { count, bytes }
}

export const purgeHistory = createServerFn({ method: 'POST' }).handler(
  async (): Promise<PurgeResult> => {
    assertLocalOnly()

    const [retentionDays, orphanGraceHours] = await Promise.all([
      getConfig('purge.retention_days'),
      getConfig('purge.orphan_grace_hours'),
    ])

    const now = Date.now()
    const retentionCutoff = new Date(now - retentionDays * 24 * 60 * 60 * 1000)
    const orphanCutoffMs = now - orphanGraceHours * 60 * 60 * 1000

    const expiredTrackJobs = await db
      .select({ id: jobs.id })
      .from(jobs)
      .where(
        and(
          inArray(jobs.status, ['done', 'failed']),
          lt(jobs.updatedAt, retentionCutoff),
        ),
      )
    const trackJobIds = expiredTrackJobs.map((r) => r.id)

    const expiredEvalJobs = await db
      .select({ id: evaluationJobs.id })
      .from(evaluationJobs)
      .where(
        and(
          inArray(evaluationJobs.status, ['done', 'failed']),
          lt(evaluationJobs.updatedAt, retentionCutoff),
        ),
      )
    const evalJobIds = expiredEvalJobs.map((r) => r.id)

    const expiredSourcePdfs =
      trackJobIds.length === 0
        ? []
        : await db
            .select({ id: sourcePdfs.id })
            .from(sourcePdfs)
            .where(inArray(sourcePdfs.jobId, trackJobIds))
    const sourcePdfIds = expiredSourcePdfs.map((r) => r.id)

    let filesDeleted = 0
    let bytesFreed = 0

    for (const jobId of trackJobIds) {
      for (const p of [
        paths.userPdf(jobId),
        paths.userPdfOriginal(jobId),
        paths.userPdfPreview(jobId),
      ]) {
        const freed = await removeFile(p)
        if (freed > 0) {
          filesDeleted += 1
          bytesFreed += freed
        }
      }
    }

    for (const sourceId of sourcePdfIds) {
      const freed = await removeFile(paths.sourcePdf(sourceId))
      if (freed > 0) {
        filesDeleted += 1
        bytesFreed += freed
      }
    }

    for (const evalId of evalJobIds) {
      const freed = await removeFile(paths.evaluationPdf(evalId))
      if (freed > 0) {
        filesDeleted += 1
        bytesFreed += freed
      }
    }

    if (trackJobIds.length > 0) {
      await db.delete(jobs).where(inArray(jobs.id, trackJobIds))
    }
    if (evalJobIds.length > 0) {
      await db
        .delete(evaluationJobs)
        .where(inArray(evaluationJobs.id, evalJobIds))
    }

    const [liveTrackJobs, liveSourcePdfs, liveEvalJobs] = await Promise.all([
      db.select({ id: jobs.id }).from(jobs),
      db.select({ id: sourcePdfs.id }).from(sourcePdfs),
      db.select({ id: evaluationJobs.id }).from(evaluationJobs),
    ])
    const liveTrackSet = new Set(liveTrackJobs.map((r) => r.id))
    const liveSourceSet = new Set(liveSourcePdfs.map((r) => r.id))
    const liveEvalSet = new Set(liveEvalJobs.map((r) => r.id))

    const userSweep = await sweepOrphans(
      paths.userUploads,
      orphanCutoffMs,
      (name) => {
        const id = parseUserFilename(name)
        return id !== null && liveTrackSet.has(id)
      },
    )
    const sourceSweep = await sweepOrphans(
      paths.sourceUploads,
      orphanCutoffMs,
      (name) => {
        const id = parseSourceFilename(name)
        return id !== null && liveSourceSet.has(id)
      },
    )
    const evalSweep = await sweepOrphans(
      paths.evaluationUploads,
      orphanCutoffMs,
      (name) => {
        const id = parseEvaluationFilename(name)
        return id !== null && liveEvalSet.has(id)
      },
    )

    return {
      trackJobsDeleted: trackJobIds.length,
      evaluationJobsDeleted: evalJobIds.length,
      sourcePdfsDeleted: sourcePdfIds.length,
      filesDeleted,
      bytesFreed,
      orphanFilesDeleted:
        userSweep.count + sourceSweep.count + evalSweep.count,
      orphanBytesFreed:
        userSweep.bytes + sourceSweep.bytes + evalSweep.bytes,
    }
  },
)

const pruneAllInput = z.object({
  confirmation: z.literal(PRUNE_ALL_CONFIRMATION),
})

async function wipeDir(dir: string): Promise<{ count: number; bytes: number }> {
  let count = 0
  let bytes = 0
  for (const name of await safeReaddir(dir)) {
    const full = join(dir, name)
    let info
    try {
      info = await stat(full)
    } catch {
      continue
    }
    if (!info.isFile()) continue
    bytes += info.size
    await rm(full, { force: true })
    count += 1
  }
  return { count, bytes }
}

// Hard reset: wipe every job, PDF, finding, and orphan upload regardless
// of status or retention window. Intended for local dev resets — the
// caller must pass the literal `confirm prune` string and the route is
// gated to local environments by assertLocalOnly.
export const pruneAll = createServerFn({ method: 'POST' })
  .inputValidator(pruneAllInput)
  .handler(async (): Promise<PruneAllResult> => {
    assertLocalOnly()

    const [allTrackJobs, allEvalJobs, allSourcePdfs] = await Promise.all([
      db.select({ id: jobs.id }).from(jobs),
      db.select({ id: evaluationJobs.id }).from(evaluationJobs),
      db.select({ id: sourcePdfs.id }).from(sourcePdfs),
    ])

    let filesDeleted = 0
    let bytesFreed = 0
    const trackSweep = await wipeDir(paths.userUploads)
    const sourceSweep = await wipeDir(paths.sourceUploads)
    const evalSweep = await wipeDir(paths.evaluationUploads)
    filesDeleted += trackSweep.count + sourceSweep.count + evalSweep.count
    bytesFreed += trackSweep.bytes + sourceSweep.bytes + evalSweep.bytes

    // ON DELETE CASCADE on jobs/evaluation_jobs takes care of citations,
    // references, matches, pages, findings, summaries, etc.
    if (allTrackJobs.length > 0) {
      await db.delete(jobs)
    }
    if (allEvalJobs.length > 0) {
      await db.delete(evaluationJobs)
    }

    return {
      trackJobsDeleted: allTrackJobs.length,
      evaluationJobsDeleted: allEvalJobs.length,
      sourcePdfsDeleted: allSourcePdfs.length,
      filesDeleted,
      bytesFreed,
    }
  })
