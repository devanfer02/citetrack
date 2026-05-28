import { beforeEach, describe, expect, it, vi } from 'vitest'

// In-memory fixtures mirror the lookup-source test so we can exercise the
// external-budget gate without a real database or HTTP fetch.
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
  __getExternalLookupsRemainingForTests,
} = await import('#/services/evaluation/kbbi/lookup')

const conclusiveMissResult = {
  lema: '',
  arti: [],
  attempted: ['kbbi-web-id'],
  source: 'kbbi-web-id',
  rateLimited: false,
}

describe('isKnownWord — external-lookup budget', () => {
  beforeEach(() => {
    dictSet.clear()
    cacheMap.clear()
    cariMock.mockReset()
    __setLocalDumpDisabledForTests(false)
  })

  it('consults cari() while budget remains and decrements per unique unknown', async () => {
    __setExternalLookupBudgetForTests(3)
    cariMock.mockResolvedValue(conclusiveMissResult)

    await isKnownWord('alphaword')
    await isKnownWord('betaword')

    expect(cariMock).toHaveBeenCalledTimes(2)
    expect(__getExternalLookupsRemainingForTests()).toBe(1)
  })

  it('short-circuits to source=unverified once the budget is exhausted', async () => {
    __setExternalLookupBudgetForTests(2)
    cariMock.mockResolvedValue(conclusiveMissResult)

    await isKnownWord('alphaword')
    await isKnownWord('betaword')
    const exhausted = await isKnownWord('gammaword')

    expect(cariMock).toHaveBeenCalledTimes(2)
    expect(exhausted).toMatchObject({
      known: false,
      databaseOnly: true,
      isEnglish: false,
      source: 'unverified',
    })
  })

  it('treats budget=0 as unlimited (cari() always called)', async () => {
    __setExternalLookupBudgetForTests(0)
    cariMock.mockResolvedValue(conclusiveMissResult)

    for (let i = 0; i < 50; i++) {
      await isKnownWord(`word${i}`)
    }

    expect(cariMock).toHaveBeenCalledTimes(50)
    expect(__getExternalLookupsRemainingForTests()).toBe(
      Number.POSITIVE_INFINITY,
    )
  })

  it('does not decrement the budget when the verdict comes from the local dump', async () => {
    __setExternalLookupBudgetForTests(5)
    dictSet.add('rumah')
    dictSet.add('makan')

    await isKnownWord('rumah')
    await isKnownWord('makan')

    expect(cariMock).not.toHaveBeenCalled()
    expect(__getExternalLookupsRemainingForTests()).toBe(5)
  })
})
