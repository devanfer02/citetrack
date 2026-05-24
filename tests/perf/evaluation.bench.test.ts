import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { eq, inArray, sql } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import { db } from '#/db'
import {
  dictionary,
  dictionaryCache,
  evaluationJobs,
  evaluationPages,
} from '#/db/schema'
import { cari } from '#/services/evaluation/kbbi/cari'
import { isKnownWord, warmKbbiCaches } from '#/services/evaluation/kbbi/lookup'
import {
  KBBI_SOURCE_NAMES,
  type KbbiSourceName,
} from '#/services/evaluation/kbbi/sources'
import { runEvaluationAnalysis } from '#/services/evaluation/orchestrator'
import { extractPdfText } from '#/services/pdf/extractor'

const PERF_ENABLED = process.env.PERF === '1'
const PDF_PATH = resolve(
  process.cwd(),
  '.claude/pdf_examples/thesis_example.pdf',
)
const ITERATIONS = Number(process.env.PERF_ITER ?? 20)
const P50_BUDGET_MS = Number(process.env.PERF_P50_MS ?? 15_000)
const P99_BUDGET_MS = Number(process.env.PERF_P99_MS ?? 30_000)

type ExtractedPages = Awaited<ReturnType<typeof extractPdfText>>

const insertJobAndPages = async (
  pdfByteLength: number,
  extracted: ExtractedPages,
): Promise<string> => {
  const [job] = await db
    .insert(evaluationJobs)
    .values({
      filename: 'thesis_example.pdf',
      fileSize: pdfByteLength,
      status: 'extracting',
      totalPages: extracted.totalPages,
      extractedPages: extracted.pages.length,
    })
    .returning({ id: evaluationJobs.id })

  await db.insert(evaluationPages).values(
    extracted.pages.map((p) => ({
      evalJobId: job.id,
      pageNumber: p.pageNumber,
      content: p.content,
      charCount: p.charCount,
      lowTextDensity: p.lowTextDensity ? 1 : 0,
      codeRanges: p.codeRanges,
      italicRanges: p.italicRanges,
    })),
  )

  return job.id
}

const percentile = (sortedMs: number[], p: number): number => {
  if (!sortedMs.length) return 0
  const idx = Math.min(
    sortedMs.length - 1,
    Math.max(0, Math.ceil((p / 100) * sortedMs.length) - 1),
  )
  return sortedMs[idx]
}

