import { createServerFn } from '@tanstack/react-start'
import { db } from '#/db'
import {
  citations,
  citationMatches,
  passageMatches,
  sourcePdfs,
  sourcePages,
} from '#/db/schema'
import { jobIdSchema } from '#/schemas/job'
import { matchPassageAuto } from '#/services/ai/passage-matcher-factory'
import { env } from '#/env'
import { eq, and, asc } from 'drizzle-orm'

export const getMatcherStrategy = createServerFn({ method: 'GET' })
  .handler(async () => {
    return { strategy: (env.MATCHER_STRATEGY ?? 'api') as 'api' | 'agent' }
  })

export const matchPassagesForJob = createServerFn({ method: 'POST' })
  .inputValidator(jobIdSchema)
  .handler(async ({ data: { jobId } }) => {
    // Get all unique citation keys with their matches
    const matches = await db
      .select({
        citationKey: citationMatches.citationKey,
        referenceId: citationMatches.referenceId,
        matchType: citationMatches.matchType,
      })
      .from(citationMatches)
      .where(eq(citationMatches.jobId, jobId))

    const matchedCitations = matches.filter(
      (m) => m.matchType !== 'unmatched' && m.referenceId,
    )

    if (matchedCitations.length === 0) {
      throw new Error('No matched citations found. Run citation matching first.')
    }

    const results: PassageResult[] = []

    for (const match of matchedCitations) {
      // Get thesis context for this citation (first occurrence)
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

      // Get source PDF for this reference
      const [source] = await db
        .select()
        .from(sourcePdfs)
        .where(
          and(
            eq(sourcePdfs.jobId, jobId),
            eq(sourcePdfs.referenceId, match.referenceId!),
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
        })
        continue
      }

      // Get source pages
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
        })
        continue
      }

      // Run Claude API matching
      const passageResult = await matchPassageAuto({
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
        })
      } else {
        results.push({
          citationKey: match.citationKey,
          thesisContext: citation.thesisContext,
          thesisPage: citation.thesisPage,
          sourcePage: null,
          matchedPassage: null,
          confidence: 0,
          reasoning: passageResult?.reasoning ?? 'Claude API could not find a matching passage',
          status: 'no-match',
        })
      }
    }

    const matched = results.filter((r) => r.status === 'matched').length
    const avgConfidence =
      matched > 0
        ? results
            .filter((r) => r.status === 'matched')
            .reduce((sum, r) => sum + r.confidence, 0) / matched
        : 0

    return {
      jobId,
      results,
      matched,
      noSource: results.filter((r) => r.status === 'no-source').length,
      noMatch: results.filter((r) => r.status === 'no-match').length,
      total: results.length,
      avgConfidence: Math.round(avgConfidence * 100) / 100,
      matcherStrategy: (env.MATCHER_STRATEGY ?? 'api') as 'api' | 'agent',
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
      })
      .from(passageMatches)
      .innerJoin(citations, eq(passageMatches.citationId, citations.id))
      .where(eq(passageMatches.jobId, jobId))
      .orderBy(asc(citations.thesisPage))

    return { passages: rows }
  })
