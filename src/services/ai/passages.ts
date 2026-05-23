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
} from '#/db/schema'
import { jobIdSchema } from '#/schemas/job'
import { matchPassage } from '#/services/matcher/passage-matcher'

const refLabel = (author: string, year: string): string =>
  `${author} (${year})`

export const matchPassagesForJob = createServerFn({ method: 'POST' })
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

    const matchedCitations = matches.filter(
      (m) => m.matchType !== 'unmatched' && m.referenceId !== null,
    )

    if (matchedCitations.length === 0) {
      throw new Error(
        'No matched citations found. Run citation matching first.',
      )
    }

    await db.delete(passageMatches).where(eq(passageMatches.jobId, jobId))

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

      const passageResult = matchPassage({
        citationKey: match.citationKey,
        thesisContext: citation.thesisContext,
        sourcePages: pages,
      })

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
