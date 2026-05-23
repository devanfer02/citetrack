import { and, eq, sql } from 'drizzle-orm'
import { db } from '#/db'
import {
  evaluationFindings,
  evaluationJobs,
  evaluationSummary,
} from '#/db/schema'
import { getErrorMessage } from '#/lib/utils'
import { runEydCheck } from '#/services/evaluation/eyd/checker'
import { runFilkomCheck } from '#/services/evaluation/filkom/checker'
import { runKbbiCheck } from '#/services/evaluation/kbbi/checker'

const ERROR_WEIGHT = 3
const WARNING_WEIGHT = 1

const countByCategory = async (
  evalJobId: string,
  category: 'kbbi' | 'eyd' | 'filkom',
  severity: 'error' | 'warning' | 'info',
): Promise<number> => {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(evaluationFindings)
    .where(
      and(
        eq(evaluationFindings.evalJobId, evalJobId),
        eq(evaluationFindings.category, category),
        eq(evaluationFindings.severity, severity),
      ),
    )
  return row?.count ?? 0
}

const setStep = async (
  evalJobId: string,
  currentStep: 'filkom' | 'kbbi' | 'eyd' | null,
): Promise<void> => {
  await db
    .update(evaluationJobs)
    .set({ currentStep })
    .where(eq(evaluationJobs.id, evalJobId))
}

export async function runEvaluationAnalysis(evalJobId: string): Promise<void> {
  await db
    .update(evaluationJobs)
    .set({
      status: 'analyzing',
      filkomDone: false,
      kbbiProgress: 0,
      kbbiTotal: 0,
      eydProgress: 0,
      eydTotal: 0,
    })
    .where(eq(evaluationJobs.id, evalJobId))

  try {
    await setStep(evalJobId, 'filkom')
    await runFilkomCheck(evalJobId)
    await db
      .update(evaluationJobs)
      .set({ filkomDone: true })
      .where(eq(evaluationJobs.id, evalJobId))

    await setStep(evalJobId, 'kbbi')
    await runKbbiCheck(evalJobId, async (processed, total) => {
      await db
        .update(evaluationJobs)
        .set({ kbbiProgress: processed, kbbiTotal: total })
        .where(eq(evaluationJobs.id, evalJobId))
    })

    await setStep(evalJobId, 'eyd')
    await runEydCheck(evalJobId, async (processed, total) => {
      await db
        .update(evaluationJobs)
        .set({ eydProgress: processed, eydTotal: total })
        .where(eq(evaluationJobs.id, evalJobId))
    })

    const [kbbiErrors, kbbiWarnings] = await Promise.all([
      countByCategory(evalJobId, 'kbbi', 'error'),
      countByCategory(evalJobId, 'kbbi', 'warning'),
    ])
    const [eydErrors, eydWarnings] = await Promise.all([
      countByCategory(evalJobId, 'eyd', 'error'),
      countByCategory(evalJobId, 'eyd', 'warning'),
    ])
    const [filkomErrors, filkomWarnings] = await Promise.all([
      countByCategory(evalJobId, 'filkom', 'error'),
      countByCategory(evalJobId, 'filkom', 'warning'),
    ])

    const totalPenalty =
      (kbbiErrors + eydErrors + filkomErrors) * ERROR_WEIGHT +
      (kbbiWarnings + eydWarnings + filkomWarnings) * WARNING_WEIGHT
    const score = Math.max(0, Math.min(100, 100 - totalPenalty))

    await db
      .insert(evaluationSummary)
      .values({
        evalJobId,
        kbbiErrorCount: kbbiErrors + kbbiWarnings,
        eydErrorCount: eydErrors + eydWarnings,
        filkomErrorCount: filkomErrors + filkomWarnings,
        overallScore: score,
      })
      .onConflictDoUpdate({
        target: evaluationSummary.evalJobId,
        set: {
          kbbiErrorCount: kbbiErrors + kbbiWarnings,
          eydErrorCount: eydErrors + eydWarnings,
          filkomErrorCount: filkomErrors + filkomWarnings,
          overallScore: score,
        },
      })

    await db
      .update(evaluationJobs)
      .set({ status: 'done', currentStep: null })
      .where(eq(evaluationJobs.id, evalJobId))
  } catch (err) {
    const message = getErrorMessage(err, 'Evaluation analysis failed')
    await db
      .update(evaluationJobs)
      .set({ status: 'failed', currentStep: null, error: message })
      .where(eq(evaluationJobs.id, evalJobId))
    throw new Error(message, { cause: err })
  }
}
