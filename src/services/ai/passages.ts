import { createServerFn } from '@tanstack/react-start'
import { and, asc, eq } from 'drizzle-orm'
import { db } from '#/db'
import {
  citationMatches,
  citations,
  passageMatches,
  references,
  sourcePages,
  sourcePdfs,
  sourceWindowEmbeddings,
} from '#/db/schema'
import { jobIdSchema } from '#/schemas/job'
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

// 500 rows × 7 inserted columns per row = 3500 placeholders — well under
// PostgreSQL's 65535 bind-parameter ceiling, and small enough that a
// failed insert doesn't waste much work.
const EMBEDDING_INSERT_CHUNK = 500

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

  // Only compute and persist the windows the cache is missing. This recovers
  // gracefully when a previous run was interrupted mid-insert — we'd otherwise
  // see "some rows exist" and never write the rest, forcing re-compute on
  // every match call without ever filling the gap.
  const missingWindows = windows.filter(
    (w) => !result.has(windowCacheKey(w.pageNumber, w.windowIdx)),
  )
  if (missingWindows.length === 0) return result

  const missingTexts = missingWindows.map((w) => w.text)
  // Chunked internally by the embedder (defaults: 32 for 384-dim models,
  // 16 for e5-base). A 400-page source can produce 3000+ windows and a
  // single batch tensor blows up RAM; this caps per-call working set.
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

  // Chunk inserts to stay under PostgreSQL's 65535 bind-parameter ceiling
  // for big PDFs. onConflictDoNothing handles the race where a concurrent
  // job inserted the same (sourcePdfId, model, page, windowIdx) row first.
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

export const matchPassagesForJob = createServerFn({ method: 'POST' })
  .inputValidator(jobIdSchema)
  .handler(async ({ data: { jobId } }) => {
    const startedAt = Date.now()
    const matches = await db
      .select({
        citationKey: citationMatches.citationKey,
        referenceId: citationMatches.referenceId,
        matchType: citationMatches.matchType,
      })
      .from(citationMatches)
      .where(eq(citationMatches.jobId, jobId))

    const matchedCitations = matches.filter(
      (m) => m.matchType !== 'unmatched' && m.referenceId !== null,
    )

    if (matchedCitations.length === 0) {
      throw new Error(
        'No matched citations found. Run citation matching first.',
      )
    }

    await db.delete(passageMatches).where(eq(passageMatches.jobId, jobId))

    const embedder = await getConfiguredEmbedder()
    const embeddingsBySourceId = new Map<number, Map<string, Float32Array>>()

    const results: PassageResult[] = []

    for (const match of matchedCitations) {
      const referenceId = match.referenceId
      if (referenceId === null) continue

      const [citation] = await db
        .select()
        .from(citations)
        .where(
          and(
            eq(citations.jobId, jobId),
            eq(citations.citationKey, match.citationKey),
          ),
        )
        .limit(1)

      if (!citation) continue

      const [ref] = await db
        .select({
          author: references.author,
          year: references.year,
        })
        .from(references)
        .where(eq(references.id, referenceId))
        .limit(1)

      const referenceLabel = ref
        ? refLabel(ref.author, ref.year)
        : null

      const [source] = await db
        .select()
        .from(sourcePdfs)
        .where(
          and(
            eq(sourcePdfs.jobId, jobId),
            eq(sourcePdfs.referenceId, referenceId),
            eq(sourcePdfs.status, 'done'),
          ),
        )
        .limit(1)

      if (!source) {
        results.push({
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

      const pages = await db
        .select({
          pageNumber: sourcePages.pageNumber,
          content: sourcePages.content,
        })
        .from(sourcePages)
        .where(eq(sourcePages.sourcePdfId, source.id))
        .orderBy(asc(sourcePages.pageNumber))

      if (pages.length === 0) {
        results.push({
          citationKey: match.citationKey,
          thesisContext: citation.thesisContext,
          thesisPage: citation.thesisPage,
          sourcePage: null,
          matchedPassage: null,
          confidence: 0,
          reasoning: 'Source PDF has no extractable text',
          status: 'no-match',
          filename: source.filename,
          referenceLabel,
        })
        continue
      }

      let cachedWindowEmbeddings: Map<string, Float32Array> | undefined
      if (embedder) {
        let cached = embeddingsBySourceId.get(source.id)
        if (!cached) {
          cached = await loadOrComputeWindowEmbeddings(
            source.id,
            pages,
            embedder,
          )
          embeddingsBySourceId.set(source.id, cached)
        }
        cachedWindowEmbeddings = cached
      }

      const passageResult = await matchPassage(
        {
          citationKey: match.citationKey,
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

        results.push({
          citationKey: match.citationKey,
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
        results.push({
          citationKey: match.citationKey,
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

    const matched = results.filter((r) => r.status === 'matched')
    const avgConfidence =
      matched.length > 0
        ? matched.reduce((sum, r) => sum + r.confidence, 0) / matched.length
        : 0

    return {
      jobId,
      results,
      matched: matched.length,
      noSource: results.filter((r) => r.status === 'no-source').length,
      noMatch: results.filter((r) => r.status === 'no-match').length,
      total: results.length,
      avgConfidence: Math.round(avgConfidence * 100) / 100,
      durationMs: Date.now() - startedAt,
    }
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
