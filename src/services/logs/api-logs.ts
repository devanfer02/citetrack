import { createServerFn } from '@tanstack/react-start'
import { and, desc, eq, lt, or } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '#/db'
import { apiCallLogs } from '#/db/schema'
import { API_PROVIDERS } from '#/services/logs/logged-fetch'

const outcomeFilterSchema = z.enum(['all', 'errors', 'success'])

const listInputSchema = z.object({
  provider: z.array(z.enum(API_PROVIDERS)).optional(),
  outcome: outcomeFilterSchema.default('all'),
  trackJobId: z.string().uuid().optional(),
  evalJobId: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(200).default(50),
  before: z.string().datetime().optional(),
})

export const listApiCallLogs = createServerFn({ method: 'GET' })
  .inputValidator(listInputSchema)
  .handler(async ({ data }) => {
    const conditions = [] as Array<ReturnType<typeof eq> | ReturnType<typeof or>>

    if (data.provider && data.provider.length > 0) {
      conditions.push(
        or(...data.provider.map((p) => eq(apiCallLogs.provider, p)))!,
      )
    }

    if (data.outcome === 'errors') {
      conditions.push(
        or(
          eq(apiCallLogs.outcome, 'http_error'),
          eq(apiCallLogs.outcome, 'network_error'),
          eq(apiCallLogs.outcome, 'timeout'),
        )!,
      )
    } else if (data.outcome === 'success') {
      conditions.push(eq(apiCallLogs.outcome, 'success'))
    }

    if (data.trackJobId) {
      conditions.push(eq(apiCallLogs.trackJobId, data.trackJobId))
    }
    if (data.evalJobId) {
      conditions.push(eq(apiCallLogs.evalJobId, data.evalJobId))
    }
    if (data.before) {
      conditions.push(lt(apiCallLogs.createdAt, new Date(data.before)))
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined

    const rows = await db
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
      .orderBy(desc(apiCallLogs.createdAt))
      .limit(data.limit + 1)

    const hasMore = rows.length > data.limit
    const page = hasMore ? rows.slice(0, data.limit) : rows
    const nextCursor =
      hasMore && page.length > 0
        ? page[page.length - 1].createdAt.toISOString()
        : null

    return { rows: page, nextCursor }
  })

const getInputSchema = z.object({
  id: z.number().int().positive(),
})

export const getApiCallLog = createServerFn({ method: 'GET' })
  .inputValidator(getInputSchema)
  .handler(async ({ data }) => {
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
