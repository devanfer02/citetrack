import { z } from 'zod'

export const historyKindSchema = z.enum(['track', 'evaluation'])
export type HistoryKind = z.infer<typeof historyKindSchema>

export const historySearchSchema = z.object({
  kind: historyKindSchema.optional().default('track'),
  page: z.coerce.number().int().positive().optional().default(1),
  selected: z
    .string()
    .optional()
    .transform((s) => (s ? s.split(',').filter(Boolean) : []))
    .pipe(z.array(z.string().uuid()).max(2)),
})
export type HistorySearch = z.infer<typeof historySearchSchema>

export const historyQuerySchema = z.object({
  kind: historyKindSchema,
  page: z.number().int().positive(),
})
export type HistoryQuery = z.infer<typeof historyQuerySchema>
