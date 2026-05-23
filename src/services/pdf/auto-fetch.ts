import { createServerFn } from '@tanstack/react-start'
import { mkdir, writeFile } from 'node:fs/promises'
import { and, asc, eq, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '#/db'
import { references, sourcePages, sourcePdfs } from '#/db/schema'
import { paths } from '#/lib/paths'
import { getErrorMessage } from '#/lib/utils'
import { extractPdfText } from '#/services/pdf/extractor'
import { findPdf } from '#/services/pdf/finder'

const CONCURRENCY = 4
const DOWNLOAD_TIMEOUT_MS = 30_000
const jobIdSchema = z.object({ jobId: z.string().uuid() })

function httpStatusLabel(status: number): string {
  switch (status) {
    case 400:
      return 'Bad Request'
    case 401:
      return 'Unauthorized'
    case 403:
      return 'Access Forbidden'
    case 404:
      return 'Not Found'
    case 408:
      return 'Request Timeout'
    case 410:
      return 'Gone'
    case 429:
      return 'Too Many Requests'
    case 500:
      return 'Server Error'
    case 502:
      return 'Bad Gateway'
    case 503:
      return 'Service Unavailable'
    case 504:
      return 'Gateway Timeout'
    default:
      return `HTTP ${status}`
  }
}

function humanizeFetchError(raw: string, err: unknown): string {
  if (err instanceof Error && err.name === 'TimeoutError') {
    return 'Source PDF took too long to download'
  }
  if (raw.toLowerCase() === 'fetch failed') {
    return 'Failed to get source PDF'
  }
  return raw
}

async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = []
  let idx = 0

  async function worker() {
    while (idx < items.length) {
      const i = idx++
      results[i] = await fn(items[i])
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () =>
    worker(),
  )
  await Promise.all(workers)
  return results
}

interface AutoFetchResult {
  referenceId: number
  status: 'done' | 'failed'
  fetchSource: FetchSource | null
  pdfUrl: string | null
  totalPages: number | null
  error: string | null
}

async function processReference(
  jobId: string,
  ref: {
    id: number
    doi: string | null
    title: string
    author: string
  },
): Promise<AutoFetchResult> {
  const [row] = await db
    .insert(sourcePdfs)
    .values({
      jobId,
      referenceId: ref.id,
      status: 'pending',
    })
    .returning()

  try {
    const found = await findPdf({
      doi: ref.doi,
      title: ref.title,
      author: ref.author,
    })

    if (!found) {
      await db
        .update(sourcePdfs)
        .set({ status: 'failed', error: 'No PDF found via public APIs' })
        .where(eq(sourcePdfs.id, row.id))
      return {
        referenceId: ref.id,
        status: 'failed',
        fetchSource: null,
        pdfUrl: null,
        totalPages: null,
        error: 'No PDF found via public APIs',
      }
    }

    await db
      .update(sourcePdfs)
      .set({
        status: 'downloading',
        pdfUrl: found.url,
        fetchSource: found.source,
      })
      .where(eq(sourcePdfs.id, row.id))

    const pdfRes = await fetch(found.url, {
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
      redirect: 'follow',
    })
    if (!pdfRes.ok) {
      throw new Error(`Download failed: ${httpStatusLabel(pdfRes.status)}`)
    }

    const buffer = new Uint8Array(await pdfRes.arrayBuffer())
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

    await db
      .update(sourcePdfs)
      .set({ status: 'done', totalPages: extracted.totalPages })
      .where(eq(sourcePdfs.id, row.id))

    return {
      referenceId: ref.id,
      status: 'done',
      fetchSource: found.source,
      pdfUrl: found.url,
      totalPages: extracted.totalPages,
      error: null,
    }
  } catch (err) {
    const raw = getErrorMessage(err, 'Auto-fetch failed')
    const message = humanizeFetchError(raw, err)
    await db
      .update(sourcePdfs)
      .set({ status: 'failed', error: message })
      .where(eq(sourcePdfs.id, row.id))
    return {
      referenceId: ref.id,
      status: 'failed',
      fetchSource: null,
      pdfUrl: null,
      totalPages: null,
      error: message,
    }
  }
}

export const autoFetchSources = createServerFn({ method: 'POST' })
  .inputValidator(jobIdSchema)
  .handler(async ({ data: { jobId } }) => {
    const refs = await db
      .select({
        id: references.id,
        doi: references.doi,
        title: references.title,
        author: references.author,
      })
      .from(references)
      .where(eq(references.jobId, jobId))
      .orderBy(asc(references.id))

    if (refs.length === 0) {
      return { jobId, attempted: 0, found: 0, failed: 0 }
    }

    const existing = await db
      .select({ referenceId: sourcePdfs.referenceId })
      .from(sourcePdfs)
      .where(eq(sourcePdfs.jobId, jobId))
    const alreadyCovered = new Set(
      existing
        .map((r) => r.referenceId)
        .filter((id): id is number => id !== null),
    )
    const pending = refs.filter((r) => !alreadyCovered.has(r.id))

    if (pending.length === 0) {
      return { jobId, attempted: 0, found: 0, failed: 0 }
    }

    await mkdir(paths.sourceUploads, { recursive: true })

    const results = await runWithConcurrency(pending, CONCURRENCY, (r) =>
      processReference(jobId, r),
    )

    return {
      jobId,
      attempted: results.length,
      found: results.filter((r) => r.status === 'done').length,
      failed: results.filter((r) => r.status === 'failed').length,
    }
  })

export const getAutoFetchStatus = createServerFn({ method: 'GET' })
  .inputValidator(jobIdSchema)
  .handler(async ({ data: { jobId } }) => {
    const refs = await db
      .select({ id: references.id })
      .from(references)
      .where(eq(references.jobId, jobId))
    const total = refs.length

    const rows = await db
      .select({ status: sourcePdfs.status })
      .from(sourcePdfs)
      .where(
        and(
          eq(sourcePdfs.jobId, jobId),
          inArray(sourcePdfs.referenceId, refs.map((r) => r.id)),
        ),
      )

    const found = rows.filter((r) => r.status === 'done').length
    const failed = rows.filter((r) => r.status === 'failed').length
    const pending = rows.filter(
      (r) =>
        r.status === 'pending' ||
        r.status === 'downloading' ||
        r.status === 'extracting' ||
        r.status === 'found',
    ).length

    return { jobId, total, found, failed, pending }
  })
