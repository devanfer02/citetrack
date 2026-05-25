import { createServerFn } from '@tanstack/react-start'
import { mkdir, rename, unlink, writeFile } from 'node:fs/promises'
import { and, asc, eq, inArray, lt } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '#/db'
import { references, sourcePages, sourcePdfs } from '#/db/schema'
import { getConfig } from '#/services/configurations-cache'
import { paths } from '#/lib/paths'
import { getErrorMessage } from '#/lib/utils'
import { extractPdfText } from '#/services/pdf/extractor'
import { findPdfDiagnostic } from '#/services/pdf/finder'
import { deriveAutoFetchFilename } from '#/services/pdf/source-filename'
import {
  loggedFetch,
  withApiLogContext,
} from '#/services/logs/logged-fetch'

const jobIdSchema = z.object({ jobId: z.string().uuid() })

const IN_FLIGHT_STATUSES = [
  'pending',
  'found',
  'downloading',
  'extracting',
] as const

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

const PDF_MAGIC_BYTES = [0x25, 0x50, 0x44, 0x46] // %PDF

export function looksLikePdfBuffer(buf: Uint8Array): boolean {
  if (buf.length < 4) return false
  return (
    buf[0] === PDF_MAGIC_BYTES[0] &&
    buf[1] === PDF_MAGIC_BYTES[1] &&
    buf[2] === PDF_MAGIC_BYTES[2] &&
    buf[3] === PDF_MAGIC_BYTES[3]
  )
}

type DownloadOutcome =
  | {
      ok: true
      buffer: Uint8Array
      extracted: Awaited<ReturnType<typeof extractPdfText>>
    }
  | { ok: false; error: string }

async function tryDownloadAndExtract(
  url: string,
  downloadTimeoutMs: number,
): Promise<DownloadOutcome> {
  let res: Response
  try {
    res = await loggedFetch(
      { provider: 'pdf-download', metadataOnly: true },
      url,
      {
        signal: AbortSignal.timeout(downloadTimeoutMs),
        redirect: 'follow',
      },
    )
  } catch (err) {
    const raw = getErrorMessage(err, 'Download failed')
    return { ok: false, error: humanizeFetchError(raw, err) }
  }

  if (!res.ok) {
    return { ok: false, error: httpStatusLabel(res.status) }
  }

  const contentType = res.headers.get('content-type') ?? ''
  const buffer = new Uint8Array(await res.arrayBuffer())

  if (buffer.byteLength === 0) {
    return { ok: false, error: 'empty body' }
  }
  if (!looksLikePdfBuffer(buffer)) {
    const ctLabel = contentType ? ` (content-type: ${contentType})` : ''
    return { ok: false, error: `not a PDF${ctLabel}` }
  }

  try {
    const extracted = await extractPdfText(buffer)
    if (extracted.pages.length === 0) {
      return { ok: false, error: 'PDF has no extractable text (scanned image?)' }
    }
    return { ok: true, buffer, extracted }
  } catch (err) {
    const raw = getErrorMessage(err, 'PDF extraction failed')
    return { ok: false, error: raw }
  }
}

type AutoFetchRef = {
  id: number
  doi: string | null
  title: string
  author: string
  year: string
}

