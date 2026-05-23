import { z } from 'zod'

export const evalJobIdSchema = z.object({
  evalJobId: z.string().uuid(),
})

export type EvalJobIdInput = z.infer<typeof evalJobIdSchema>
