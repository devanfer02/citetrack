import { z } from 'zod'

export const passageMatchResponseSchema = z.object({
  page: z.number().int().positive(),
  passage: z.string().min(1),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
})

export type PassageMatchResponse = z.infer<typeof passageMatchResponseSchema>
