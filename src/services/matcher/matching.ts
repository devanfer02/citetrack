import { createServerFn } from '@tanstack/react-start'
import { db } from '#/db'
import { citations, citationMatches, references } from '#/db/schema'
import { matchCitations } from '#/services/matcher/citation-matcher'
import { jobIdSchema } from '#/schemas/job'
import { eq, asc } from 'drizzle-orm'

export const matchCitationsForJob = createServerFn({ method: 'POST' })
  .inputValidator(jobIdSchema)
  .handler(async ({ data: { jobId } }) => {
    const citationRows = await db
      .select({ citationKey: citations.citationKey })
      .from(citations)
      .where(eq(citations.jobId, jobId))

    const refRows = await db
      .select({
        id: references.id,
        author: references.author,
        year: references.year,
        title: references.title,
      })
      .from(references)
      .where(eq(references.jobId, jobId))
      .orderBy(asc(references.id))

    if (citationRows.length === 0) {
      throw new Error('No citations found. Run citation parsing first.')
    }

    const citationKeys = citationRows.map((r) => r.citationKey)
    const result = matchCitations(citationKeys, refRows)

    if (result.matches.length > 0) {
      await db.insert(citationMatches).values(
        result.matches.map((m) => ({
          jobId,
          citationKey: m.citationKey,
          referenceId: m.referenceId,
          confidence: m.confidence,
          matchType: m.matchType,
        })),
      )
    }

    return result
  })

export const getMatchesForJob = createServerFn({ method: 'GET' })
  .inputValidator(jobIdSchema)
  .handler(async ({ data: { jobId } }): Promise<MatchSummary> => {
    const rows = await db
      .select()
      .from(citationMatches)
      .where(eq(citationMatches.jobId, jobId))

    const refRows = await db
      .select({
        id: references.id,
        author: references.author,
        year: references.year,
        title: references.title,
      })
      .from(references)
      .where(eq(references.jobId, jobId))

    const matchedRefIds = new Set(
      rows.filter((r) => r.referenceId).map((r) => r.referenceId),
    )

    return {
      matches: rows.map((r) => {
        const ref = refRows.find((row) => row.id === r.referenceId)
        return {
          citationKey: r.citationKey,
          referenceId: r.referenceId,
          referenceTitle: ref?.title ?? null,
          confidence: r.confidence,
          matchType: r.matchType,
        }
      }),
      orphanCitations: rows
        .filter((r) => r.matchType === 'unmatched')
        .map((r) => r.citationKey),
      unusedReferences: refRows
        .filter((r) => !matchedRefIds.has(r.id))
        .map((r) => ({
          id: r.id,
          author: r.author,
          year: r.year,
          title: r.title,
        })),
    }
  })
