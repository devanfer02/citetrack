import { beforeEach, describe, expect, it, vi } from 'vitest'

// In-memory fixtures mirror the budget test so we can exercise the
// `kbbi.local_only` gate without a real database or HTTP fetch.
const dictSet = new Set<string>()
const cacheMap = new Map<string, { found: boolean; fetchedAt: number }>()

vi.mock('#/services/evaluation/kbbi/dict-store', () => ({
  CACHE_TTL_MS: 15 * 60_000,
  getDictSet: () => dictSet,
  getCacheMap: () => cacheMap,
  getDictWords: () => [...dictSet],
  setCacheEntry: () => {},
  queueCacheWrite: () => {},
  warmDictStore: async () => {},
}))

vi.mock('#/services/evaluation/vocabulary-cache', () => ({
  getCachedClassification: () => undefined,
}))

vi.mock('#/services/evaluation/kbbi/english', () => ({
  isEnglishWord: async () => false,
}))

const cariMock = vi.fn()
vi.mock('#/services/evaluation/kbbi/cari', () => ({
  cari: (...args: unknown[]) => cariMock(...args),
}))

const {
  isKnownWord,
  __setLocalDumpDisabledForTests,
  __setExternalLookupBudgetForTests,
  __setExternalLookupDisabledForTests,
} = await import('#/services/evaluation/kbbi/lookup')

describe('isKnownWord — local-only mode (kbbi.local_only)', () => {
  beforeEach(() => {
    dictSet.clear()
    cacheMap.clear()
    cariMock.mockReset()
    __setLocalDumpDisabledForTests(false)
    __setExternalLookupBudgetForTests(300)
  })

  it('never calls cari() for an unknown word and marks it unverified', async () => {
    __setExternalLookupDisabledForTests(true)

    const result = await isKnownWord('katayanganeh')

    expect(cariMock).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      known: false,
      databaseOnly: true,
      isEnglish: false,
      source: 'unverified',
      tier: 'unverified',
    })
  })

  it('still resolves words present in the local dump without going online', async () => {
    __setExternalLookupDisabledForTests(true)
    dictSet.add('rumah')

    const result = await isKnownWord('rumah')

    expect(cariMock).not.toHaveBeenCalled()
    expect(result).toMatchObject({ known: true, source: 'local-database' })
  })

  it('reaches cari() again once local-only is turned back off', async () => {
    __setExternalLookupDisabledForTests(false)
    cariMock.mockResolvedValue({
      lema: '',
      arti: [],
      attempted: ['kbbi-web-id'],
      source: 'kbbi-web-id',
      rateLimited: false,
    })

    await isKnownWord('katayanganeh')

    expect(cariMock).toHaveBeenCalledTimes(1)
  })
})
