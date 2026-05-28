import { asc, eq } from 'drizzle-orm'
import { createServerFn } from '@tanstack/react-start'
import { db } from '#/db'
import {
  evaluationFindings,
  evaluationJobs,
  evaluationSummary,
} from '#/db/schema'
import { assertLocalOnly } from '#/env'
import {
  compareEvaluations,
  type ComparisonReport,
} from '#/lib/evaluation/compare'
import { evaluationCompareSchema } from '#/schemas/evaluation'
import type { EvaluationReport } from '#/services/evaluation/report'

async function loadReport(evalJobId: string): Promise<EvaluationReport> {
  const [job] = await db
    .select()
    .from(evaluationJobs)
    .where(eq(evaluationJobs.id, evalJobId))
    .limit(1)
  if (!job) throw new Error('Evaluation tidak ditemukan')
  if (job.status !== 'done') {
    throw new Error(`Evaluation "${job.filename}" belum selesai`)
  }

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

  return { job, summary: summary ?? null, findings }
}

export const getEvaluationComparison = createServerFn({ method: 'GET' })
  .inputValidator(evaluationCompareSchema)
  .handler(
    async ({ data: { beforeId, afterId } }): Promise<ComparisonReport> => {
      assertLocalOnly()
      const [before, after] = await Promise.all([
        loadReport(beforeId),
        loadReport(afterId),
      ])
      // Respect the requested orientation. The route loader handles the
      // older->newer canonicalization (with an opt-out for the swap action),
      // so we don't second-guess input order here.
      return compareEvaluations(before, after)
    },
  )
