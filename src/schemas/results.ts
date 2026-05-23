import { z } from 'zod'

// Results page search params. `view=share` strips the global nav so the
// page reads as a read-only report suitable for sharing with an advisor.
export const resultsSearchSchema = z.object({
  view: z.literal('share').optional(),
})

export type ResultsSearch = z.infer<typeof resultsSearchSchema>
