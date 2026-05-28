import { z } from 'zod'

export const evaluationTierStatsSchema = z.object({
  local: z.number().int().nonnegative(),
  daring: z.number().int().nonnegative(),
  unverified: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
})

export type EvaluationTierStats = z.infer<typeof evaluationTierStatsSchema>
