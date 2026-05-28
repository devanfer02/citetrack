import { beforeEach, describe, expect, it, vi } from 'vitest'

const loggedFetchMock = vi.fn()
vi.mock('#/services/logs/logged-fetch', () => ({
  loggedFetch: (...args: unknown[]) => loggedFetchMock(...args),
}))

const { fetchKbbiWebIdEntry, resetKbbiWebIdSession } = await import(
  '#/services/evaluation/kbbi/sources/kbbi-web-id-fetch'
)

const foundBody = JSON.stringify([
  { x: 1, w: 'abadi', d: '<b>abadi</b> <em>a</em> kekal' },
])

const preflightRes = (): Response =>
  new Response('<html>shell</html>', {
    status: 200,
    headers: { 'set-cookie': 'PHPSESSID=sess123; path=/; HttpOnly' },
  })

const ajaxRes = (body: string, status = 200): Response =>
  new Response(body, { status })

beforeEach(() => {
  loggedFetchMock.mockReset()
  resetKbbiWebIdSession()
})

describe('fetchKbbiWebIdEntry', () => {
  it('preflights for a PHPSESSID then fetches the AJAX entry', async () => {
    loggedFetchMock
      .mockResolvedValueOnce(preflightRes())
      .mockResolvedValueOnce(ajaxRes(foundBody))

    const result = await fetchKbbiWebIdEntry('abadi')

    expect(result).toEqual({ raw: foundBody, attempted: true, rateLimited: false })
    expect(loggedFetchMock).toHaveBeenCalledTimes(2)
  })

  it('reuses the session on the next word (no second preflight)', async () => {
    loggedFetchMock
      .mockResolvedValueOnce(preflightRes())
      .mockResolvedValueOnce(ajaxRes(foundBody))
    await fetchKbbiWebIdEntry('abadi')

    loggedFetchMock.mockResolvedValueOnce(ajaxRes(foundBody))
    const result = await fetchKbbiWebIdEntry('kekal')

    expect(result.attempted).toBe(true)
    expect(loggedFetchMock).toHaveBeenCalledTimes(3)
  })

  it('reports rateLimited when the preflight is throttled (429)', async () => {
    loggedFetchMock.mockResolvedValueOnce(new Response(null, { status: 429 }))

    const result = await fetchKbbiWebIdEntry('abadi')

    expect(result).toEqual({ raw: null, attempted: false, rateLimited: true })
    expect(loggedFetchMock).toHaveBeenCalledTimes(1)
  })

  it('re-preflights once on an empty body, then succeeds', async () => {
    loggedFetchMock
      .mockResolvedValueOnce(preflightRes())
      .mockResolvedValueOnce(ajaxRes('[]'))
      .mockResolvedValueOnce(preflightRes())
      .mockResolvedValueOnce(ajaxRes(foundBody))

    const result = await fetchKbbiWebIdEntry('abadi')

    expect(result).toEqual({ raw: foundBody, attempted: true, rateLimited: false })
    expect(loggedFetchMock).toHaveBeenCalledTimes(4)
  })

  it('treats a still-empty body after one retry as a conclusive not-found', async () => {
    loggedFetchMock
      .mockResolvedValueOnce(preflightRes())
      .mockResolvedValueOnce(ajaxRes('[]'))
      .mockResolvedValueOnce(preflightRes())
      .mockResolvedValueOnce(ajaxRes('[]'))

    const result = await fetchKbbiWebIdEntry('zxqwerty')

    expect(result).toEqual({ raw: '[]', attempted: true, rateLimited: false })
  })
})
