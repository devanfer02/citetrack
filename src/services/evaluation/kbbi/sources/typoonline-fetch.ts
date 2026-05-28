import { LookupTimeoutError } from '#/lib/lookup-timeout'
import { getErrorMessage } from '#/lib/utils'
import type { KbbiFetchOutcome } from '#/services/evaluation/kbbi/sources'
import { logExternalCall } from '#/services/logs/logged-fetch'

// typoonline.com serves an empty shell and loads the entry via a POST to
// /api-kbbi/{word} (XHR), behind Cloudflare which 403s plain `fetch` (Node's
// TLS/JA3 fingerprint). The POST is CSRF-protected (CodeIgniter): the form must
// echo a token whose value is the `k55b1n5f8` cookie the server sets. The
// page's inline JS does `{ checktext:1, ntxt:word, a3g4d21h4k: readCookie('k55b1n5f8') }`.
// So we: prime GET (impit + Chrome TLS impersonation past Cloudflare; jar
// captures the cookie), scrape the `field: readCookie('cookie')` names from the
// page, then POST the form with the token. Scraping the names (rather than
// hardcoding) survives a config rotation on the site.
const BASE = 'https://typoonline.com'
const PREVIEW_BYTES = 2 * 1024
const CSRF_RE = /(\w+)\s*:\s*readCookie\(\s*['"]([^'"]+)['"]\s*\)/

// Minimal in-memory cookie jar matching impit's tough-cookie-shaped interface.
// Same-host keying is enough for the CSRF + Cloudflare cookies to persist across
// the prime GET and the api-kbbi POST. impit drives this synchronously via the
// return values (verified end-to-end), but tough-cookie-style consumers may call
// with a node callback — so we invoke it when present to avoid a stalled caller.
type SetCookieCallback = (error?: Error | null) => void
type GetCookieStringCallback = (error: Error | null, cookies: string) => void

class SimpleCookieJar {
  private store = new Map<string, Map<string, string>>()

  setCookie(cookie: string, url: string, callback?: SetCookieCallback): void {
    try {
      let host: string
      try {
        host = new URL(url).hostname
      } catch {
        return
      }
      const pair = cookie.split(';', 1)[0] ?? ''
      const eq = pair.indexOf('=')
      if (eq <= 0) return
      const name = pair.slice(0, eq).trim()
      const value = pair.slice(eq + 1).trim()
      const jar = this.store.get(host) ?? new Map<string, string>()
      jar.set(name, value)
      this.store.set(host, jar)
    } finally {
      callback?.(null)
    }
  }

