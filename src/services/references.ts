import { createServerFn } from '@tanstack/react-start'
import { db } from '#/db'
import { pages, references } from '#/db/schema'
import { parseReferences } from '#/services/reference-parser'
import { jobIdSchema } from '#/schemas/job'
import { eq, asc } from 'drizzle-orm'

export const parseReferencesForJob = createServerFn({ method: 'POST' })
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

    const parsed = parseReferences(jobPages)

    if (parsed.length > 0) {
      await db.insert(references).values(
        parsed.map((r) => ({
          jobId,
          author: r.author,
          year: r.year,
          title: r.title,
          doi: r.doi,
          url: r.url,
          publisher: r.publisher,
          journal: r.journal,
          rawText: r.rawText,
          startPage: r.startPage,
        })),
      )
    }

    return {
      jobId,
      totalReferences: parsed.length,
      references: parsed,
    }
  })

export const getReferencesForJob = createServerFn({ method: 'GET' })
  .inputValidator(jobIdSchema)
  .handler(async ({ data: { jobId } }): Promise<{
    totalReferences: number
    references: ParsedReference[]
  }> => {
    const rows = await db
      .select()
      .from(references)
      .where(eq(references.jobId, jobId))
      .orderBy(asc(references.id))

    return {
      totalReferences: rows.length,
      references: rows.map((r) => ({
        author: r.author,
        year: r.year,
        title: r.title,
        doi: r.doi,
        url: r.url,
        publisher: r.publisher,
        journal: r.journal,
        rawText: r.rawText,
        startPage: r.startPage,
      })),
    }
  })
