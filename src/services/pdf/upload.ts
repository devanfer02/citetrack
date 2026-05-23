import { createServerFn } from '@tanstack/react-start'
import { db } from '#/db'
import { jobs, pages } from '#/db/schema'
import { jobIdSchema } from '#/schemas/job'
import { getErrorMessage } from '#/lib/utils'
import { eq } from 'drizzle-orm'

const MAX_FILE_SIZE = 50 * 1024 * 1024

export const uploadThesis = createServerFn({ method: 'POST' })
  .inputValidator((data) => {
    if (!(data instanceof FormData)) {
      throw new Error('Expected FormData')
    }
    const file = data.get('file')
    if (!(file instanceof File)) {
      throw new Error('No file provided')
    }
    if (file.type !== 'application/pdf') {
      throw new Error('Only PDF files are accepted')
    }
    if (file.size > MAX_FILE_SIZE) {
      throw new Error('File size exceeds 50MB limit')
    }
    return { file }
  })
  .handler(async ({ data: { file } }) => {
    const { mkdir, writeFile } = await import('node:fs/promises')
    const { paths } = await import('#/lib/paths')

    const [job] = await db
      .insert(jobs)
      .values({
        filename: file.name,
        fileSize: file.size,
        status: 'pending',
      })
      .returning()

    await mkdir(paths.userUploads, { recursive: true })

    const filePath = paths.userPdf(job.id)
    const buffer = Buffer.from(await file.arrayBuffer())
    await writeFile(filePath, buffer)

    void compressInBackground(job.id)

    return {
      jobId: job.id,
      filename: file.name,
      fileSize: file.size,
    }
  })

async function compressInBackground(jobId: string) {
  try {
    const { paths } = await import('#/lib/paths')
    const { compressPdf } = await import('#/services/pdf/compressor')

    await compressPdf(paths.userPdf(jobId), paths.userPdfPreview(jobId), 'ebook')
  } catch {
    // Compression failed — preview will serve the original
  }
}

export const processUpload = createServerFn({ method: 'POST' })
  .inputValidator(jobIdSchema)
  .handler(async ({ data: { jobId } }) => {
    const { readFile } = await import('node:fs/promises')
    const { paths } = await import('#/lib/paths')
    const { extractPdfText } = await import('#/services/pdf/extractor')

    const [job] = await db
      .select()
      .from(jobs)
      .where(eq(jobs.id, jobId))
      .limit(1)

    if (!job) throw new Error('Job not found')

    await db
      .update(jobs)
      .set({ status: 'extracting' })
      .where(eq(jobs.id, jobId))

    try {
      const fileBuffer = await readFile(paths.userPdf(jobId))
      const result = await extractPdfText(new Uint8Array(fileBuffer))

      if (result.pages.length > 0) {
        await db.insert(pages).values(
          result.pages.map((page) => ({
            jobId,
            pageNumber: page.pageNumber,
            content: page.content,
            charCount: page.charCount,
            lowTextDensity: page.lowTextDensity ? 1 : 0,
          })),
        )
      }

      await db
        .update(jobs)
        .set({
          status: 'done',
          totalPages: result.totalPages,
          extractedPages: result.pages.length,
        })
        .where(eq(jobs.id, jobId))

      return {
        jobId,
        totalPages: result.totalPages,
        extractedPages: result.pages.length,
        scannedWarning: result.scannedWarning,
      }
    } catch (err) {
      const message = getErrorMessage(err, 'Extraction failed')
      await db
        .update(jobs)
        .set({ status: 'failed', error: message })
        .where(eq(jobs.id, jobId))
      throw new Error(message, { cause: err })
    }
  })

export const getJob = createServerFn({ method: 'GET' })
  .inputValidator(jobIdSchema)
  .handler(async ({ data: { jobId } }) => {
    const [job] = await db
      .select()
      .from(jobs)
      .where(eq(jobs.id, jobId))
      .limit(1)

    if (!job) throw new Error('Job not found')
    return job
  })
