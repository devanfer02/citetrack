import { eq } from 'drizzle-orm'
import { createServerFn } from '@tanstack/react-start'
import { db } from '#/db'
import { evaluationJobs, evaluationPages } from '#/db/schema'
import { getErrorMessage } from '#/lib/utils'
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

export const processEvaluationUpload = createServerFn({ method: 'POST' })
  .inputValidator(evalJobIdSchema)
  .handler(async ({ data: { evalJobId } }) => {
    const { readFile } = await import('node:fs/promises')
    const { paths } = await import('#/lib/paths')
    const { extractPdfText } = await import('#/services/pdf/extractor')

    const [job] = await db
      .select()
      .from(evaluationJobs)
      .where(eq(evaluationJobs.id, evalJobId))
      .limit(1)

    if (!job) throw new Error('Evaluation job not found')

    await db
      .update(evaluationJobs)
      .set({ status: 'extracting' })
      .where(eq(evaluationJobs.id, evalJobId))

    try {
      const fileBuffer = await readFile(paths.evaluationPdf(evalJobId))
      const result = await extractPdfText(new Uint8Array(fileBuffer))

      if (result.pages.length > 0) {
        await db.insert(evaluationPages).values(
          result.pages.map((page) => ({
            evalJobId,
            pageNumber: page.pageNumber,
            content: page.content,
            charCount: page.charCount,
            lowTextDensity: page.lowTextDensity ? 1 : 0,
            codeRanges: page.codeRanges,
            italicRanges: page.italicRanges,
          })),
        )
      }

      await db
        .update(evaluationJobs)
        .set({
          totalPages: result.totalPages,
          extractedPages: result.pages.length,
        })
        .where(eq(evaluationJobs.id, evalJobId))

      const { runEvaluationAnalysis } = await import(
        '#/services/evaluation/orchestrator'
      )
      setImmediate(() => {
        console.log('[evaluation] starting background analysis', evalJobId)
        runEvaluationAnalysis(evalJobId).catch((err) => {
          console.error('[evaluation] background analysis failed', err)
          if (err instanceof Error && err.cause) {
            console.error('[evaluation] cause:', err.cause)
          }
        })
      })

      return {
        evalJobId,
        totalPages: result.totalPages,
        extractedPages: result.pages.length,
        scannedWarning: result.scannedWarning,
      }
    } catch (err) {
      const message = getErrorMessage(err, 'Extraction failed')
      await db
        .update(evaluationJobs)
        .set({ status: 'failed', error: message })
        .where(eq(evaluationJobs.id, evalJobId))
      throw new Error(message, { cause: err })
    }
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
