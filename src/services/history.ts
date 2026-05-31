import { and, desc, eq, inArray, ne, sql } from 'drizzle-orm'
import { createServerFn } from '@tanstack/react-start'
import { db } from '#/db'
import {
  citationMatches,
  citations,
  evaluationJobs,
  evaluationSummary,
  jobs,
  passageMatches,
} from '#/db/schema'
import { historyQuerySchema } from '#/schemas/history'
import { assertLocalOnly } from '#/env'
import { computeEvaluationScore } from '#/lib/evaluation/score'
import type { ResumablePhase } from '#/lib/pipeline/phases'

export type TrackHistoryItem = {
  kind: 'track'
  id: string
  filename: string
  status: 'pending' | 'extracting' | 'done' | 'failed'
  // How far the user progressed through the review flow. `status` only tracks
  // PDF extraction, so this is what decides whether a job is finished
  // (review-passages) or should resume mid-pipeline.
  phase: ResumablePhase
  createdAt: Date
  totalPages: number | null
  error: string | null
  totalCitations: number
  matchedCitations: number
  passagesFound: number
  durationMs: number | null
}

export type EvaluationHistoryItem = {
  kind: 'evaluation'
  id: string
  filename: string
  status: 'pending' | 'extracting' | 'analyzing' | 'done' | 'failed'
  createdAt: Date
  totalPages: number | null
  error: string | null
  overallScore: number | null
  errorCount: number | null
  durationMs: number | null
}

export type HistoryItem = TrackHistoryItem | EvaluationHistoryItem

export type HistoryPage = {
  items: HistoryItem[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export const HISTORY_PAGE_SIZE = 15

function toCountMap(
  rows: { jobId: string; count: number }[],
): Map<string, number> {
  return new Map(rows.map((r) => [r.jobId, Number(r.count)]))
}

async function getTrackPage(page: number): Promise<HistoryPage> {
  const offset = (page - 1) * HISTORY_PAGE_SIZE

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: jobs.id,
        filename: jobs.filename,
        status: jobs.status,
        phase: jobs.phase,
        createdAt: jobs.createdAt,
        updatedAt: jobs.updatedAt,
        totalPages: jobs.totalPages,
        error: jobs.error,
      })
      .from(jobs)
      .orderBy(desc(jobs.createdAt))
      .limit(HISTORY_PAGE_SIZE)
      .offset(offset),
    db
      .select({ total: sql<number>`COUNT(*)::int` })
      .from(jobs),
  ])

  const ids = rows.map((r) => r.id)
  const [citationCounts, matchedCounts, passageCounts] =
    ids.length === 0
      ? [[], [], []]
      : await Promise.all([
          db
            .select({
              jobId: citations.jobId,
              count: sql<number>`COUNT(*)::int`,
            })
            .from(citations)
            .where(inArray(citations.jobId, ids))
            .groupBy(citations.jobId),
          db
            .select({
              jobId: citationMatches.jobId,
              count: sql<number>`COUNT(*)::int`,
            })
            .from(citationMatches)
            .where(
              and(
                inArray(citationMatches.jobId, ids),
                ne(citationMatches.matchType, 'unmatched'),
              ),
            )
            .groupBy(citationMatches.jobId),
          db
            .select({
              jobId: passageMatches.jobId,
              count: sql<number>`COUNT(*)::int`,
            })
            .from(passageMatches)
            .where(inArray(passageMatches.jobId, ids))
            .groupBy(passageMatches.jobId),
        ])

  const citationMap = toCountMap(citationCounts)
  const matchedMap = toCountMap(matchedCounts)
  const passageMap = toCountMap(passageCounts)

  const items: HistoryItem[] = rows.map((r) => ({
    kind: 'track',
    id: r.id,
    filename: r.filename,
    status: r.status,
    phase: r.phase,
    createdAt: r.createdAt,
    totalPages: r.totalPages,
    error: r.error,
    totalCitations: citationMap.get(r.id) ?? 0,
    matchedCitations: matchedMap.get(r.id) ?? 0,
    passagesFound: passageMap.get(r.id) ?? 0,
    durationMs:
      r.status === 'done' || r.status === 'failed'
        ? Math.max(0, r.updatedAt.getTime() - r.createdAt.getTime())
        : null,
  }))

  return {
    items,
    total: Number(total),
    page,
    pageSize: HISTORY_PAGE_SIZE,
    totalPages: Math.max(1, Math.ceil(Number(total) / HISTORY_PAGE_SIZE)),
  }
}

async function getEvaluationPage(page: number): Promise<HistoryPage> {
  const offset = (page - 1) * HISTORY_PAGE_SIZE

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: evaluationJobs.id,
        filename: evaluationJobs.filename,
        status: evaluationJobs.status,
        createdAt: evaluationJobs.createdAt,
        totalPages: evaluationJobs.totalPages,
        error: evaluationJobs.error,
        durationMs: evaluationJobs.durationMs,
        overallScore: evaluationSummary.overallScore,
        kbbiErrors: evaluationSummary.kbbiErrorCount,
        eydErrors: evaluationSummary.eydErrorCount,
      })
      .from(evaluationJobs)
      .leftJoin(
        evaluationSummary,
        eq(evaluationJobs.id, evaluationSummary.evalJobId),
      )
      .orderBy(desc(evaluationJobs.createdAt))
      .limit(HISTORY_PAGE_SIZE)
      .offset(offset),
    db
      .select({ total: sql<number>`COUNT(*)::int` })
      .from(evaluationJobs),
  ])

  const items: HistoryItem[] = rows.map((r) => ({
    kind: 'evaluation',
    id: r.id,
    filename: r.filename,
    status: r.status,
    createdAt: r.createdAt,
    totalPages: r.totalPages,
    error: r.error,
    // Always derive the score from current counts + totalPages so old rows
    // that were stored under the broken absolute-penalty formula come up
    // correctly without a backfill.
    overallScore:
      r.kbbiErrors !== null && r.eydErrors !== null
        ? computeEvaluationScore(r.kbbiErrors, r.eydErrors, r.totalPages)
        : r.overallScore,
    errorCount:
      r.kbbiErrors !== null && r.eydErrors !== null
        ? r.kbbiErrors + r.eydErrors
        : null,
    durationMs: r.durationMs,
  }))

  return {
    items,
    total: Number(total),
    page,
    pageSize: HISTORY_PAGE_SIZE,
    totalPages: Math.max(1, Math.ceil(Number(total) / HISTORY_PAGE_SIZE)),
  }
}

export const getHistoryPage = createServerFn({ method: 'GET' })
  .inputValidator(historyQuerySchema)
  .handler(({ data: { kind, page } }): Promise<HistoryPage> => {
    assertLocalOnly()
    return kind === 'track' ? getTrackPage(page) : getEvaluationPage(page)
  })
