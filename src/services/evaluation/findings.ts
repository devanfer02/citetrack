import { eq, inArray } from 'drizzle-orm'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { db } from '#/db'
import { evaluationFindings } from '#/db/schema'

const setFindingResolvedInput = z.object({
  findingId: z.number().int().positive(),
  resolved: z.boolean(),
})

export const setFindingResolved = createServerFn({ method: 'POST' })
  .inputValidator(setFindingResolvedInput)
  .handler(async ({ data }) => {
    const [row] = await db
      .update(evaluationFindings)
      .set({ resolvedAt: data.resolved ? new Date() : null })
      .where(eq(evaluationFindings.id, data.findingId))
      .returning({
        id: evaluationFindings.id,
        resolvedAt: evaluationFindings.resolvedAt,
      })
    if (!row) throw new Error('Finding not found')
    return row
  })

const bulkSetFindingsResolvedInput = z.object({
  findingIds: z.array(z.number().int().positive()).min(1).max(5000),
  resolved: z.boolean(),
})

export const bulkSetFindingsResolved = createServerFn({ method: 'POST' })
  .inputValidator(bulkSetFindingsResolvedInput)
  .handler(async ({ data }) => {
    const rows = await db
      .update(evaluationFindings)
      .set({ resolvedAt: data.resolved ? new Date() : null })
      .where(inArray(evaluationFindings.id, data.findingIds))
      .returning({ id: evaluationFindings.id })
    return { affected: rows.length }
  })
