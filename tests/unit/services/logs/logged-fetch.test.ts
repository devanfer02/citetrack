import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  __resetThrottleForTests,
  pauseHost,
} from '#/lib/http-throttle'

const mockFetch = vi.fn()
const originalFetch = globalThis.fetch

vi.mock('#/db', () => ({
  db: {
    insert: () => ({
      values: () => ({
        catch: () => Promise.resolve(),
      }),
    }),
  },
}))

vi.mock('#/services/logs/polite-pool', () => ({
  applyPolitePool: (_provider: string, url: string, init?: RequestInit) => ({
    url,
    init,
  }),
}))

import { loggedFetch } from '#/services/logs/logged-fetch'

beforeEach(() => {
  __resetThrottleForTests()
  mockFetch.mockReset()
  globalThis.fetch = mockFetch as typeof fetch
})

afterEach(() => {
  __resetThrottleForTests()
  globalThis.fetch = originalFetch
})

describe('loggedFetch — host pause + throttle', () => {
  it('returns a synthetic 429 without calling fetch when host is paused', async () => {
    pauseHost('api.example.com', 60_000)
    const res = await loggedFetch(
      { provider: 'openalex' },
      'https://api.example.com/works/W1',
    )
    expect(res.status).toBe(429)
    expect(res.ok).toBe(false)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('pauses the host after a real 429 so the next call short-circuits', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(null, {
        status: 429,
        headers: { 'retry-after': '120' },
      }),
    )
    const first = await loggedFetch(
      { provider: 'crossref', metadataOnly: true },
      'https://api.crossref.org/works/10.x',
    )
    expect(first.status).toBe(429)
    expect(mockFetch).toHaveBeenCalledTimes(1)

    // Second call to same host should not reach fetch.
    const second = await loggedFetch(
      { provider: 'crossref', metadataOnly: true },
      'https://api.crossref.org/works/10.y',
    )
    expect(second.status).toBe(429)
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('pauses on 503 with no Retry-After header', async () => {
    mockFetch.mockResolvedValueOnce(new Response(null, { status: 503 }))
    await loggedFetch(
      { provider: 'unpaywall', metadataOnly: true },
      'https://api.unpaywall.org/v2/10.z',
    )

    const second = await loggedFetch(
      { provider: 'unpaywall', metadataOnly: true },
      'https://api.unpaywall.org/v2/10.q',
    )
    expect(second.status).toBe(429)
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('passes through normal 200 responses untouched', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
    const res = await loggedFetch(
      { provider: 'openalex', metadataOnly: true },
      'https://api.openalex.org/works/W2',
    )
    expect(res.status).toBe(200)
    expect(res.ok).toBe(true)
  })
})
