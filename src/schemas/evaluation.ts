import { z } from 'zod'

export const evalJobIdSchema = z.object({
  evalJobId: z.string().uuid(),
})

export type EvalJobIdInput = z.infer<typeof evalJobIdSchema>

export const evaluationCompareSchema = z
  .object({
    beforeId: z.string().uuid(),
    afterId: z.string().uuid(),
  })
  .refine((v) => v.beforeId !== v.afterId, {
    message: 'Pilih dua evaluation yang berbeda',
  })

export type EvaluationCompareInput = z.infer<typeof evaluationCompareSchema>

// URL search params for the evaluation report. `highlights` carries a
// "p.<n>;<text>" tuple that the route hydrates into the PDF preview on
// load — sharable links land on the right page with the right word
// highlighted.
export const evaluationReportSearchSchema = z.object({
  highlights: z
    .string()
    .regex(/^p\.(\d+);(.+)$/, 'expected p.<n>;<text>')
    .optional(),
})

export type EvaluationReportSearch = z.infer<typeof evaluationReportSearchSchema>

// URL search params for the evaluation compare page. `delta` selects which
// bucket of findings is currently visible — defaults to "belum" because the
// remaining work is what reviewers come to the page to triage.
export const compareDeltaSchema = z.enum(['belum', 'beres', 'baru'])
export type CompareDelta = z.infer<typeof compareDeltaSchema>

export const evaluationCompareSearchSchema = z.object({
  delta: compareDeltaSchema.optional().default('belum'),
})

export type EvaluationCompareSearch = z.infer<
  typeof evaluationCompareSearchSchema
>

export function parseHighlightsParam(raw: string | undefined): {
  page: number
  highlight: string
} | null {
  if (!raw) return null
  const match = /^p\.(\d+);(.+)$/.exec(raw)
  if (!match) return null
  const page = Number.parseInt(match[1]!, 10)
  if (!Number.isFinite(page) || page < 1) return null
  return { page, highlight: match[2]! }
}

export function buildHighlightsParam(page: number, highlight: string): string {
  return `p.${page};${highlight}`
}
