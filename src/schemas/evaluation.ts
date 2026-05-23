import { z } from 'zod'

export const evalJobIdSchema = z.object({
  evalJobId: z.string().uuid(),
})

export type EvalJobIdInput = z.infer<typeof evalJobIdSchema>

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
