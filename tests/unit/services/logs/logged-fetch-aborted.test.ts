import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { __resetThrottleForTests } from '#/lib/http-throttle'
import { LookupTimeoutError } from '#/lib/lookup-timeout'

// Capture every row handed to db.insert(...).values(...) so we can assert the
// outcome the logger picked without a real database.
const { rows } = vi.hoisted(() => ({
  rows: [] as Array<Record<string, unknown>>,
}))

vi.mock('#/db', () => ({
  db: {
    insert: () => ({
      values: (row: Record<string, unknown>) => {
        rows.push(row)
        return { catch: () => Promise.resolve() }
      },
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

const mockFetch = vi.fn()
const originalFetch = globalThis.fetch

const abortError = (): Error =>
  Object.assign(new Error('The operation was aborted'), { name: 'AbortError' })

beforeEach(() => {
  __resetThrottleForTests()
  rows.length = 0
  mockFetch.mockReset()
  globalThis.fetch = mockFetch as typeof fetch
})

afterEach(() => {
  __resetThrottleForTests()
  globalThis.fetch = originalFetch
})

describe('loggedFetch — aborted vs timeout vs network_error', () => {
  it('tags a fetch aborted with LookupTimeoutError as outcome=aborted', async () => {
    const controller = new AbortController()
    controller.abort(new LookupTimeoutError())
    mockFetch.mockRejectedValueOnce(abortError())

    await expect(
      loggedFetch({ provider: 'kbbi' }, 'https://kbbi.web.id/uji', {
        signal: controller.signal,
      }),
    ).rejects.toBeTruthy()

    const row = rows.at(-1)
    expect(row?.outcome).toBe('aborted')
    expect(String(row?.errorMessage)).toContain('kbbi.external_lookup_timeout_ms')
  })

  it('still maps a plain AbortError (no LookupTimeoutError reason) to timeout', async () => {
    mockFetch.mockRejectedValueOnce(abortError())

    await expect(
      loggedFetch({ provider: 'kbbi' }, 'https://kbbi.web.id/uji2'),
    ).rejects.toBeTruthy()

    expect(rows.at(-1)?.outcome).toBe('timeout')
  })

  it('maps a generic fetch failure to network_error', async () => {
    mockFetch.mockRejectedValueOnce(new TypeError('fetch failed'))

    await expect(
      loggedFetch({ provider: 'kbbi' }, 'https://kbbi.web.id/uji3'),
    ).rejects.toBeTruthy()

    expect(rows.at(-1)?.outcome).toBe('network_error')
  })
})
