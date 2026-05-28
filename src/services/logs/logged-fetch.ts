import { AsyncLocalStorage } from 'node:async_hooks'
import { db } from '#/db'
import { apiCallLogs } from '#/db/schema'
import {
  hostOf,
  isHostPaused,
  parseRetryAfter,
  pauseHost,
  throttleHost,
} from '#/lib/http-throttle'
import { LookupTimeoutError } from '#/lib/lookup-timeout'
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
  const host = hostOf(effectiveUrl)

  // Fast-fail when this host is in cooldown from a recent 429/503.
  // Synthetic 429 response so callers see the normal !res.ok path and
  // fall through to the next provider in their chain.
  if (isHostPaused(host)) {
    writeLog({
      ctx,
      url: effectiveUrl,
      method,
      durationMs: 0,
      status: 429,
      outcome: 'http_error',
      errorMessage: `host ${host} paused (rate-limit cooldown)`,
      responseHeaders: null,
      bodyPreview: null,
      bodyTruncated: false,
      bodySizeBytes: null,
    })
    return new Response(null, {
      status: 429,
      statusText: 'Host paused',
    })
  }

  await throttleHost(host, effectiveInit?.signal ?? undefined).catch(() => {
    // Abort/timeout from caller — let the actual fetch surface it
    // through its own AbortError path below.
  })

  let res: Response
  try {
    res = await fetch(effectiveUrl, effectiveInit)
  } catch (err) {
    const durationMs = Date.now() - start
    // Our own per-word KBBI lookup limit aborts the request with a named reason.
    // Tag it `aborted` (not `network_error`) so the admin log shows it's a
    // self-imposed cap, and point at the config key that adjusts it.
    const selfAborted =
      effectiveInit?.signal?.reason instanceof LookupTimeoutError
    const isTimeout =
      err instanceof Error &&
      (err.name === 'TimeoutError' || err.name === 'AbortError')
    const outcome: ApiCallOutcome = selfAborted
      ? 'aborted'
      : isTimeout
        ? 'timeout'
        : 'network_error'
    const errorMessage = selfAborted
      ? 'Lookup dihentikan oleh batas waktu KBBI (kbbi.external_lookup_timeout_ms). Naikkan di Pengaturan → KBBI.'
      : getErrorMessage(err, 'fetch failed')
    writeLog({
      ctx,
      url: effectiveUrl,
      method,
      durationMs,
      status: null,
      outcome,
      errorMessage,
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

  // Host returned 429/503: park it so the next caller falls through
  // immediately instead of hammering. Honor Retry-After when present.
  if (res.status === 429 || res.status === 503) {
    pauseHost(host, parseRetryAfter(res.headers.get('retry-after')))
  }

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
