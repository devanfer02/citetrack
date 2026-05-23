import { createServerFn } from '@tanstack/react-start'
import { db } from '#/db'
import { citations, passageMatches } from '#/db/schema'
import { jobIdSchema } from '#/schemas/job'
import { eq, asc } from 'drizzle-orm'

export const matchPassagesForJob = createServerFn({ method: 'POST' })
  .inputValidator(jobIdSchema)
  .handler(async (): Promise<never> => {
    throw new Error(
      'Passage matching is being rewritten to be LLM-free. Upload your reference PDFs first, then try again.',
    )
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
