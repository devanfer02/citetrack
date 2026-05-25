import { sql } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import { db } from '#/db'
import { dictionary, dictionaryCache } from '#/db/schema'
import { cari } from '#/services/evaluation/kbbi/cari'
import { isKnownWord, warmKbbiCaches } from '#/services/evaluation/kbbi/lookup'
import {
  KBBI_SOURCE_NAMES,
  type KbbiSourceName,
} from '#/services/evaluation/kbbi/sources'

// These tests hit real external KBBI sites. They live in tests/perf/
// (PERF=1-gated) not because they measure performance but because they
// require live network access — `PERF=1` is already the "opt-in expensive
// test" gate. If you want a separate `NETWORK=1` gate later, both signals
// can OR together here.

const PERF_ENABLED = process.env.PERF === '1'

describe.skipIf(!PERF_ENABLED)('KBBI external sources', () => {
  beforeAll(async () => {
    await warmKbbiCaches()
  })

  it(
    'each KBBI source resolves a known entry through cari()',
    async () => {
      const keyword = 'buku'
      const perSource: Record<
        string,
        { ms: number; ok: boolean; lema: string | null }
      > = {}
      for (const source of KBBI_SOURCE_NAMES) {
        const start = performance.now()
        let result: Awaited<ReturnType<typeof cari>>
        try {
          result = await cari(keyword, {
            sources: [source] satisfies KbbiSourceName[],
          })
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          perSource[source] = {
            ms: performance.now() - start,
            ok: false,
            lema: null,
          }
          console.log(`[kbbi-external] ${source} threw: ${message}`)
          continue
        }
        const ms = performance.now() - start
        const ok = Boolean(result.lema || result.arti?.length)
        perSource[source] = { ms, ok, lema: result.lema }
        console.log(
          `[kbbi-external] source=${source} keyword=${keyword} ms=${ms.toFixed(0)} ok=${ok} lema=${result.lema ?? '-'} rateLimited=${result.rateLimited}`,
        )
        expect.soft(
          ok,
          `${source} should resolve "${keyword}" (got rateLimited=${result.rateLimited})`,
        ).toBe(true)
      }
      const reached = Object.values(perSource).filter((r) => r.ok).length
      console.log(
        `[kbbi-external] sources reachable: ${reached}/${KBBI_SOURCE_NAMES.length}`,
      )
      expect.soft(reached, 'at least one source should respond').toBeGreaterThan(0)
    },
    3 * 60_000,
  )

  it(
    'isKnownWord falls through to external for words not in local dump',
    async () => {
      const candidates = [
        'narahubung',
        'tetikus',
        'pranala',
        'swafoto',
        'gawai',
        'luring',
        'daring',
        'unggah',
        'unduh',
        'kuldesak',
      ] as const

      const localHits = await db
        .select({ word: sql<string>`lower(trim(${dictionary.word}))` })
        .from(dictionary)
        .where(
          sql`lower(trim(${dictionary.word})) in (${sql.join(
            candidates.map((c) => sql`${c}`),
            sql`, `,
          )})`,
        )
      const inLocal = new Set(localHits.map((r) => r.word))
      const trulyExternal = candidates.filter((c) => !inLocal.has(c))
      console.log(
        `[kbbi-external] candidates=${candidates.length} inLocalDict=${inLocal.size} willHitExternal=${trulyExternal.length}`,
      )

      if (trulyExternal.length) {
        await db
          .delete(dictionaryCache)
          .where(
            sql`word in (${sql.join(
              trulyExternal.map((w) => sql`${w}`),
              sql`, `,
            )})`,
          )
      }

      await warmKbbiCaches()

      let foundCount = 0
      let externalCount = 0
      let timeMs = 0
      for (const word of candidates) {
        const start = performance.now()
        const result = await isKnownWord(word)
        const dt = performance.now() - start
        timeMs += dt
        if (!result.databaseOnly) externalCount++
        if (result.known) foundCount++
        console.log(
          `[kbbi-external] word=${word} known=${result.known} databaseOnly=${result.databaseOnly} ms=${dt.toFixed(0)}`,
        )
      }
      console.log(
        `[kbbi-external] total=${timeMs.toFixed(0)}ms external=${externalCount}/${candidates.length} known=${foundCount}/${candidates.length}`,
      )

      if (trulyExternal.length) {
        expect.soft(
          externalCount,
          'at least one candidate should have triggered the external path',
        ).toBeGreaterThan(0)
      }
    },
    5 * 60_000,
  )
})
