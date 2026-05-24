import { and, eq, sql } from 'drizzle-orm'
import { db } from '#/db'
import {
  evaluationFindings,
  evaluationJobs,
  evaluationSummary,
} from '#/db/schema'
import { getErrorMessage } from '#/lib/utils'
import { computeEvaluationScore } from '#/lib/evaluation/score'
import { runEydCheck } from '#/services/evaluation/eyd/checker'
import { flushCacheWrites } from '#/services/evaluation/kbbi/dict-store'
import { runKbbiCheck } from '#/services/evaluation/kbbi/checker'
import { warmKbbiCaches } from '#/services/evaluation/kbbi/lookup'
import { ensureProxyPoolReady } from '#/services/evaluation/kbbi/utils/proxy'
import { refreshVocabularyCache } from '#/services/evaluation/vocabulary-cache'
import { withApiLogContext } from '#/services/logs/logged-fetch'

const countByCategory = async (
  evalJobId: string,
  category: 'kbbi' | 'eyd',
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

export async function runEvaluationAnalysis(evalJobId: string): Promise<void> {
  return withApiLogContext({ evalJobId }, () => runEvaluationAnalysisInner(evalJobId))
}

async function runEvaluationAnalysisInner(evalJobId: string): Promise<void> {
  const startedAt = Date.now()
  await db
    .update(evaluationJobs)
    .set({
      status: 'analyzing',
      currentStep: 'kbbi+eyd',
      kbbiProgress: 0,
      kbbiTotal: 0,
      eydProgress: 0,
      eydTotal: 0,
      durationMs: null,
    })
    .where(eq(evaluationJobs.id, evalJobId))

  try {
    await Promise.all([
      refreshVocabularyCache(),
      warmKbbiCaches(),
      ensureProxyPoolReady(),
    ])

    console.log('[evaluation]', evalJobId, 'step=kbbi+eyd (parallel)')

    const kbbiTask = runKbbiCheck(evalJobId, async (processed, total) => {
      await db
        .update(evaluationJobs)
        .set({ kbbiProgress: processed, kbbiTotal: total })
        .where(eq(evaluationJobs.id, evalJobId))
    }).catch((err) => {
      console.error('[evaluation] step=kbbi failed', err)
      throw err
    })

    const eydTask = runEydCheck(evalJobId, async (processed, total) => {
      await db
        .update(evaluationJobs)
        .set({ eydProgress: processed, eydTotal: total })
        .where(eq(evaluationJobs.id, evalJobId))
    }).catch((err) => {
      console.error('[evaluation] step=eyd failed', err)
      throw err
    })

    await Promise.all([kbbiTask, eydTask])
    await flushCacheWrites().catch((err) => {
      console.error('[evaluation] cache flush failed', err)
    })

    console.log('[evaluation]', evalJobId, 'step=done')

    const [kbbiErrors, kbbiWarnings] = await Promise.all([
      countByCategory(evalJobId, 'kbbi', 'error'),
      countByCategory(evalJobId, 'kbbi', 'warning'),
    ])
    const [eydErrors, eydWarnings] = await Promise.all([
      countByCategory(evalJobId, 'eyd', 'error'),
      countByCategory(evalJobId, 'eyd', 'warning'),
    ])

    const [job] = await db
      .select({ totalPages: evaluationJobs.totalPages })
      .from(evaluationJobs)
      .where(eq(evaluationJobs.id, evalJobId))
      .limit(1)

    const kbbiTotal = kbbiErrors + kbbiWarnings
    const eydTotal = eydErrors + eydWarnings
    const score = computeEvaluationScore(kbbiTotal, eydTotal, job?.totalPages)

    await db
      .insert(evaluationSummary)
      .values({
        evalJobId,
        kbbiErrorCount: kbbiTotal,
        eydErrorCount: eydTotal,
        overallScore: score,
      })
      .onConflictDoUpdate({
        target: evaluationSummary.evalJobId,
        set: {
          kbbiErrorCount: kbbiTotal,
          eydErrorCount: eydTotal,
          overallScore: score,
        },
      })

    await db
      .update(evaluationJobs)
      .set({
        status: 'done',
        currentStep: null,
        durationMs: Date.now() - startedAt,
      })
      .where(eq(evaluationJobs.id, evalJobId))
  } catch (err) {
    const message = getErrorMessage(err, 'Evaluation analysis failed')
    await db
      .update(evaluationJobs)
      .set({
        status: 'failed',
        currentStep: null,
        error: message,
        durationMs: Date.now() - startedAt,
      })
      .where(eq(evaluationJobs.id, evalJobId))
    throw new Error(message, { cause: err })
  }
}
