import { z } from 'zod'
import { RESUMABLE_PHASES } from '#/lib/pipeline/phases'

export const jobIdSchema = z.object({
  jobId: z.string().uuid(),
})

export type JobIdInput = z.infer<typeof jobIdSchema>

export const setJobPhaseSchema = z.object({
  jobId: z.string().uuid(),
  phase: z.enum(RESUMABLE_PHASES),
})

export type SetJobPhaseInput = z.infer<typeof setJobPhaseSchema>
