import { createServerFn } from '@tanstack/react-start'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { db } from '#/db'
import { jobs, pages } from '#/db/schema'
import { extractPdfText } from '#/services/pdf-extractor'
import { jobIdSchema } from '#/schemas/job'
import { eq } from 'drizzle-orm'

const UPLOADS_DIR = join(process.cwd(), 'uploads')
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
    const [job] = await db
      .insert(jobs)
      .values({
        filename: file.name,
        fileSize: file.size,
        status: 'pending',
      })
      .returning()

    await mkdir(UPLOADS_DIR, { recursive: true })
    const filePath = join(UPLOADS_DIR, `${job.id}.pdf`)
    const buffer = Buffer.from(await file.arrayBuffer())
    await writeFile(filePath, buffer)

    return { jobId: job.id, filename: file.name, fileSize: file.size }
  })

export const processUpload = createServerFn({ method: 'POST' })
  .inputValidator(jobIdSchema)
  .handler(async ({ data: { jobId } }) => {
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
      const filePath = join(UPLOADS_DIR, `${jobId}.pdf`)
      const fileBuffer = await readFile(filePath)
      const result = await extractPdfText(new Uint8Array(fileBuffer))

      for (const page of result.pages) {
        await db.insert(pages).values({
          jobId,
          pageNumber: page.pageNumber,
          content: page.content,
          charCount: page.charCount,
          lowTextDensity: page.lowTextDensity ? 1 : 0,
        })
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
      const message = err instanceof Error ? err.message : 'Extraction failed'
      await db
        .update(jobs)
        .set({ status: 'failed', error: message })
        .where(eq(jobs.id, jobId))
      throw new Error(message)
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
