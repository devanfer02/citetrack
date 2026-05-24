import { AsyncLocalStorage } from 'node:async_hooks'
import { db } from '#/db'
import { apiCallLogs } from '#/db/schema'
import { getErrorMessage } from '#/lib/utils'
import { applyPolitePool } from '#/services/logs/polite-pool'
import {
  API_PROVIDERS,
  type ApiCallOutcome,
  type ApiProvider,
} from '#/services/logs/providers'

export { API_PROVIDERS }
export type { ApiCallOutcome, ApiProvider }

interface ApiLogStore {
  trackJobId?: string
  evalJobId?: string
}

const apiLogStorage = new AsyncLocalStorage<ApiLogStore>()

export function withApiLogContext<T>(
  store: ApiLogStore,
  fn: () => Promise<T>,
): Promise<T> {
  return apiLogStorage.run(store, fn)
}

export interface LogContext {
  provider: ApiProvider
  trackJobId?: string | null
  evalJobId?: string | null
  /** Skip body capture entirely — use for binary downloads. */
  metadataOnly?: boolean
}

const SUCCESS_PREVIEW_BYTES = 2 * 1024
const ERROR_PREVIEW_BYTES = 1024 * 1024

const RELEVANT_HEADERS = new Set([
  'content-type',
  'content-length',
  'retry-after',
])
const RATELIMIT_PREFIX = 'x-ratelimit-'

function pickRelevantHeaders(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of headers.entries()) {
    const lc = key.toLowerCase()
    if (RELEVANT_HEADERS.has(lc) || lc.startsWith(RATELIMIT_PREFIX)) {
      out[lc] = value
    }
  }
  return out
}

interface LogRow {
  ctx: LogContext
  url: string
  method: string
  durationMs: number
  status: number | null
  outcome: ApiCallOutcome
  errorMessage: string | null
  responseHeaders: Record<string, string> | null
  bodyPreview: string | null
  bodyTruncated: boolean
  bodySizeBytes: number | null
}

function writeLog(row: LogRow): void {
  const inherited = apiLogStorage.getStore()
  const trackJobId = row.ctx.trackJobId ?? inherited?.trackJobId ?? null
  const evalJobId = row.ctx.evalJobId ?? inherited?.evalJobId ?? null
  void db
    .insert(apiCallLogs)
    .values({
      trackJobId,
      evalJobId,
      provider: row.ctx.provider,
      method: row.method,
      url: row.url,
      status: row.status,
      responseHeaders: row.responseHeaders,
      bodyPreview: row.bodyPreview,
      bodyTruncated: row.bodyTruncated,
      bodySizeBytes: row.bodySizeBytes,
      outcome: row.outcome,
      errorMessage: row.errorMessage,
      durationMs: row.durationMs,
    })
    .catch(() => {
      // Logging must never fail the caller — swallow DB errors silently.
    })
}

async function readBodyWithCap(
  res: Response,
  cap: number,
): Promise<{ text: string; size: number; truncated: boolean }> {
  const reader = res.body?.getReader()
  if (!reader) {
    return { text: '', size: 0, truncated: false }
  }

  const decoder = new TextDecoder('utf-8', { fatal: false })
  let text = ''
  let totalBytes = 0
  let truncated = false

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    totalBytes += value.byteLength

    if (text.length < cap) {
      const remainingChars = cap - text.length
      const chunkText = decoder.decode(value, { stream: true })
      if (chunkText.length <= remainingChars) {
        text += chunkText
      } else {
        text += chunkText.slice(0, remainingChars)
        truncated = true
        await reader.cancel().catch(() => {})
        break
      }
    } else {
      truncated = true
      await reader.cancel().catch(() => {})
      break
    }
  }

  // Flush any pending multi-byte sequence from the decoder.
  if (!truncated) {
    text += decoder.decode()
  }

  return { text, size: totalBytes, truncated }
}

export async function loggedFetch(
  ctx: LogContext,
  url: string,
  init?: RequestInit,
): Promise<Response> {
  const start = Date.now()
  const polite = applyPolitePool(ctx.provider, url, init)
  const effectiveUrl = polite.url
  const effectiveInit = polite.init
  const method = effectiveInit?.method ?? init?.method ?? 'GET'

  let res: Response
  try {
    res = await fetch(effectiveUrl, effectiveInit)
  } catch (err) {
    const durationMs = Date.now() - start
    const isTimeout =
      err instanceof Error &&
      (err.name === 'TimeoutError' || err.name === 'AbortError')
    writeLog({
      ctx,
      url: effectiveUrl,
      method,
      durationMs,
      status: null,
      outcome: isTimeout ? 'timeout' : 'network_error',
      errorMessage: getErrorMessage(err, 'fetch failed'),
      responseHeaders: null,
      bodyPreview: null,
      bodyTruncated: false,
      bodySizeBytes: null,
    })
    throw err
  }

  const durationMs = Date.now() - start
  const headers = pickRelevantHeaders(res.headers)
  const outcome: ApiCallOutcome = res.ok ? 'success' : 'http_error'

  if (ctx.metadataOnly) {
    const contentLengthHeader = res.headers.get('content-length')
    const bodySizeBytes = contentLengthHeader
      ? Number.parseInt(contentLengthHeader, 10)
      : null
    writeLog({
      ctx,
      url: effectiveUrl,
      method,
      durationMs,
      status: res.status,
      outcome,
      errorMessage: null,
      responseHeaders: headers,
      bodyPreview: null,
      bodyTruncated: false,
      bodySizeBytes: Number.isFinite(bodySizeBytes) ? bodySizeBytes : null,
    })
    return res
  }

  const cap = res.ok ? SUCCESS_PREVIEW_BYTES : ERROR_PREVIEW_BYTES
  const clone = res.clone()

  void readBodyWithCap(clone, cap)
    .then(({ text, size, truncated }) => {
      writeLog({
        ctx,
        url: effectiveUrl,
        method,
        durationMs,
        status: res.status,
        outcome,
        errorMessage: null,
        responseHeaders: headers,
        bodyPreview: text,
        bodyTruncated: truncated,
        bodySizeBytes: size,
      })
    })
    .catch((err: unknown) => {
      writeLog({
        ctx,
        url: effectiveUrl,
        method,
        durationMs,
        status: res.status,
        outcome,
        errorMessage: getErrorMessage(err, 'body read failed during logging'),
        responseHeaders: headers,
        bodyPreview: null,
        bodyTruncated: false,
        bodySizeBytes: null,
      })
    })

  return res
}