async function processReference(
  jobId: string,
  ref: AutoFetchRef,
  downloadTimeoutMs: number,
): Promise<AutoFetchResult> {
  try {
    return await withApiLogContext({ trackJobId: jobId }, () =>
      processReferenceInner(jobId, ref, downloadTimeoutMs),
    )
  } catch (err) {
    // Never let one reference take down the rest of the batch. Best-effort
    // mark the row failed so the UI doesn't stay stuck "in-flight".
    const message = `Unhandled: ${getErrorMessage(err, 'unknown error')}`
    await db
      .update(sourcePdfs)
      .set({ status: 'failed', error: message })
      .where(
        and(
          eq(sourcePdfs.jobId, jobId),
          eq(sourcePdfs.referenceId, ref.id),
        ),
      )
      .catch(() => {})
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

async function processReferenceInner(
  jobId: string,
  ref: AutoFetchRef,
  downloadTimeoutMs: number,
): Promise<AutoFetchResult> {
  const [row] = await db
    .insert(sourcePdfs)
    .values({
      jobId,
      referenceId: ref.id,
      filename: deriveAutoFetchFilename(ref),
      status: 'pending',
    })
    .returning()

  const attempts = await findPdfDiagnostic({
    doi: ref.doi,
    title: ref.title,
    author: ref.author,
  })

  const candidates: Array<{ url: string; source: FetchSource }> = []
  const seenUrls = new Set<string>()
  for (const a of attempts) {
    if (!a.result || seenUrls.has(a.result.url)) continue
    seenUrls.add(a.result.url)
    candidates.push({ url: a.result.url, source: a.result.source })
  }

  if (candidates.length === 0) {
    const message = 'No PDF found via public APIs'
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

  const providerErrors: string[] = []
  for (const candidate of candidates) {
    await db
      .update(sourcePdfs)
      .set({
        status: 'downloading',
        pdfUrl: candidate.url,
        fetchSource: candidate.source,
      })
      .where(eq(sourcePdfs.id, row.id))

    const outcome = await tryDownloadAndExtract(candidate.url, downloadTimeoutMs)
    if (!outcome.ok) {
      providerErrors.push(`${candidate.source}: ${outcome.error}`)
      continue
    }

    // Write file + insert pages BEFORE flipping status, so a mid-flight crash
    // (HMR reload, kill -9, OOM) leaves the row at 'downloading' for the
    // staleness sweeper rather than at 'extracting' with a 0-byte file.
    // Tempfile + rename keeps the on-disk PDF atomic.
    const finalPath = paths.sourcePdf(row.id)
    const tmpPath = `${finalPath}.tmp`
    try {
      await writeFile(tmpPath, outcome.buffer)
      await rename(tmpPath, finalPath)
    } catch (err) {
      await unlink(tmpPath).catch(() => {})
      throw err
    }

    if (outcome.extracted.pages.length > 0) {
      await db.insert(sourcePages).values(
        outcome.extracted.pages.map((p) => ({
          sourcePdfId: row.id,
          pageNumber: p.pageNumber,
          content: p.content,
          charCount: p.charCount,
        })),
      )
    }

    await db
      .update(sourcePdfs)
      .set({ status: 'done', totalPages: outcome.extracted.totalPages })
      .where(eq(sourcePdfs.id, row.id))

    return {
      referenceId: ref.id,
      status: 'done',
      fetchSource: candidate.source,
      pdfUrl: candidate.url,
      totalPages: outcome.extracted.totalPages,
      error: null,
    }
  }

  const aggregated = `All providers failed (${providerErrors.length} tried): ${providerErrors.join('; ')}`
  await db
    .update(sourcePdfs)
    .set({ status: 'failed', error: aggregated })
    .where(eq(sourcePdfs.id, row.id))
  return {
    referenceId: ref.id,
    status: 'failed',
    fetchSource: null,
    pdfUrl: null,
    totalPages: null,
    error: aggregated,
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
        year: references.year,
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

    const [concurrency, downloadTimeoutMs] = await Promise.all([
      getConfig('autofetch.concurrency'),
      getConfig('autofetch.download_timeout_ms'),
    ])

    const results = await runWithConcurrency(pending, concurrency, (r) =>
      processReference(jobId, r, downloadTimeoutMs),
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
    const stalenessMs = await getConfig('autofetch.staleness_timeout_ms')
    const cutoff = new Date(Date.now() - stalenessMs)

    await db
      .update(sourcePdfs)
      .set({
        status: 'failed',
        error: 'Auto-detect timed out (no progress within configured window)',
      })
      .where(
        and(
          eq(sourcePdfs.jobId, jobId),
          inArray(sourcePdfs.status, IN_FLIGHT_STATUSES),
          lt(sourcePdfs.updatedAt, cutoff),
        ),
      )

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
    const pending = rows.filter((r) =>
      (IN_FLIGHT_STATUSES as readonly string[]).includes(r.status),
    ).length

    return { jobId, total, found, failed, pending }
  })
