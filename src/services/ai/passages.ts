import { createServerFn } from '@tanstack/react-start'
import { and, asc, eq, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '#/db'
import {
  citationMatches,
  citations,
  passageMatchBatches,
  passageMatches,
  references,
  sourcePages,
  sourcePdfs,
  sourceWindowEmbeddings,
} from '#/db/schema'
import { jobIdSchema } from '#/schemas/job'
import { getErrorMessage } from '#/lib/utils'
import {
  type Embedder,
  bufferToFloat32Array,
  float32ArrayToBuffer,
  getConfiguredEmbedder,
} from '#/services/matcher/embedder'
import {
  buildWindows,
  matchPassage,
  windowCacheKey,
} from '#/services/matcher/passage-matcher'

const EMBEDDING_INSERT_CHUNK = 500
// A batch left in 'running' beyond this window is assumed to be the
// result of a server crash mid-processing and is allowed to be re-run.
const STALE_RUNNING_MS = 2 * 60_000

async function loadOrComputeWindowEmbeddings(
  sourcePdfId: number,
  pages: SourcePage[],
  embedder: Embedder,
): Promise<Map<string, Float32Array>> {
  const windows = buildWindows(pages)
  if (windows.length === 0) return new Map()

  const existingRows = await db
    .select({
      pageNumber: sourceWindowEmbeddings.pageNumber,
      windowIdx: sourceWindowEmbeddings.windowIdx,
      embedding: sourceWindowEmbeddings.embedding,
    })
    .from(sourceWindowEmbeddings)
    .where(
      and(
        eq(sourceWindowEmbeddings.sourcePdfId, sourcePdfId),
        eq(sourceWindowEmbeddings.embeddingModel, embedder.name),
      ),
    )

  const result = new Map<string, Float32Array>()
  for (const row of existingRows) {
    result.set(
      windowCacheKey(row.pageNumber, row.windowIdx),
      bufferToFloat32Array(row.embedding),
    )
  }

  const missingWindows = windows.filter(
    (w) => !result.has(windowCacheKey(w.pageNumber, w.windowIdx)),
  )
  if (missingWindows.length === 0) return result

  const missingTexts = missingWindows.map((w) => w.text)
  const missingEmbeddings = await embedder.embedPassages(missingTexts)

  const rowsToInsert = missingWindows.map((w, i) => ({
    sourcePdfId,
    pageNumber: w.pageNumber,
    windowIdx: w.windowIdx,
    windowText: w.text,
    embedding: float32ArrayToBuffer(missingEmbeddings[i]),
    embeddingModel: embedder.name,
    embeddingDim: embedder.dim,
  }))

  for (let i = 0; i < rowsToInsert.length; i += EMBEDDING_INSERT_CHUNK) {
    const slice = rowsToInsert.slice(i, i + EMBEDDING_INSERT_CHUNK)
    await db
      .insert(sourceWindowEmbeddings)
      .values(slice)
      .onConflictDoNothing({
        target: [
          sourceWindowEmbeddings.sourcePdfId,
          sourceWindowEmbeddings.embeddingModel,
          sourceWindowEmbeddings.pageNumber,
          sourceWindowEmbeddings.windowIdx,
        ],
      })
  }

  for (let i = 0; i < missingWindows.length; i++) {
    result.set(
      windowCacheKey(missingWindows[i].pageNumber, missingWindows[i].windowIdx),
      missingEmbeddings[i],
    )
  }
  return result
}

const refLabel = (author: string, year: string): string =>
  `${author} (${year})`

export interface PassageBatchSummary {
  batchIndex: number
  sourcePdfId: number
  filename: string | null
  referenceLabel: string | null
  citationCount: number
  matchedCount: number
  noMatchCount: number
  status: 'pending' | 'running' | 'done' | 'failed'
  attempts: number
  errorMessage: string | null
}

const toBatchSummary = (row: {
  batchIndex: number
  sourcePdfId: number
  filename: string | null
  refAuthor: string | null
  refYear: string | null
  citationCount: number
  matchedCount: number
  noMatchCount: number
  status: 'pending' | 'running' | 'done' | 'failed'
  attempts: number
  errorMessage: string | null
}): PassageBatchSummary => ({
  batchIndex: row.batchIndex,
  sourcePdfId: row.sourcePdfId,
  filename: row.filename,
  referenceLabel:
    row.refAuthor && row.refYear ? refLabel(row.refAuthor, row.refYear) : null,
  citationCount: row.citationCount,
  matchedCount: row.matchedCount,
  noMatchCount: row.noMatchCount,
  status: row.status,
  attempts: row.attempts,
  errorMessage: row.errorMessage,
})

async function loadBatchesForJob(
  jobId: string,
): Promise<PassageBatchSummary[]> {
  const rows = await db
    .select({
      batchIndex: passageMatchBatches.batchIndex,
      sourcePdfId: passageMatchBatches.sourcePdfId,
      filename: sourcePdfs.filename,
      refAuthor: references.author,
      refYear: references.year,
      citationCount: passageMatchBatches.citationCount,
      matchedCount: passageMatchBatches.matchedCount,
      noMatchCount: passageMatchBatches.noMatchCount,
      status: passageMatchBatches.status,
      attempts: passageMatchBatches.attempts,
      errorMessage: passageMatchBatches.errorMessage,
    })
    .from(passageMatchBatches)
    .innerJoin(sourcePdfs, eq(passageMatchBatches.sourcePdfId, sourcePdfs.id))
    .leftJoin(references, eq(sourcePdfs.referenceId, references.id))
    .where(eq(passageMatchBatches.jobId, jobId))
    .orderBy(asc(passageMatchBatches.batchIndex))
  return rows.map(toBatchSummary)
}

export const enqueuePassageBatches = createServerFn({ method: 'POST' })
  .inputValidator(jobIdSchema)
  .handler(async ({ data: { jobId } }) => {
    const matches = await db
      .select({
        citationKey: citationMatches.citationKey,
        referenceId: citationMatches.referenceId,
        matchType: citationMatches.matchType,
      })
      .from(citationMatches)
      .where(eq(citationMatches.jobId, jobId))

    const matchedRefs = matches.filter(
      (m) => m.matchType !== 'unmatched' && m.referenceId !== null,
    )

    if (matchedRefs.length === 0) {
      throw new Error(
        'No matched citations found. Run citation matching first.',
      )
    }

    await db
      .delete(passageMatchBatches)
      .where(eq(passageMatchBatches.jobId, jobId))
    await db.delete(passageMatches).where(eq(passageMatches.jobId, jobId))

    const referenceIds = Array.from(
      new Set(matchedRefs.map((m) => m.referenceId as number)),
    )

    const sources = await db
      .select({
        id: sourcePdfs.id,
        referenceId: sourcePdfs.referenceId,
        filename: sourcePdfs.filename,
        status: sourcePdfs.status,
      })
      .from(sourcePdfs)
      .where(
        and(
          eq(sourcePdfs.jobId, jobId),
          inArray(sourcePdfs.referenceId, referenceIds),
        ),
      )

    const sourceByRef = new Map<
      number,
      { id: number; filename: string | null; status: string }
    >()
    for (const s of sources) {
      if (s.referenceId === null) continue
      if (s.status !== 'done') continue
      sourceByRef.set(s.referenceId, {
        id: s.id,
        filename: s.filename,
        status: s.status,
      })
    }

    const allCitations = await db
      .select({
        id: citations.id,
        key: citations.citationKey,
        thesisContext: citations.thesisContext,
        thesisPage: citations.thesisPage,
      })
      .from(citations)
      .where(
        and(
          eq(citations.jobId, jobId),
          inArray(
            citations.citationKey,
            matchedRefs.map((m) => m.citationKey),
          ),
        ),
      )

    const citationByKey = new Map(allCitations.map((c) => [c.key, c]))

    const refs = await db
      .select({
        id: references.id,
        author: references.author,
        year: references.year,
      })
      .from(references)
      .where(inArray(references.id, referenceIds))
    const refById = new Map(refs.map((r) => [r.id, r]))

    const citationsBySource = new Map<number, string[]>()
    const noSourceResults: PassageResult[] = []

    for (const match of matchedRefs) {
      const refId = match.referenceId as number
      const ref = refById.get(refId)
      const referenceLabel = ref ? refLabel(ref.author, ref.year) : null
      const citation = citationByKey.get(match.citationKey)
      if (!citation) continue

      const source = sourceByRef.get(refId)
      if (!source) {
        noSourceResults.push({
          citationKey: match.citationKey,
          thesisContext: citation.thesisContext,
          thesisPage: citation.thesisPage,
          sourcePage: null,
          matchedPassage: null,
          confidence: 0,
          reasoning: null,
          status: 'no-source',
          filename: null,
          referenceLabel,
        })
        continue
      }
      const list = citationsBySource.get(source.id) ?? []
      list.push(match.citationKey)
      citationsBySource.set(source.id, list)
    }

    const sourceIds = [...citationsBySource.keys()]
    if (sourceIds.length === 0) {
      // every matched citation lacks a source — return early with no batches
      return {
        batches: [] as PassageBatchSummary[],
        noSourceResults,
      }
    }

    const batchRows = sourceIds.map((sourceId, i) => ({
      jobId,
      batchIndex: i + 1,
      sourcePdfId: sourceId,
      citationCount: citationsBySource.get(sourceId)!.length,
    }))
    await db.insert(passageMatchBatches).values(batchRows)

    const batches = await loadBatchesForJob(jobId)
    return { batches, noSourceResults }
  })

const batchInputSchema = z.object({
  jobId: z.string().uuid(),
  batchIndex: z.number().int().positive(),
})

interface BatchProcessOutcome {
  matched: number
  noMatch: number
  results: PassageResult[]
}

async function processBatchOnce(
  jobId: string,
  sourcePdfId: number,
): Promise<BatchProcessOutcome> {
  const [source] = await db
    .select({
      id: sourcePdfs.id,
      referenceId: sourcePdfs.referenceId,
      filename: sourcePdfs.filename,
    })
    .from(sourcePdfs)
    .where(eq(sourcePdfs.id, sourcePdfId))
    .limit(1)
  if (!source || source.referenceId === null) {
    throw new Error(`Source PDF ${sourcePdfId} is gone or has no reference.`)
  }

  const [ref] = await db
    .select({ author: references.author, year: references.year })
    .from(references)
    .where(eq(references.id, source.referenceId))
    .limit(1)
  const referenceLabel = ref ? refLabel(ref.author, ref.year) : null

  const matchedRows = await db
    .select({ citationKey: citationMatches.citationKey })
    .from(citationMatches)
    .where(
      and(
        eq(citationMatches.jobId, jobId),
        eq(citationMatches.referenceId, source.referenceId),
      ),
    )
  const citationKeys = matchedRows.map((r) => r.citationKey)
  if (citationKeys.length === 0) {
    return { matched: 0, noMatch: 0, results: [] }
  }

  const citationRows = await db
    .select({
      id: citations.id,
      key: citations.citationKey,
      thesisContext: citations.thesisContext,
      thesisPage: citations.thesisPage,
    })
    .from(citations)
    .where(
      and(
        eq(citations.jobId, jobId),
        inArray(citations.citationKey, citationKeys),
      ),
    )

  const pages = await db
    .select({
      pageNumber: sourcePages.pageNumber,
      content: sourcePages.content,
    })
    .from(sourcePages)
    .where(eq(sourcePages.sourcePdfId, source.id))
    .orderBy(asc(sourcePages.pageNumber))

  if (pages.length === 0) {
    const results: PassageResult[] = citationRows.map((c) => ({
      citationKey: c.key,
      thesisContext: c.thesisContext,
      thesisPage: c.thesisPage,
      sourcePage: null,
      matchedPassage: null,
      confidence: 0,
      reasoning: 'Source PDF has no extractable text',
      status: 'no-match',
      filename: source.filename,
      referenceLabel,
    }))
    return { matched: 0, noMatch: results.length, results }
  }

  const embedder = await getConfiguredEmbedder()
  let cachedWindowEmbeddings: Map<string, Float32Array> | undefined
  if (embedder) {
    cachedWindowEmbeddings = await loadOrComputeWindowEmbeddings(
      source.id,
      pages,
      embedder,
    )
  }

  let matched = 0
  let noMatch = 0
  const results: PassageResult[] = []

  for (const citation of citationRows) {
    const passageResult = await matchPassage(
      {
        citationKey: citation.key,
        thesisContext: citation.thesisContext,
        sourcePages: pages,
      },
      { embedder, cachedWindowEmbeddings },
    )

    if (passageResult && passageResult.confidence > 0) {
      await db.insert(passageMatches).values({
        jobId,
        citationId: citation.id,
        sourcePdfId: source.id,
        sourcePage: passageResult.sourcePage,
        matchedPassage: passageResult.matchedPassage,
        confidence: passageResult.confidence,
        reasoning: passageResult.reasoning,
      })
      matched++
      results.push({
        citationKey: citation.key,
        thesisContext: citation.thesisContext,
        thesisPage: citation.thesisPage,
        sourcePage: passageResult.sourcePage,
        matchedPassage: passageResult.matchedPassage,
        confidence: passageResult.confidence,
        reasoning: passageResult.reasoning,
        status: 'matched',
        filename: source.filename,
        referenceLabel,
      })
    } else {
      noMatch++
      results.push({
        citationKey: citation.key,
        thesisContext: citation.thesisContext,
        thesisPage: citation.thesisPage,
        sourcePage: null,
        matchedPassage: null,
        confidence: 0,
        reasoning:
          'No passage in the source PDF scored above the match threshold',
        status: 'no-match',
        filename: source.filename,
        referenceLabel,
      })
    }
  }

  return { matched, noMatch, results }
}

async function reconstructDoneBatchResults(
  jobId: string,
  sourcePdfId: number,
): Promise<PassageResult[]> {
  const [source] = await db
    .select({
      id: sourcePdfs.id,
      referenceId: sourcePdfs.referenceId,
      filename: sourcePdfs.filename,
    })
    .from(sourcePdfs)
    .where(eq(sourcePdfs.id, sourcePdfId))
    .limit(1)
  if (!source || source.referenceId === null) return []

  const [ref] = await db
    .select({ author: references.author, year: references.year })
    .from(references)
    .where(eq(references.id, source.referenceId))
    .limit(1)
  const referenceLabel = ref ? refLabel(ref.author, ref.year) : null

  const matchedRows = await db
    .select({ citationKey: citationMatches.citationKey })
    .from(citationMatches)
    .where(
      and(
        eq(citationMatches.jobId, jobId),
        eq(citationMatches.referenceId, source.referenceId),
      ),
    )
  const citationKeys = matchedRows.map((r) => r.citationKey)
  if (citationKeys.length === 0) return []

  const citationRows = await db
    .select({
      id: citations.id,
      key: citations.citationKey,
      thesisContext: citations.thesisContext,
      thesisPage: citations.thesisPage,
    })
    .from(citations)
    .where(
      and(
        eq(citations.jobId, jobId),
        inArray(citations.citationKey, citationKeys),
      ),
    )

  const persisted = await db
    .select({
      citationId: passageMatches.citationId,
      sourcePage: passageMatches.sourcePage,
      matchedPassage: passageMatches.matchedPassage,
      confidence: passageMatches.confidence,
      reasoning: passageMatches.reasoning,
    })
    .from(passageMatches)
    .where(
      and(
        eq(passageMatches.jobId, jobId),
        eq(passageMatches.sourcePdfId, source.id),
      ),
    )
  const persistedById = new Map(persisted.map((p) => [p.citationId, p]))

  return citationRows.map((c): PassageResult => {
    const hit = persistedById.get(c.id)
    if (hit) {
      return {
        citationKey: c.key,
        thesisContext: c.thesisContext,
        thesisPage: c.thesisPage,
        sourcePage: hit.sourcePage,
        matchedPassage: hit.matchedPassage,
        confidence: hit.confidence,
        reasoning: hit.reasoning,
        status: 'matched',
        filename: source.filename,
        referenceLabel,
      }
    }
    return {
      citationKey: c.key,
      thesisContext: c.thesisContext,
      thesisPage: c.thesisPage,
      sourcePage: null,
      matchedPassage: null,
      confidence: 0,
      reasoning:
        'No passage in the source PDF scored above the match threshold',
      status: 'no-match',
      filename: source.filename,
      referenceLabel,
    }
  })
}

export const processPassageBatch = createServerFn({ method: 'POST' })
  .inputValidator(batchInputSchema)
  .handler(async ({ data: { jobId, batchIndex } }) => {
    const [row] = await db
      .select()
      .from(passageMatchBatches)
      .where(
        and(
          eq(passageMatchBatches.jobId, jobId),
          eq(passageMatchBatches.batchIndex, batchIndex),
        ),
      )
      .limit(1)
    if (!row) {
      throw new Error(
        `Batch ${batchIndex} not found for job ${jobId}. Re-enqueue first.`,
      )
    }

    if (row.status === 'done') {
      const results = await reconstructDoneBatchResults(jobId, row.sourcePdfId)
      const [batch] = await loadBatchesByIndex(jobId, [batchIndex])
      return { batch, results }
    }

    if (
      row.status === 'running' &&
      row.startedAt &&
      Date.now() - row.startedAt.getTime() < STALE_RUNNING_MS
    ) {
      throw new Error(
        `Batch ${batchIndex} is already running. Wait for the active worker to finish.`,
      )
    }

    await db
      .update(passageMatchBatches)
      .set({
        status: 'running',
        startedAt: new Date(),
        attempts: row.attempts + 1,
      })
      .where(eq(passageMatchBatches.id, row.id))

    let outcome: BatchProcessOutcome
    try {
      outcome = await processBatchOnce(jobId, row.sourcePdfId)
    } catch (firstErr) {
      // Auto-retry once on transient failure.
      const firstMessage = getErrorMessage(firstErr, 'Passage batch failed')
      try {
        await db
          .delete(passageMatches)
          .where(
            and(
              eq(passageMatches.jobId, jobId),
              eq(passageMatches.sourcePdfId, row.sourcePdfId),
            ),
          )
        outcome = await processBatchOnce(jobId, row.sourcePdfId)
      } catch (secondErr) {
        const finalMessage = getErrorMessage(
          secondErr,
          `Passage batch failed twice (first error: ${firstMessage})`,
        )
        await db
          .update(passageMatchBatches)
          .set({
            status: 'failed',
            errorMessage: finalMessage,
            finishedAt: new Date(),
            attempts: row.attempts + 2,
          })
          .where(eq(passageMatchBatches.id, row.id))
        throw new Error(finalMessage, { cause: secondErr })
      }
      // Retry succeeded: bump attempts to account for the extra run.
      await db
        .update(passageMatchBatches)
        .set({ attempts: row.attempts + 2 })
        .where(eq(passageMatchBatches.id, row.id))
    }

    await db
      .update(passageMatchBatches)
      .set({
        status: 'done',
        matchedCount: outcome.matched,
        noMatchCount: outcome.noMatch,
        errorMessage: null,
        finishedAt: new Date(),
      })
      .where(eq(passageMatchBatches.id, row.id))

    const [batch] = await loadBatchesByIndex(jobId, [batchIndex])
    return { batch, results: outcome.results }
  })

async function loadBatchesByIndex(
  jobId: string,
  indexes: number[],
): Promise<PassageBatchSummary[]> {
  if (indexes.length === 0) return []
  const rows = await db
    .select({
      batchIndex: passageMatchBatches.batchIndex,
      sourcePdfId: passageMatchBatches.sourcePdfId,
      filename: sourcePdfs.filename,
      refAuthor: references.author,
      refYear: references.year,
      citationCount: passageMatchBatches.citationCount,
      matchedCount: passageMatchBatches.matchedCount,
      noMatchCount: passageMatchBatches.noMatchCount,
      status: passageMatchBatches.status,
      attempts: passageMatchBatches.attempts,
      errorMessage: passageMatchBatches.errorMessage,
    })
    .from(passageMatchBatches)
    .innerJoin(sourcePdfs, eq(passageMatchBatches.sourcePdfId, sourcePdfs.id))
    .leftJoin(references, eq(sourcePdfs.referenceId, references.id))
    .where(
      and(
        eq(passageMatchBatches.jobId, jobId),
        inArray(passageMatchBatches.batchIndex, indexes),
      ),
    )
  return rows.map(toBatchSummary)
}

export const retryFailedPassageBatches = createServerFn({ method: 'POST' })
  .inputValidator(jobIdSchema)
  .handler(async ({ data: { jobId } }) => {
    await db
      .update(passageMatchBatches)
      .set({
        status: 'pending',
        attempts: 0,
        errorMessage: null,
        startedAt: null,
        finishedAt: null,
      })
      .where(
        and(
          eq(passageMatchBatches.jobId, jobId),
          eq(passageMatchBatches.status, 'failed'),
        ),
      )
    const batches = await loadBatchesForJob(jobId)
    return { batches }
  })

export const getPassageBatchStatus = createServerFn({ method: 'GET' })
  .inputValidator(jobIdSchema)
  .handler(async ({ data: { jobId } }) => {
    const batches = await loadBatchesForJob(jobId)
    return { batches }
  })

export const getPassagesForJob = createServerFn({ method: 'GET' })
  .inputValidator(jobIdSchema)
  .handler(async ({ data: { jobId } }) => {
    const rows = await db
      .select({
        id: passageMatches.id,
        citationKey: citations.citationKey,
        thesisContext: citations.thesisContext,
        thesisPage: citations.thesisPage,
        sourcePage: passageMatches.sourcePage,
        matchedPassage: passageMatches.matchedPassage,
        confidence: passageMatches.confidence,
        reasoning: passageMatches.reasoning,
        filename: sourcePdfs.filename,
        author: references.author,
        year: references.year,
      })
      .from(passageMatches)
      .innerJoin(citations, eq(passageMatches.citationId, citations.id))
      .innerJoin(sourcePdfs, eq(passageMatches.sourcePdfId, sourcePdfs.id))
      .leftJoin(references, eq(sourcePdfs.referenceId, references.id))
      .where(eq(passageMatches.jobId, jobId))
      .orderBy(asc(citations.thesisPage))

    return {
      passages: rows.map((r) => ({
        ...r,
        referenceLabel:
          r.author && r.year ? refLabel(r.author, r.year) : null,
      })),
    }
  })

