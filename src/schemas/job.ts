import { z } from 'zod'

export const jobIdSchema = z.object({
  jobId: z.string().uuid(),
})

export type JobIdInput = z.infer<typeof jobIdSchema>
