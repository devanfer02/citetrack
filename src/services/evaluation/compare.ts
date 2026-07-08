import { and, asc, desc, eq, ne } from 'drizzle-orm'
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
import { computeEvaluationScore } from '#/lib/evaluation/score'
import {
  evaluationCandidatesSchema,
  evaluationCompareSchema,
} from '#/schemas/evaluation'
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

export type EvaluationComparisonCandidate = {
  id: string
  filename: string
  createdAt: Date
  totalPages: number | null
  overallScore: number | null
  errorCount: number | null
}

export const listEvaluationComparisonCandidates = createServerFn({
  method: 'GET',
})
  .inputValidator(evaluationCandidatesSchema)
  .handler(
    async ({
      data: { currentId },
    }): Promise<EvaluationComparisonCandidate[]> => {
      assertLocalOnly()
      const rows = await db
        .select({
          id: evaluationJobs.id,
          filename: evaluationJobs.filename,
          createdAt: evaluationJobs.createdAt,
          totalPages: evaluationJobs.totalPages,
          kbbiErrors: evaluationSummary.kbbiErrorCount,
          eydErrors: evaluationSummary.eydErrorCount,
        })
        .from(evaluationJobs)
        .leftJoin(
          evaluationSummary,
          eq(evaluationJobs.id, evaluationSummary.evalJobId),
        )
        .where(
          and(
            eq(evaluationJobs.status, 'done'),
            ne(evaluationJobs.id, currentId),
          ),
        )
        .orderBy(desc(evaluationJobs.createdAt))

      return rows.map((r) => ({
        id: r.id,
        filename: r.filename,
        createdAt: r.createdAt,
        totalPages: r.totalPages,
        // Derive the score from current counts the same way the history list
        // does, so old rows stored under the broken formula come up correctly.
        overallScore:
          r.kbbiErrors !== null && r.eydErrors !== null
            ? computeEvaluationScore(r.kbbiErrors, r.eydErrors, r.totalPages)
            : null,
        errorCount:
          r.kbbiErrors !== null && r.eydErrors !== null
            ? r.kbbiErrors + r.eydErrors
            : null,
      }))
    },
  )
