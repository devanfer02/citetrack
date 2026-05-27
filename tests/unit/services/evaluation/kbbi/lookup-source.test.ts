import { beforeEach, describe, expect, it, vi } from 'vitest'

// Control the in-memory membership set and cache without touching a database.
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

const { isKnownWord, __setLocalDumpDisabledForTests } = await import(
  '#/services/evaluation/kbbi/lookup'
)

describe('isKnownWord — verification source', () => {
  beforeEach(() => {
    dictSet.clear()
    cacheMap.clear()
    cariMock.mockReset()
    __setLocalDumpDisabledForTests(false)
  })

  it('reports local-database for a word in the membership set', async () => {
    dictSet.add('konten')
    const r = await isKnownWord('konten')
    expect(r).toMatchObject({ known: true, source: 'local-database' })
    expect(cariMock).not.toHaveBeenCalled()
  })

  it('reports local-database via affix stripping (mengelola → kelola)', async () => {
    dictSet.add('kelola')
    const r = await isKnownWord('mengelola')
    expect(r).toMatchObject({ known: true, source: 'local-database' })
    expect(cariMock).not.toHaveBeenCalled()
  })

  it('reports kbbi-online when resolved by the online lookup', async () => {
    cariMock.mockResolvedValue({
      lema: 'gamifikasi',
      arti: ['def'],
      attempted: ['kbbi.web.id'],
      source: 'kbbi.web.id',
      rateLimited: false,
    })
    const r = await isKnownWord('gamifikasi')
    expect(r).toMatchObject({ known: true, source: 'kbbi-online' })
  })

  it('reports kbbi-online for a word confirmed absent online', async () => {
    cariMock.mockResolvedValue({
      lema: null,
      arti: null,
      attempted: ['kbbi.web.id', 'kbbi.kemendikdasmen.go.id'],
      source: null,
      rateLimited: false,
    })
    const r = await isKnownWord('zxqwerty')
    expect(r).toMatchObject({ known: false, source: 'kbbi-online' })
  })

  it('reports unverified when all online sources are rate-limited', async () => {
    cariMock.mockResolvedValue({
      lema: null,
      arti: null,
      attempted: [],
      source: null,
      rateLimited: true,
    })
    const r = await isKnownWord('zxqwerty')
    expect(r).toMatchObject({
      known: false,
      databaseOnly: true,
      source: 'unverified',
    })
  })
})