describe.skipIf(!PERF_ENABLED)('evaluation benchmark', () => {
  let pdfBytes = 0
  let extracted: ExtractedPages

  beforeAll(async () => {
    const buf = await readFile(PDF_PATH)
    pdfBytes = buf.byteLength
    extracted = await extractPdfText(new Uint8Array(buf))
    console.log(
      `[bench] loaded ${PDF_PATH} (${(pdfBytes / 1024 / 1024).toFixed(2)} MB, ${
        extracted.totalPages
      } pages)`,
    )
  })

  it(
    `p50 ≤ ${P50_BUDGET_MS}ms and p99 ≤ ${P99_BUDGET_MS}ms over ${ITERATIONS} runs`,
    async () => {
      const jobIds: string[] = []
      try {
        const warmId = await insertJobAndPages(pdfBytes, extracted)
        jobIds.push(warmId)
        const warmStart = performance.now()
        await runEvaluationAnalysis(warmId)
        const warmMs = performance.now() - warmStart
        console.log(`[bench] warm-up: ${warmMs.toFixed(0)} ms`)

        const samples: number[] = []
        for (let i = 0; i < ITERATIONS; i++) {
          const id = await insertJobAndPages(pdfBytes, extracted)
          jobIds.push(id)
          const start = performance.now()
          await runEvaluationAnalysis(id)
          const ms = performance.now() - start
          samples.push(ms)
          console.log(`[bench] run ${i + 1}/${ITERATIONS}: ${ms.toFixed(0)} ms`)
        }

        const sorted = [...samples].toSorted((a, b) => a - b)
        const p50 = percentile(sorted, 50)
        const p90 = percentile(sorted, 90)
        const p95 = percentile(sorted, 95)
        const p99 = percentile(sorted, 99)
        const min = sorted[0]
        const max = sorted[sorted.length - 1]
        const mean =
          samples.reduce((acc, v) => acc + v, 0) / samples.length
        console.log(
          `[bench] n=${samples.length} min=${min.toFixed(0)} mean=${mean.toFixed(
            0,
          )} p50=${p50.toFixed(0)} p90=${p90.toFixed(0)} p95=${p95.toFixed(
            0,
          )} p99=${p99.toFixed(0)} max=${max.toFixed(0)} (ms)`,
        )

        expect.soft(p50, `p50 ${p50.toFixed(0)}ms`).toBeLessThanOrEqual(
          P50_BUDGET_MS,
        )
        expect.soft(p99, `p99 ${p99.toFixed(0)}ms`).toBeLessThanOrEqual(
          P99_BUDGET_MS,
        )
      } finally {
        if (jobIds.length) {
          await db
            .delete(evaluationJobs)
            .where(inArray(evaluationJobs.id, jobIds))
            .catch(() => {})
        }
      }
    },
    10 * 60_000,
  )

  it.skipIf(!PERF_ENABLED)(
    'each KBBI source resolves a known entry through cari()',
    async () => {
      const keyword = 'buku'
      const perSource: Record<string, { ms: number; ok: boolean; lema: string | null }> = {}
      for (const source of KBBI_SOURCE_NAMES) {
        const start = performance.now()
        let result: Awaited<ReturnType<typeof cari>>
        try {
          result = await cari(keyword, { sources: [source] satisfies KbbiSourceName[] })
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          perSource[source] = { ms: performance.now() - start, ok: false, lema: null }
          console.log(`[bench:external] ${source} threw: ${message}`)
          continue
        }
        const ms = performance.now() - start
        const ok = Boolean(result.lema || result.arti?.length)
        perSource[source] = { ms, ok, lema: result.lema }
        console.log(
          `[bench:external] source=${source} keyword=${keyword} ms=${ms.toFixed(
            0,
          )} ok=${ok} lema=${result.lema ?? '-'} rateLimited=${result.rateLimited}`,
        )
        expect.soft(
          ok,
          `${source} should resolve "${keyword}" (got rateLimited=${result.rateLimited})`,
        ).toBe(true)
      }
      const reached = Object.values(perSource).filter((r) => r.ok).length
      console.log(
        `[bench:external] sources reachable: ${reached}/${KBBI_SOURCE_NAMES.length}`,
      )
      expect.soft(reached, 'at least one source should respond').toBeGreaterThan(0)
    },
    3 * 60_000,
  )

  it.skipIf(!PERF_ENABLED)(
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
        `[bench:external] candidates=${candidates.length} inLocalDict=${inLocal.size} willHitExternal=${trulyExternal.length}`,
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
          `[bench:external] word=${word} known=${result.known} databaseOnly=${result.databaseOnly} ms=${dt.toFixed(0)}`,
        )
      }
      console.log(
        `[bench:external] total=${timeMs.toFixed(0)}ms external=${externalCount}/${candidates.length} known=${foundCount}/${candidates.length}`,
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

  it.skipIf(!PERF_ENABLED)(
    'single end-to-end timing (extract + analyze) for ad-hoc inspection',
    async () => {
      const start = performance.now()
      const buf = await readFile(PDF_PATH)
      const extractedNow = await extractPdfText(new Uint8Array(buf))
      const afterExtract = performance.now()
      const [job] = await db
        .insert(evaluationJobs)
        .values({
          filename: 'thesis_example.pdf',
          fileSize: buf.byteLength,
          status: 'extracting',
          totalPages: extractedNow.totalPages,
          extractedPages: extractedNow.pages.length,
        })
        .returning({ id: evaluationJobs.id })
      await db.insert(evaluationPages).values(
        extractedNow.pages.map((p) => ({
          evalJobId: job.id,
          pageNumber: p.pageNumber,
          content: p.content,
          charCount: p.charCount,
          lowTextDensity: p.lowTextDensity ? 1 : 0,
          codeRanges: p.codeRanges,
          italicRanges: p.italicRanges,
        })),
      )
      const afterInsert = performance.now()
      await runEvaluationAnalysis(job.id)
      const end = performance.now()
      console.log(
        `[bench:e2e] extract=${(afterExtract - start).toFixed(0)}ms insert=${(
          afterInsert - afterExtract
        ).toFixed(0)}ms analyze=${(end - afterInsert).toFixed(0)}ms total=${(
          end - start
        ).toFixed(0)}ms`,
      )
      await db
        .delete(evaluationJobs)
        .where(eq(evaluationJobs.id, job.id))
        .catch(() => {})
    },
    5 * 60_000,
  )
})
