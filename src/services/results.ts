import { createServerFn } from '@tanstack/react-start'
import { db } from '#/db'
import {
  citations,
  citationMatches,
  jobs,
  passageMatches,
  references,
  sourcePdfs,
} from '#/db/schema'
import { jobIdSchema } from '#/schemas/job'
import { eq, asc, sql } from 'drizzle-orm'

export interface CitationTraceRow {
  citationKey: string
  thesisPage: number
  thesisContext: string
  referenceTitle: string | null
  referenceAuthor: string | null
  matchType: string | null
  matchConfidence: number | null
  sourcePage: number | null
  matchedPassage: string | null
  passageConfidence: number | null
  reasoning: string | null
  sourceStatus: string | null
  status: 'verified' | 'needs-review' | 'no-source' | 'not-found'
}

export interface ResultsSummary {
  jobId: string
  filename: string
  totalCitations: number
  uniqueCitations: number
  matched: number
  passagesFound: number
  avgConfidence: number
  traces: CitationTraceRow[]
}

function deriveStatus(
  matchType: string | null,
  passageConfidence: number | null,
  sourceStatus: string | null,
): CitationTraceRow['status'] {
  if (!matchType || matchType === 'unmatched') return 'not-found'
  if (sourceStatus !== 'done') return 'no-source'
  if (passageConfidence !== null && passageConfidence >= 0.8) return 'verified'
  if (passageConfidence !== null && passageConfidence > 0) return 'needs-review'
  return 'not-found'
}

export const getFullResults = createServerFn({ method: 'GET' })
  .inputValidator(jobIdSchema)
  .handler(async ({ data: { jobId } }): Promise<ResultsSummary> => {
    const [job] = await db
      .select()
      .from(jobs)
      .where(eq(jobs.id, jobId))
      .limit(1)

    if (!job) throw new Error('Job not found')

    // Get unique citation keys with their first occurrence context
    const uniqueCitations = await db
      .select({
        citationKey: citations.citationKey,
        thesisPage: sql<number>`min(${citations.thesisPage})`.as('thesis_page'),
        thesisContext: sql<string>`(array_agg(${citations.thesisContext}))[1]`.as(
          'thesis_context',
        ),
      })
      .from(citations)
      .where(eq(citations.jobId, jobId))
      .groupBy(citations.citationKey)
      .orderBy(sql`min(${citations.thesisPage})`)

    const totalCitationRows = await db
      .select({ count: sql<number>`count(*)` })
      .from(citations)
      .where(eq(citations.jobId, jobId))

    // Get matches, references, sources, passages for each citation
    const traces: CitationTraceRow[] = []

    for (const cit of uniqueCitations) {
      const [match] = await db
        .select()
        .from(citationMatches)
        .where(
          sql`${citationMatches.jobId} = ${jobId} AND ${citationMatches.citationKey} = ${cit.citationKey}`,
        )
        .limit(1)

      let refTitle: string | null = null
      let refAuthor: string | null = null
      let sourceStatus: string | null = null

      if (match?.referenceId) {
        const [ref] = await db
          .select()
          .from(references)
          .where(eq(references.id, match.referenceId))
          .limit(1)

        if (ref) {
          refTitle = ref.title
          refAuthor = ref.author
        }

        const [source] = await db
          .select()
          .from(sourcePdfs)
          .where(
            sql`${sourcePdfs.jobId} = ${jobId} AND ${sourcePdfs.referenceId} = ${match.referenceId}`,
          )
          .limit(1)

        sourceStatus = source?.status ?? null
      }

      const [passage] = await db
        .select()
        .from(passageMatches)
        .where(
          sql`${passageMatches.jobId} = ${jobId} AND ${passageMatches.citationId} IN (
            SELECT ${citations.id} FROM ${citations}
            WHERE ${citations.jobId} = ${jobId} AND ${citations.citationKey} = ${cit.citationKey}
          )`,
        )
        .limit(1)

      traces.push({
        citationKey: cit.citationKey,
        thesisPage: cit.thesisPage,
        thesisContext: cit.thesisContext,
        referenceTitle: refTitle,
        referenceAuthor: refAuthor,
        matchType: match?.matchType ?? null,
        matchConfidence: match?.confidence ?? null,
        sourcePage: passage?.sourcePage ?? null,
        matchedPassage: passage?.matchedPassage ?? null,
        passageConfidence: passage?.confidence ?? null,
        reasoning: passage?.reasoning ?? null,
        sourceStatus,
        status: deriveStatus(
          match?.matchType ?? null,
          passage?.confidence ?? null,
          sourceStatus,
        ),
      })
    }

    const matched = traces.filter(
      (t) => t.status === 'verified' || t.status === 'needs-review',
    ).length
    const passagesFound = traces.filter((t) => t.sourcePage !== null).length
    const confidences = traces
      .filter((t) => t.passageConfidence !== null)
      .map((t) => t.passageConfidence!)
    const avgConfidence =
      confidences.length > 0
        ? Math.round(
            (confidences.reduce((a, b) => a + b, 0) / confidences.length) * 100,
          ) / 100
        : 0

    return {
      jobId,
      filename: job.filename,
      totalCitations: Number(totalCitationRows[0]?.count ?? 0),
      uniqueCitations: uniqueCitations.length,
      matched,
      passagesFound,
      avgConfidence,
      traces,
    }
  })
