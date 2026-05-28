import { loggedFetch } from '#/services/logs/logged-fetch'
import {
  KBBI_SOURCE_NAMES,
  KBBI_SOURCES,
  type KbbiSourceName,
} from '#/services/evaluation/kbbi/sources'
import type { KbbiParseResult } from '#/services/evaluation/kbbi/parsers/types'
import { nextProxy } from '#/services/evaluation/kbbi/utils/proxy'
import {
  hostOf,
  isHostPaused,
  parseRetryAfter,
  pauseHost,
  throttleHost,
} from '#/services/evaluation/kbbi/utils/throttle'

export type CariResult = KbbiParseResult & {
  source: KbbiSourceName | null
  attempted: KbbiSourceName[]
  rateLimited: boolean
}

export type CariOptions = {
  sources?: KbbiSourceName[]
  signal?: AbortSignal
}

const hashIndex = (s: string, mod: number): number => {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0
  }
  return ((h % mod) + mod) % mod
}

const rotateSources = (
  keyword: string,
  order: readonly KbbiSourceName[],
): KbbiSourceName[] => {
  const start = hashIndex(keyword, order.length)
  return [...order.slice(start), ...order.slice(0, start)]
}

export async function cari(
  keyword: string,
  options: CariOptions = {},
): Promise<CariResult> {
  if (!keyword) throw new Error('Provide the keyword/kata kunci!')

  // Rotate across whichever subset is active for this job — keeps per-host
  // load spread even when the user has disabled some providers.
  const activeSources = options.sources?.length
    ? options.sources
    : KBBI_SOURCE_NAMES
  const baseOrder = rotateSources(keyword, activeSources)

  const attempted: KbbiSourceName[] = []
  let rateLimited = false

  for (const source of baseOrder) {
    if (options.signal?.aborted) throw options.signal.reason
    const handler = KBBI_SOURCES[source]
    if (!handler) continue

    const url = handler.buildUrl(keyword)
    const host = hostOf(url)
    if (isHostPaused(host)) {
      rateLimited = true
      continue
    }

    try {
      await throttleHost(host, options.signal)
      const proxy = nextProxy(source)
      const fetchInit: RequestInit & {
        proxy?: string
        dispatcher?: unknown
      } = {
        ...handler.requestInit,
        signal: options.signal,
      }
      if (proxy) {
        fetchInit.proxy = proxy.url
        fetchInit.dispatcher = proxy.dispatcher
      }
      const res = await loggedFetch({ provider: 'kbbi' }, url, fetchInit)

      if (
        source === 'kbbi.kemendikdasmen.go.id' &&
        res.url.includes('/Beranda/BatasSehari')
      ) {
        rateLimited = true
        pauseHost(host, 12 * 60 * 60_000)
        if (res.body) await res.body.cancel().catch(() => {})
        continue
      }
      if (res.status === 429 || res.status === 503) {
        rateLimited = true
        const retryAfter = parseRetryAfter(res.headers.get('retry-after'))
        pauseHost(host, retryAfter)
        if (res.body) await res.body.cancel().catch(() => {})
        continue
      }
      if (!res.ok) {
        if (res.body) await res.body.cancel().catch(() => {})
        continue
      }
      attempted.push(source)

      const html = await res.text()
      const parsed = handler.parse(html)
      if (parsed.lema || (parsed.arti && parsed.arti.length)) {
        return { ...parsed, source, attempted, rateLimited }
      }
    } catch (err) {
      if (options.signal?.aborted) throw err
      continue
    }
  }

  return { lema: null, arti: null, source: null, attempted, rateLimited }
}
