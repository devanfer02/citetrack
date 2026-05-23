import { z } from 'zod'
import { PIPELINE_PHASES } from '#/lib/pipeline/phases'

export const pipelineSearchSchema = z.object({
  jobId: z.string().uuid().optional(),
  phase: z.enum(PIPELINE_PHASES).optional(),
})

export type PipelineSearch = z.infer<typeof pipelineSearchSchema>
