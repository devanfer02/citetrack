import { createServerFn } from '@tanstack/react-start'
import { db } from '#/db'
import { jobs } from '#/db/schema'
import { jobIdSchema } from '#/schemas/job'
import { eq } from 'drizzle-orm'
import {
  assertWithinUploadLimit,
  ensureFormData,
  getPdfFile,
} from '#/services/pdf/upload-helpers'

export const uploadThesis = createServerFn({ method: 'POST' })
  .inputValidator((data) => ({ file: getPdfFile(ensureFormData(data)) }))
  .handler(async ({ data: { file } }) => {
    await assertWithinUploadLimit(file)
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

// Kicks off extraction in the background and returns immediately. The
// actual work runs detached (see job-runner.ts) so closing the browser
// tab doesn't strand the job, and the recovery sweep can resume it if
// the process restarts mid-run. The client polls getJob for status.
export const processUpload = createServerFn({ method: 'POST' })
  .inputValidator(jobIdSchema)
  .handler(async ({ data: { jobId } }) => {
    const [job] = await db
      .select({ id: jobs.id })
      .from(jobs)
      .where(eq(jobs.id, jobId))
      .limit(1)

    if (!job) throw new Error('Job not found')

    const { dispatchTrackJob } = await import('#/services/pdf/job-runner')
    dispatchTrackJob(jobId)

    return { jobId }
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
