import { eq } from 'drizzle-orm'
import { createServerFn } from '@tanstack/react-start'
import { db } from '#/db'
import { evaluationJobs } from '#/db/schema'
import { evalJobIdSchema } from '#/schemas/evaluation'
import {
  assertWithinUploadLimit,
  ensureFormData,
  getPdfFile,
} from '#/services/pdf/upload-helpers'

export const uploadEvaluationThesis = createServerFn({ method: 'POST' })
  .inputValidator((data) => ({ file: getPdfFile(ensureFormData(data)) }))
  .handler(async ({ data: { file } }) => {
    await assertWithinUploadLimit(file)
    const { mkdir, writeFile } = await import('node:fs/promises')
    const { paths } = await import('#/lib/paths')

    const [job] = await db
      .insert(evaluationJobs)
      .values({
        filename: file.name,
        fileSize: file.size,
        status: 'pending',
      })
      .returning()

    await mkdir(paths.evaluationUploads, { recursive: true })

    const filePath = paths.evaluationPdf(job.id)
    const buffer = Buffer.from(await file.arrayBuffer())
    await writeFile(filePath, buffer)

    return {
      evalJobId: job.id,
      filename: file.name,
      fileSize: file.size,
    }
  })

// Kicks off the evaluation pipeline (extract + KBBI/EYD analysis) in the
// background and returns immediately. The work runs detached (see
// job-runner.ts) so it survives the browser tab closing, and the
// recovery sweep resumes it if the process restarts mid-run. The client
// polls getEvaluationJob for status.
export const processEvaluationUpload = createServerFn({ method: 'POST' })
  .inputValidator(evalJobIdSchema)
  .handler(async ({ data: { evalJobId } }) => {
    const [job] = await db
      .select({ id: evaluationJobs.id })
      .from(evaluationJobs)
      .where(eq(evaluationJobs.id, evalJobId))
      .limit(1)

    if (!job) throw new Error('Evaluation job not found')

    const { dispatchEvaluationJob } = await import(
      '#/services/evaluation/job-runner'
    )
    dispatchEvaluationJob(evalJobId)

    return { evalJobId }
  })

export const getEvaluationJob = createServerFn({ method: 'GET' })
  .inputValidator(evalJobIdSchema)
  .handler(async ({ data: { evalJobId } }) => {
    const [job] = await db
      .select()
      .from(evaluationJobs)
      .where(eq(evaluationJobs.id, evalJobId))
      .limit(1)

    if (!job) throw new Error('Evaluation job not found')
    return job
  })
