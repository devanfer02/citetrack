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

export type TrackHistoryItem = {
  kind: 'track'
  id: string
  filename: string
  status: 'pending' | 'extracting' | 'done' | 'failed'
  createdAt: Date
  totalPages: number | null
  error: string | null
  totalCitations: number
  matchedCitations: number
  passagesFound: number
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
        createdAt: jobs.createdAt,
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
    createdAt: r.createdAt,
    totalPages: r.totalPages,
    error: r.error,
    totalCitations: citationMap.get(r.id) ?? 0,
    matchedCitations: matchedMap.get(r.id) ?? 0,
    passagesFound: passageMap.get(r.id) ?? 0,
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
        overallScore: evaluationSummary.overallScore,
        kbbiErrors: evaluationSummary.kbbiErrorCount,
        eydErrors: evaluationSummary.eydErrorCount,
        filkomErrors: evaluationSummary.filkomErrorCount,
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
    overallScore: r.overallScore,
    errorCount:
      r.kbbiErrors !== null &&
      r.eydErrors !== null &&
      r.filkomErrors !== null
        ? r.kbbiErrors + r.eydErrors + r.filkomErrors
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

export const getHistoryPage = createServerFn({ method: 'GET' })
  .inputValidator(historyQuerySchema)
  .handler(({ data: { kind, page } }): Promise<HistoryPage> => {
    return kind === 'track' ? getTrackPage(page) : getEvaluationPage(page)
  })
