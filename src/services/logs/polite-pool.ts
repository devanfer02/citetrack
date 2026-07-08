import { env } from '#/env'
import type { ApiProvider } from '#/services/logs/providers'

// "Polite pool" courtesy: OpenAlex and CrossRef hand out much higher
// per-IP rate limits when requests identify a contact email. OpenAlex
// reads it from a `mailto=` query param; CrossRef reads it from the
// User-Agent header. No-op when POLITE_POOL_EMAIL is unset, so local
// dev installs without a configured email stay on the anonymous pool.

const POLITE_PROVIDERS: ReadonlySet<ApiProvider> = new Set([
  'openalex',
  'crossref',
  'unpaywall',
])

export function applyPolitePool(
  provider: ApiProvider,
  url: string,
  init?: RequestInit,
): { url: string; init: RequestInit | undefined } {
  const email = env.POLITE_POOL_EMAIL
  if (!email) return { url, init }
  if (!POLITE_PROVIDERS.has(provider)) return { url, init }

  let nextUrl = url
  let nextInit = init

  if (provider === 'openalex' || provider === 'unpaywall') {
    const u = new URL(url)
    if (!u.searchParams.has('mailto')) {
      u.searchParams.set('mailto', email)
      nextUrl = u.toString()
    }
  }

  if (provider === 'crossref') {
    const existing = init?.headers
    const headers = new Headers(existing as HeadersInit | undefined)
    if (!headers.has('User-Agent')) {
      headers.set('User-Agent', `CiteTrack (mailto:${email})`)
    }
    nextInit = { ...init, headers }
  }

  return { url: nextUrl, init: nextInit }
}
