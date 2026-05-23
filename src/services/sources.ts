import { createServerFn } from '@tanstack/react-start'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { db } from '#/db'
import { references, sourcePdfs, sourcePages } from '#/db/schema'
import { jobIdSchema } from '#/schemas/job'
import { findPdf } from '#/services/pdf-finder'
import { extractPdfText } from '#/services/pdf-extractor'
import { eq, asc } from 'drizzle-orm'

const SOURCES_DIR = join(process.cwd(), 'uploads', 'sources')

export const fetchSourcesForJob = createServerFn({ method: 'POST' })
  .inputValidator(jobIdSchema)
  .handler(async ({ data: { jobId } }) => {
    const refs = await db
      .select()
      .from(references)
      .where(eq(references.jobId, jobId))
      .orderBy(asc(references.id))

    if (refs.length === 0) {
      throw new Error('No references found. Run reference parsing first.')
    }

    await mkdir(SOURCES_DIR, { recursive: true })

    const results: SourceFetchResult[] = []

    for (const ref of refs) {
      // Create source_pdfs record
      const [sourcePdf] = await db
        .insert(sourcePdfs)
        .values({
          jobId,
          referenceId: ref.id,
          status: 'pending',
        })
        .returning()

      try {
        // Find PDF URL
        await db
          .update(sourcePdfs)
          .set({ status: 'found' })
          .where(eq(sourcePdfs.id, sourcePdf.id))

        const found = await findPdf({
          doi: ref.doi,
          title: ref.title,
          author: ref.author,
        })

        if (!found) {
          await db
            .update(sourcePdfs)
            .set({ status: 'failed', error: 'No PDF source found' })
            .where(eq(sourcePdfs.id, sourcePdf.id))

          results.push({
            referenceId: ref.id,
            author: ref.author,
            title: ref.title,
            status: 'failed',
            pdfUrl: null,
            fetchSource: null,
            totalPages: null,
            error: 'No PDF source found',
          })
          continue
        }

        // Download PDF
        await db
          .update(sourcePdfs)
          .set({
            status: 'downloading',
            pdfUrl: found.url,
            fetchSource: found.source,
          })
          .where(eq(sourcePdfs.id, sourcePdf.id))

        const pdfRes = await fetch(found.url, {
          signal: AbortSignal.timeout(30000),
        })

        if (!pdfRes.ok) {
          throw new Error(`Download failed: HTTP ${pdfRes.status}`)
        }

        const pdfBuffer = new Uint8Array(await pdfRes.arrayBuffer())
        const filePath = join(SOURCES_DIR, `${sourcePdf.id}.pdf`)
        await writeFile(filePath, pdfBuffer)

        // Extract text
        await db
          .update(sourcePdfs)
          .set({ status: 'extracting' })
          .where(eq(sourcePdfs.id, sourcePdf.id))

        const extracted = await extractPdfText(pdfBuffer)

        if (extracted.pages.length > 0) {
          await db.insert(sourcePages).values(
            extracted.pages.map((p) => ({
              sourcePdfId: sourcePdf.id,
              pageNumber: p.pageNumber,
              content: p.content,
              charCount: p.charCount,
            })),
          )
        }

        await db
          .update(sourcePdfs)
          .set({ status: 'done', totalPages: extracted.totalPages })
          .where(eq(sourcePdfs.id, sourcePdf.id))

        results.push({
          referenceId: ref.id,
          author: ref.author,
          title: ref.title,
          status: 'done',
          pdfUrl: found.url,
          fetchSource: found.source,
          totalPages: extracted.totalPages,
          error: null,
        })
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Source fetch failed'
        await db
          .update(sourcePdfs)
          .set({ status: 'failed', error: message })
          .where(eq(sourcePdfs.id, sourcePdf.id))

        results.push({
          referenceId: ref.id,
          author: ref.author,
          title: ref.title,
          status: 'failed',
          pdfUrl: null,
          fetchSource: null,
          totalPages: null,
          error: message,
        })
      }
    }

    const found = results.filter((r) => r.status === 'done').length
    const failed = results.filter((r) => r.status === 'failed').length

    return { jobId, results, found, failed, total: refs.length }
  })

export const getSourcesForJob = createServerFn({ method: 'GET' })
  .inputValidator(jobIdSchema)
  .handler(async ({ data: { jobId } }) => {
    const rows = await db
      .select({
        id: sourcePdfs.id,
        referenceId: sourcePdfs.referenceId,
        pdfUrl: sourcePdfs.pdfUrl,
        fetchSource: sourcePdfs.fetchSource,
        status: sourcePdfs.status,
        totalPages: sourcePdfs.totalPages,
        error: sourcePdfs.error,
        author: references.author,
        title: references.title,
      })
      .from(sourcePdfs)
      .innerJoin(references, eq(sourcePdfs.referenceId, references.id))
      .where(eq(sourcePdfs.jobId, jobId))
      .orderBy(asc(sourcePdfs.id))

    return { sources: rows }
  })
