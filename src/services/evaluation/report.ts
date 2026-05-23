import { asc, eq } from 'drizzle-orm'
import { createServerFn } from '@tanstack/react-start'
import { db } from '#/db'
import {
  evaluationFindings,
  evaluationJobs,
  evaluationSummary,
} from '#/db/schema'
import { evalJobIdSchema } from '#/schemas/evaluation'

export type EvaluationReport = {
  job: typeof evaluationJobs.$inferSelect
  summary: typeof evaluationSummary.$inferSelect | null
  findings: Array<typeof evaluationFindings.$inferSelect>
}

export const getEvaluationReport = createServerFn({ method: 'GET' })
  .inputValidator(evalJobIdSchema)
  .handler(async ({ data: { evalJobId } }): Promise<EvaluationReport> => {
    const [job] = await db
      .select()
      .from(evaluationJobs)
      .where(eq(evaluationJobs.id, evalJobId))
      .limit(1)

    if (!job) throw new Error('Evaluation job not found')

    const [summary] = await db
      .select()
      .from(evaluationSummary)
      .where(eq(evaluationSummary.evalJobId, evalJobId))
      .limit(1)

    const findings = await db
      .select()
      .from(evaluationFindings)
      .where(eq(evaluationFindings.evalJobId, evalJobId))
      .orderBy(
        asc(evaluationFindings.category),
        asc(evaluationFindings.pageNumber),
        asc(evaluationFindings.offset),
      )

    return {
      job,
      summary: summary ?? null,
      findings,
    }
  })
