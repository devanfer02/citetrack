import { createServerFn } from '@tanstack/react-start'
import { mkdir, writeFile } from 'node:fs/promises'
import { asc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '#/db'
import { references, sourcePages, sourcePdfs } from '#/db/schema'
import { paths } from '#/lib/paths'
import { getErrorMessage } from '#/lib/utils'
import { extractPdfText } from '#/services/pdf/extractor'
import {
  pickBestReference,
  type TitleCandidate,
} from '#/services/matcher/title-matcher'
import { deriveAutoFetchFilename } from '#/services/pdf/source-filename'
import {
  assertAllWithinUploadLimit,
  ensureFormData,
  getPdfFiles,
} from '#/services/pdf/upload-helpers'

export interface SourceUploadResult {
  sourcePdfId: number
  filename: string
  referenceId: number | null
  pairConfidence: number
  totalPages: number | null
  status: 'done' | 'failed'
  error: string | null
}

export const uploadSourcePdfs = createServerFn({ method: 'POST' })
  .inputValidator((data) => {
    const form = ensureFormData(data)
    const jobId = form.get('jobId')
    if (typeof jobId !== 'string' || jobId.length === 0) {
      throw new Error('jobId is required')
    }
    return { jobId, files: getPdfFiles(form) }
  })
  .handler(async ({ data: { jobId, files } }) => {
    await assertAllWithinUploadLimit(files)
    const refs = await db
      .select({
        id: references.id,
        author: references.author,
        year: references.year,
        title: references.title,
      })
      .from(references)
      .where(eq(references.jobId, jobId))
      .orderBy(asc(references.id))

    const candidates: TitleCandidate[] = refs.map((r) => ({
      referenceId: r.id,
      author: r.author,
      year: r.year,
      title: r.title,
    }))

    await mkdir(paths.sourceUploads, { recursive: true })

    const results: SourceUploadResult[] = []
    for (const file of files) {
      const [row] = await db
        .insert(sourcePdfs)
        .values({
          jobId,
          filename: file.name,
          fetchSource: 'manual',
          status: 'pending',
        })
        .returning()

      try {
        const buffer = new Uint8Array(await file.arrayBuffer())
        await writeFile(paths.sourcePdf(row.id), buffer)

        await db
          .update(sourcePdfs)
          .set({ status: 'extracting' })
          .where(eq(sourcePdfs.id, row.id))

        const extracted = await extractPdfText(buffer)

        if (extracted.pages.length > 0) {
          await db.insert(sourcePages).values(
            extracted.pages.map((p) => ({
              sourcePdfId: row.id,
              pageNumber: p.pageNumber,
              content: p.content,
              charCount: p.charCount,
            })),
          )
        }

        const firstPage = extracted.pages[0]?.content ?? ''
        const pair = pickBestReference(file.name, firstPage, candidates)

        await db
          .update(sourcePdfs)
          .set({
            status: 'done',
            totalPages: extracted.totalPages,
            referenceId: pair.referenceId,
          })
          .where(eq(sourcePdfs.id, row.id))

        results.push({
          sourcePdfId: row.id,
          filename: file.name,
          referenceId: pair.referenceId,
          pairConfidence: Math.round(pair.confidence * 100) / 100,
          totalPages: extracted.totalPages,
          status: 'done',
          error: null,
        })
      } catch (err) {
        const message = getErrorMessage(err, 'Upload processing failed')
        await db
          .update(sourcePdfs)
          .set({ status: 'failed', error: message })
          .where(eq(sourcePdfs.id, row.id))

        results.push({
          sourcePdfId: row.id,
          filename: file.name,
          referenceId: null,
          pairConfidence: 0,
          totalPages: null,
          status: 'failed',
          error: message,
        })
      }
    }

    return { jobId, uploads: results }
  })

const pairInputSchema = z.object({
  sourcePdfId: z.number().int().positive(),
  referenceId: z.number().int().positive().nullable(),
})

export const pairSourcePdf = createServerFn({ method: 'POST' })
  .inputValidator(pairInputSchema)
  .handler(async ({ data: { sourcePdfId, referenceId } }) => {
    await db
      .update(sourcePdfs)
      .set({ referenceId })
      .where(eq(sourcePdfs.id, sourcePdfId))
    return { sourcePdfId, referenceId }
  })

const jobIdSchema = z.object({ jobId: z.string().uuid() })

export const getSourceUploadsForJob = createServerFn({ method: 'GET' })
  .inputValidator(jobIdSchema)
  .handler(async ({ data: { jobId } }) => {
    const rawUploads = await db
      .select({
        sourcePdfId: sourcePdfs.id,
        filename: sourcePdfs.filename,
        referenceId: sourcePdfs.referenceId,
        totalPages: sourcePdfs.totalPages,
        status: sourcePdfs.status,
        error: sourcePdfs.error,
        fetchSource: sourcePdfs.fetchSource,
      })
      .from(sourcePdfs)
      .where(eq(sourcePdfs.jobId, jobId))
      .orderBy(asc(sourcePdfs.id))

    const refs = await db
      .select({
        id: references.id,
        author: references.author,
        year: references.year,
        title: references.title,
      })
      .from(references)
      .where(eq(references.jobId, jobId))
      .orderBy(asc(references.id))

    const refById = new Map(refs.map((r) => [r.id, r]))
    const uploads = rawUploads.map((u) => {
      if (u.filename !== null) return u
      const ref = u.referenceId === null ? null : refById.get(u.referenceId)
      return {
        ...u,
        filename: ref ? deriveAutoFetchFilename(ref) : null,
      }
    })

    return { jobId, uploads, references: refs }
  })