  getCookieString(url: string, callback?: GetCookieStringCallback): string {
    let result = ''
    try {
      let host: string
      try {
        host = new URL(url).hostname
      } catch {
        return ''
      }
      const jar = this.store.get(host)
      if (jar) {
        result = [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ')
      }
    } finally {
      callback?.(null, result)
    }
    return result
  }

  get(url: string, name: string): string | null {
    let host: string
    try {
      host = new URL(url).hostname
    } catch {
      return null
    }
    return this.store.get(host)?.get(name) ?? null
  }

  clear(): void {
    this.store.clear()
  }
}

type ImpitResponseLike = {
  status: number
  ok: boolean
  headers: Headers
  text: () => Promise<string>
}
type ImpitLike = {
  fetch: (resource: string, init?: RequestInit) => Promise<ImpitResponseLike>
}

const jar = new SimpleCookieJar()
let impitPromise: Promise<ImpitLike | null> | null = null
// CSRF form-field + cookie names, scraped once from the prime page's inline JS.
let csrfField: string | null = null
let csrfCookie: string | null = null

const getImpit = async (): Promise<ImpitLike | null> => {
  impitPromise ??= (async () => {
    try {
      const mod = await import('impit')
      return new mod.Impit({ browser: 'chrome', cookieJar: jar })
    } catch (err) {
      console.warn(
        '[typoonline] impit unavailable; disabling typoonline source:',
        err,
      )
      return null
    }
  })()
  return impitPromise
}

// Reset by warmKbbiCaches() so a stale CSRF token / Cloudflare clearance is
// never reused across jobs.
export const resetTypoOnlineSession = (): void => {
  jar.clear()
  csrfField = null
  csrfCookie = null
}

const runImpit = async (
  impit: ImpitLike,
  method: 'GET' | 'POST',
  url: string,
  headers: Record<string, string>,
  signal?: AbortSignal,
  body?: string,
): Promise<{ status: number; ok: boolean; body: string }> => {
  const start = Date.now()
  try {
    const res = await impit.fetch(url, { method, headers, signal, body })
    const text = await res.text()
    const contentType = res.headers.get('content-type')
    logExternalCall({
      ctx: { provider: 'kbbi' },
      url,
      method,
      durationMs: Date.now() - start,
      status: res.status,
      outcome: res.ok ? 'success' : 'http_error',
      responseHeaders: contentType ? { 'content-type': contentType } : null,
      bodyPreview: text.slice(0, PREVIEW_BYTES),
      bodyTruncated: text.length > PREVIEW_BYTES,
      bodySizeBytes: text.length,
    })
    return { status: res.status, ok: res.ok, body: text }
  } catch (err) {
    const selfAborted = signal?.reason instanceof LookupTimeoutError
    logExternalCall({
      ctx: { provider: 'kbbi' },
      url,
      method,
      durationMs: Date.now() - start,
      status: null,
      outcome: selfAborted ? 'aborted' : 'network_error',
      errorMessage: selfAborted
        ? 'Lookup dihentikan oleh batas waktu KBBI (kbbi.external_lookup_timeout_ms). Naikkan di Pengaturan → KBBI.'
        : getErrorMessage(err, 'impit fetch failed'),
    })
    throw err
  }
}

// Prime the session: GET the homepage so the server sets the CSRF cookie into
// the jar (the /kbbi/{word} page does NOT set it), and scrape the
// `field: readCookie('cookie')` names from its inline JS. Returns false when the
// page is gated/unavailable or no token was obtained.
const prime = async (
  signal: AbortSignal | undefined,
  impit: ImpitLike,
): Promise<boolean> => {
  const res = await runImpit(impit, 'GET', `${BASE}/`, {}, signal)
  if (!res.ok) return false
  const match = res.body.match(CSRF_RE)
  if (match) {
    csrfField = match[1]
    csrfCookie = match[2]
  }
  return Boolean(csrfField && csrfCookie && jar.get(`${BASE}/`, csrfCookie))
}

export const fetchTypoOnlineEntry = async (
  keyword: string,
  signal?: AbortSignal,
): Promise<KbbiFetchOutcome> => {
  const impit = await getImpit()
  if (!impit) return { raw: null, attempted: false, rateLimited: true }

  const word = encodeURIComponent(keyword)
  try {
    // At most two passes: reuse a cached CSRF token from a previous word, and on
    // a 403 (stale/expired token) clear the jar and re-prime once.
    for (let attempt = 0; attempt < 2; attempt++) {
      const haveToken = Boolean(
        csrfField && csrfCookie && jar.get(`${BASE}/`, csrfCookie),
      )
      if (!haveToken && !(await prime(signal, impit))) {
        return { raw: null, attempted: false, rateLimited: true }
      }

      const token = csrfCookie ? jar.get(`${BASE}/`, csrfCookie) : null
      if (!csrfField || !token) {
        return { raw: null, attempted: false, rateLimited: true }
      }

      const formBody = new URLSearchParams({
        checktext: '1',
        ntxt: keyword,
        [csrfField]: token,
      }).toString()

      // 200 carries the entry fragment OR a "Kata X tidak ditemukan" body — both
      // are conclusive. 403 is usually a stale CSRF token (retry once); any other
      // non-2xx (Cloudflare 429/503, etc.) is inconclusive → rateLimited.
      const res = await runImpit(
        impit,
        'POST',
        `${BASE}/api-kbbi/${word}`,
        {
          'x-requested-with': 'XMLHttpRequest',
          referer: `${BASE}/kbbi/${word}`,
          'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
        },
        signal,
        formBody,
      )
      if (res.status === 200) {
        return { raw: res.body, attempted: true, rateLimited: false }
      }
      if (res.status === 403 && attempt === 0) {
        jar.clear()
        csrfField = null
        csrfCookie = null
        continue
      }
      return { raw: null, attempted: false, rateLimited: true }
    }
    return { raw: null, attempted: false, rateLimited: true }
  } catch {
    return { raw: null, attempted: false, rateLimited: true }
  }
}
