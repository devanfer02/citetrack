import { createServerFn } from '@tanstack/react-start'
import { db } from '#/db'
import { citations, pages } from '#/db/schema'
import {
  groupCitations,
  parseCitationsFromPages,
} from '#/services/citation-parser'
import { jobIdSchema } from '#/schemas/job'
import { eq, asc } from 'drizzle-orm'

export const parseCitationsForJob = createServerFn({ method: 'POST' })
  .inputValidator(jobIdSchema)
  .handler(async ({ data: { jobId } }) => {
    const jobPages = await db
      .select({ pageNumber: pages.pageNumber, content: pages.content })
      .from(pages)
      .where(eq(pages.jobId, jobId))
      .orderBy(asc(pages.pageNumber))

    if (jobPages.length === 0) {
      throw new Error('No pages found for this job. Run text extraction first.')
    }

    const matches = parseCitationsFromPages(jobPages)

    if (matches.length > 0) {
      await db.insert(citations).values(
        matches.map((m) => ({
          jobId,
          citationKey: m.citationKey,
          thesisPage: m.thesisPage,
          thesisContext: m.thesisContext,
          rawMatch: m.rawMatch,
        })),
      )
    }

    const grouped = groupCitations(matches)

    return {
      jobId,
      totalCitations: matches.length,
      uniqueCitations: grouped.length,
      citations: grouped,
    }
  })

export const getCitationsForJob = createServerFn({ method: 'GET' })
  .inputValidator(jobIdSchema)
  .handler(async ({ data: { jobId } }): Promise<{
    totalCitations: number
    uniqueCitations: number
    citations: GroupedCitation[]
  }> => {
    const rows = await db
      .select()
      .from(citations)
      .where(eq(citations.jobId, jobId))
      .orderBy(asc(citations.thesisPage))

    if (rows.length === 0) {
      return { totalCitations: 0, uniqueCitations: 0, citations: [] }
    }

    const grouped = groupCitations(
      rows.map((r) => ({
        citationKey: r.citationKey,
        thesisPage: r.thesisPage,
        thesisContext: r.thesisContext,
        rawMatch: r.rawMatch,
      })),
    )

    return {
      totalCitations: rows.length,
      uniqueCitations: grouped.length,
      citations: grouped,
    }
  })
