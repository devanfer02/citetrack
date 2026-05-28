import { headersFor } from '#/services/evaluation/kbbi/utils/browser-headers'
import type { KbbiFetchOutcome } from '#/services/evaluation/kbbi/sources'
import { loggedFetch } from '#/services/logs/logged-fetch'

// kbbi.web.id serves an empty loading shell server-side and fetches the real
// entry over AJAX, which needs a PHPSESSID cookie from a preflight GET. We keep
// one session per job and only re-preflight when it expires (empty AJAX body).
const BASE = 'https://kbbi.web.id'
const AJAX_SUFFIX = 'ajax_submitxvs7k'

let webIdSession: string | null = null

// Reset by warmKbbiCaches() at the start of every evaluation job so a stale
// session from a previous run is never reused.
export const resetKbbiWebIdSession = (): void => {
  webIdSession = null
}

const extractPhpSessId = (res: Response): string | null => {
  const cookies = res.headers.getSetCookie?.() ?? []
  for (const cookie of cookies) {
    const match = cookie.match(/PHPSESSID=([^;]+)/)
    if (match) return match[1]
  }
  const single = res.headers.get('set-cookie')
  const match = single?.match(/PHPSESSID=([^;]+)/)
  return match ? match[1] : null
}

const entryUrl = (word: string): string => `${BASE}/${encodeURIComponent(word)}`
const ajaxUrl = (word: string): string => `${entryUrl(word)}/${AJAX_SUFFIX}`

type PreflightResult = 'ok' | 'rate-limited' | 'no-session'

const preflight = async (
  word: string,
  signal?: AbortSignal,
): Promise<PreflightResult> => {
  const res = await loggedFetch(
    { provider: 'kbbi', metadataOnly: true },
    entryUrl(word),
    { headers: headersFor(`${BASE}/`), signal },
  )
  if (res.body) await res.body.cancel().catch(() => {})
  if (res.status === 429 || res.status === 503) return 'rate-limited'
  const sid = extractPhpSessId(res)
  if (!sid) return 'no-session'
  webIdSession = sid
  return 'ok'
}

const fetchAjax = async (
  word: string,
  signal?: AbortSignal,
): Promise<{ status: number; body: string }> => {
  const res = await loggedFetch({ provider: 'kbbi' }, ajaxUrl(word), {
    headers: {
      ...headersFor(entryUrl(word)),
      cookie: `PHPSESSID=${webIdSession}`,
      'x-requested-with': 'XMLHttpRequest',
      accept: 'application/json, text/javascript, */*; q=0.01',
    },
    signal,
  })
  if (res.status === 429 || res.status === 503) {
    if (res.body) await res.body.cancel().catch(() => {})
    return { status: res.status, body: '' }
  }
  const body = await res.text()
  return { status: res.status, body }
}

const isEmptyBody = (body: string): boolean => {
  const trimmed = body.trim()
  if (!trimmed) return true
  try {
    const parsed = JSON.parse(trimmed)
    return Array.isArray(parsed) ? parsed.length === 0 : !parsed
  } catch {
    return true
  }
}

export const fetchKbbiWebIdEntry = async (
  keyword: string,
  signal?: AbortSignal,
): Promise<KbbiFetchOutcome> => {
  try {
    // At most two passes: the first may reuse a cached session; on an empty
    // body (expired session or genuine not-found) we drop it and retry once
    // with a fresh preflight before accepting the empty body as conclusive.
    for (let attempt = 0; attempt < 2; attempt++) {
      if (!webIdSession) {
        const pf = await preflight(keyword, signal)
        if (pf !== 'ok') {
          return { raw: null, attempted: false, rateLimited: true }
        }
      }

      const { status, body } = await fetchAjax(keyword, signal)
      if (status === 429 || status === 503) {
        return { raw: null, attempted: false, rateLimited: true }
      }
      if (!status || status >= 400) {
        webIdSession = null
        continue
      }
      if (isEmptyBody(body)) {
        if (attempt === 0) {
          webIdSession = null
          continue
        }
        return { raw: body, attempted: true, rateLimited: false }
      }
      return { raw: body, attempted: true, rateLimited: false }
    }
    return { raw: null, attempted: false, rateLimited: true }
  } catch {
    return { raw: null, attempted: false, rateLimited: true }
  }
}
