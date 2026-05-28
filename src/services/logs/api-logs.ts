import { createServerFn } from '@tanstack/react-start'
import { and, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '#/db'
import { apiCallLogs } from '#/db/schema'
import { assertLocalOnly } from '#/env'
import { API_PROVIDERS } from '#/services/logs/providers'

const outcomeFilterSchema = z.enum(['all', 'errors', 'success', 'aborted'])

const listInputSchema = z.object({
  provider: z.array(z.enum(API_PROVIDERS)).optional(),
  outcome: outcomeFilterSchema.default('all'),
  trackJobId: z.string().uuid().optional(),
  evalJobId: z.string().uuid().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  pageSize: z.number().int().min(1).max(200).default(50),
  page: z.number().int().min(1).default(1),
})

export const listApiCallLogs = createServerFn({ method: 'GET' })
  .inputValidator(listInputSchema)
  .handler(async ({ data }) => {
    assertLocalOnly()
    const conditions = []

    if (data.provider && data.provider.length > 0) {
      conditions.push(inArray(apiCallLogs.provider, data.provider))
    }

    if (data.outcome === 'errors') {
      conditions.push(
        inArray(apiCallLogs.outcome, ['http_error', 'network_error', 'timeout']),
      )
    } else if (data.outcome === 'success') {
      conditions.push(eq(apiCallLogs.outcome, 'success'))
    } else if (data.outcome === 'aborted') {
      conditions.push(eq(apiCallLogs.outcome, 'aborted'))
    }

    if (data.trackJobId) {
      conditions.push(eq(apiCallLogs.trackJobId, data.trackJobId))
    }
    if (data.evalJobId) {
      conditions.push(eq(apiCallLogs.evalJobId, data.evalJobId))
    }
    if (data.from) {
      conditions.push(gte(apiCallLogs.createdAt, new Date(data.from)))
    }
    if (data.to) {
      conditions.push(lte(apiCallLogs.createdAt, new Date(data.to)))
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined
    const offset = (data.page - 1) * data.pageSize

    const [rows, [{ total }]] = await Promise.all([
      db
        .select({
          id: apiCallLogs.id,
          createdAt: apiCallLogs.createdAt,
          provider: apiCallLogs.provider,
          method: apiCallLogs.method,
          url: apiCallLogs.url,
          status: apiCallLogs.status,
          outcome: apiCallLogs.outcome,
          durationMs: apiCallLogs.durationMs,
          errorMessage: apiCallLogs.errorMessage,
          bodySizeBytes: apiCallLogs.bodySizeBytes,
          bodyTruncated: apiCallLogs.bodyTruncated,
          trackJobId: apiCallLogs.trackJobId,
          evalJobId: apiCallLogs.evalJobId,
        })
        .from(apiCallLogs)
        .where(where)
        .orderBy(desc(apiCallLogs.createdAt), desc(apiCallLogs.id))
        .limit(data.pageSize)
        .offset(offset),
      db
        .select({ total: sql<number>`COUNT(*)::int` })
        .from(apiCallLogs)
        .where(where),
    ])

    const totalCount = Number(total)
    const totalPages = Math.max(1, Math.ceil(totalCount / data.pageSize))

    return {
      rows,
      total: totalCount,
      page: data.page,
      pageSize: data.pageSize,
      totalPages,
    }
  })

// Stats deliberately ignore the `outcome` filter: when a user filters
// the table to "errors only", they still want to see the success
// count for context ("12 errors out of 800 calls" reads very different
// from "12 errors out of 12").
const statsInputSchema = z.object({
  provider: z.array(z.enum(API_PROVIDERS)).optional(),
  trackJobId: z.string().uuid().optional(),
  evalJobId: z.string().uuid().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
})

export const getApiCallLogStats = createServerFn({ method: 'GET' })
  .inputValidator(statsInputSchema)
  .handler(async ({ data }) => {
    assertLocalOnly()
    const conditions = []

    if (data.provider && data.provider.length > 0) {
      conditions.push(inArray(apiCallLogs.provider, data.provider))
    }
    if (data.trackJobId) {
      conditions.push(eq(apiCallLogs.trackJobId, data.trackJobId))
    }
    if (data.evalJobId) {
      conditions.push(eq(apiCallLogs.evalJobId, data.evalJobId))
    }
    if (data.from) {
      conditions.push(gte(apiCallLogs.createdAt, new Date(data.from)))
    }
    if (data.to) {
      conditions.push(lte(apiCallLogs.createdAt, new Date(data.to)))
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined

    const [byOutcomeRows, byProviderRows, durationRow] = await Promise.all([
      db
        .select({
          outcome: apiCallLogs.outcome,
          count: sql<number>`COUNT(*)::int`,
        })
        .from(apiCallLogs)
        .where(where)
        .groupBy(apiCallLogs.outcome),
      db
        .select({
          provider: apiCallLogs.provider,
          outcome: apiCallLogs.outcome,
          count: sql<number>`COUNT(*)::int`,
        })
        .from(apiCallLogs)
        .where(where)
        .groupBy(apiCallLogs.provider, apiCallLogs.outcome),
      db
        .select({
          avgMs: sql<number>`COALESCE(AVG(${apiCallLogs.durationMs}), 0)::int`,
          p95Ms: sql<number>`COALESCE(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY ${apiCallLogs.durationMs}), 0)::int`,
        })
        .from(apiCallLogs)
        .where(where),
    ])

    const byOutcome = {
      success: 0,
      http_error: 0,
      network_error: 0,
      timeout: 0,
      aborted: 0,
    }
    for (const row of byOutcomeRows) {
      byOutcome[row.outcome] = Number(row.count)
    }
    // `aborted` is our own self-imposed lookup cap, not a failure — it counts
    // toward the total volume but is excluded from the error tally / error rate.
    const total =
      byOutcome.success +
      byOutcome.http_error +
      byOutcome.network_error +
      byOutcome.timeout +
      byOutcome.aborted
    const errors =
      byOutcome.http_error + byOutcome.network_error + byOutcome.timeout
    const errorRate = total === 0 ? 0 : errors / total

    const providerMap = new Map<
      string,
      {
        success: number
        http_error: number
        network_error: number
        timeout: number
        aborted: number
      }
    >()
    for (const row of byProviderRows) {
      const bucket = providerMap.get(row.provider) ?? {
        success: 0,
        http_error: 0,
        network_error: 0,
        timeout: 0,
        aborted: 0,
      }
      bucket[row.outcome] = Number(row.count)
      providerMap.set(row.provider, bucket)
    }
    const byProvider = [...providerMap.entries()]
      .map(([provider, counts]) => {
        const providerTotal =
          counts.success +
          counts.http_error +
          counts.network_error +
          counts.timeout +
          counts.aborted
        const providerErrors =
          counts.http_error + counts.network_error + counts.timeout
        return {
          provider,
          total: providerTotal,
          success: counts.success,
          errors: providerErrors,
          httpError: counts.http_error,
          networkError: counts.network_error,
          timeout: counts.timeout,
          aborted: counts.aborted,
          errorRate: providerTotal === 0 ? 0 : providerErrors / providerTotal,
        }
      })
      .toSorted((a, b) => {
        if (b.errors !== a.errors) return b.errors - a.errors
        return b.total - a.total
      })

    const duration = durationRow[0] ?? { avgMs: 0, p95Ms: 0 }

    return {
      total,
      errors,
      errorRate,
      byOutcome,
      byProvider,
      avgDurationMs: Number(duration.avgMs),
      p95DurationMs: Number(duration.p95Ms),
    }
  })

const getInputSchema = z.object({
  id: z.number().int().positive(),
})

export const getApiCallLog = createServerFn({ method: 'GET' })
  .inputValidator(getInputSchema)
  .handler(async ({ data }) => {
    assertLocalOnly()
    const [row] = await db
      .select()
      .from(apiCallLogs)
      .where(eq(apiCallLogs.id, data.id))
      .limit(1)
    return row ?? null
  })

export type ApiCallLogRow = NonNullable<
  Awaited<ReturnType<typeof getApiCallLog>>
>

export type ApiCallLogListRow = Awaited<
  ReturnType<typeof listApiCallLogs>
>['rows'][number]
