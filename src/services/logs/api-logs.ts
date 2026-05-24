import { createServerFn } from '@tanstack/react-start'
import { and, desc, eq, inArray, lt, or } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '#/db'
import { apiCallLogs } from '#/db/schema'
import { assertLocalOnly } from '#/env'
import { API_PROVIDERS } from '#/services/logs/providers'

const outcomeFilterSchema = z.enum(['all', 'errors', 'success'])

const cursorSchema = z.object({
  createdAt: z.string().datetime(),
  id: z.number().int().positive(),
})

const listInputSchema = z.object({
  provider: z.array(z.enum(API_PROVIDERS)).optional(),
  outcome: outcomeFilterSchema.default('all'),
  trackJobId: z.string().uuid().optional(),
  evalJobId: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(200).default(50),
  cursor: cursorSchema.optional(),
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
    }

    if (data.trackJobId) {
      conditions.push(eq(apiCallLogs.trackJobId, data.trackJobId))
    }
    if (data.evalJobId) {
      conditions.push(eq(apiCallLogs.evalJobId, data.evalJobId))
    }
    if (data.cursor) {
      // Keyset cursor over the composite sort key (createdAt DESC, id DESC).
      // Without the secondary id check, rows sharing a createdAt timestamp
      // (common under concurrent inserts) can skip or duplicate across pages.
      const cursorTime = new Date(data.cursor.createdAt)
      conditions.push(
        or(
          lt(apiCallLogs.createdAt, cursorTime),
          and(
            eq(apiCallLogs.createdAt, cursorTime),
            lt(apiCallLogs.id, data.cursor.id),
          ),
        )!,
      )
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
      .orderBy(desc(apiCallLogs.createdAt), desc(apiCallLogs.id))
      .limit(data.limit + 1)

    const hasMore = rows.length > data.limit
    const page = hasMore ? rows.slice(0, data.limit) : rows
    const last = page[page.length - 1]
    const nextCursor =
      hasMore && last
        ? { createdAt: last.createdAt.toISOString(), id: last.id }
        : null

    return { rows: page, nextCursor }
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
