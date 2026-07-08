import { sql } from 'drizzle-orm'
import { createServerFn } from '@tanstack/react-start'
import { db } from '#/db'
import { evaluationSummary } from '#/db/schema'
import { assertLocalOnly } from '#/env'
import { getConfig } from '#/services/configurations-cache'
import {
  evaluationTierStatsSchema,
  type EvaluationTierStats,
} from '#/schemas/evaluation-tier-stats'

export const getEvaluationTierStats = createServerFn({ method: 'GET' }).handler(
  async (): Promise<EvaluationTierStats> => {
    assertLocalOnly()
    const [row] = await db
      .select({
        local: sql<number>`coalesce(sum(${evaluationSummary.localTokens}), 0)::int`,
        daring: sql<number>`coalesce(sum(${evaluationSummary.daringTokens}), 0)::int`,
        unverified: sql<number>`coalesce(sum(${evaluationSummary.unverifiedTokens}), 0)::int`,
      })
      .from(evaluationSummary)

    const local = row?.local ?? 0
    const daring = row?.daring ?? 0
    const unverified = row?.unverified ?? 0
    const localOnly = (await getConfig('kbbi.local_only')) === 1

    return evaluationTierStatsSchema.parse({
      local,
      daring,
      unverified,
      total: local + daring + unverified,
      localOnly,
    })
  },
)
