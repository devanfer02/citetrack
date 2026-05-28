import { beforeEach, describe, expect, it, vi } from 'vitest'

const configValues: Record<string, number> = {
  'kbbi.disable_local_dump': 0,
  'kbbi.external_lookup_budget': 300,
  'kbbi.external_lookup_timeout_ms': 7000,
}

vi.mock('#/services/configurations-cache', () => ({
  getConfig: async (key: string) => configValues[key],
}))

vi.mock('#/services/evaluation/kbbi/sources', () => ({
  getEnabledKbbiSources: async () => ['kbbi.web.id'],
}))

vi.mock('#/services/evaluation/kbbi/dict-store', () => ({
  CACHE_TTL_MS: 15 * 60_000,
  getDictSet: () => new Set<string>(),
  getCacheMap: () => new Map(),
  getDictWords: () => [],
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

vi.mock('#/services/evaluation/kbbi/cari', () => ({
  cari: vi.fn(),
}))

const { warmKbbiCaches, __getExternalLookupTimeoutMsForTests } = await import(
  '#/services/evaluation/kbbi/lookup'
)

describe('warmKbbiCaches — external lookup timeout config', () => {
  beforeEach(() => {
    configValues['kbbi.disable_local_dump'] = 0
    configValues['kbbi.external_lookup_budget'] = 300
    configValues['kbbi.external_lookup_timeout_ms'] = 7000
  })

  it('reads kbbi.external_lookup_timeout_ms and applies it', async () => {
    configValues['kbbi.external_lookup_timeout_ms'] = 12_000
    await warmKbbiCaches()
    expect(__getExternalLookupTimeoutMsForTests()).toBe(12_000)
  })

  it('treats a value <= 0 as no timeout (Infinity)', async () => {
    configValues['kbbi.external_lookup_timeout_ms'] = 0
    await warmKbbiCaches()
    expect(__getExternalLookupTimeoutMsForTests()).toBe(Number.POSITIVE_INFINITY)
  })
})
