/**
 * Go/no-go diagnostic for the typoonline.com impit bypass.
 *
 * Runs ~20 words through `fetchTypoOnlineEntry` and reports the HTTP-200 rate and
 * how many produced a parseable lemma. If the 200 rate is poor or Cloudflare
 * escalates to a JS challenge, disable the typoonline source (it is 1 of 5
 * redundant sources) rather than adding a headless browser.
 *
 * Usage: bun .claude/scripts/test-typoonline.ts
 * Honours WORD_LIMIT=N to bound the run.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { parseTypoOnline } from '#/services/evaluation/kbbi/parsers/typoOnline'
import { fetchTypoOnlineEntry } from '#/services/evaluation/kbbi/sources/typoonline-fetch'

const WORDS = [
  'rumah',
  'makan',
  'belajar',
  'komputer',
  'sekolah',
  'menulis',
  'membaca',
  'jaringan',
  'telekomunikasi',
  'penelitian',
  'analisis',
  'pendidikan',
  'teknologi',
  'informasi',
  'kebudayaan',
  'lingkungan',
  'kesehatan',
  'ekonomi',
  'masyarakat',
  'pemerintah',
]

type Row = {
  word: string
  attempted: boolean
  rateLimited: boolean
  hasLema: boolean
  lema: string | null
}

const main = async (): Promise<void> => {
  const limit = Number.parseInt(process.env.WORD_LIMIT ?? '', 10)
  const words = Number.isFinite(limit) && limit > 0 ? WORDS.slice(0, limit) : WORDS

  const rows: Row[] = []
  for (const word of words) {
    const outcome = await fetchTypoOnlineEntry(word)
    const parsed = outcome.raw ? parseTypoOnline(outcome.raw) : { lema: null }
    const row: Row = {
      word,
      attempted: outcome.attempted,
      rateLimited: outcome.rateLimited,
      hasLema: Boolean(parsed.lema),
      lema: parsed.lema,
    }
    rows.push(row)
    console.log(
      `${word.padEnd(18)} attempted=${row.attempted} rateLimited=${row.rateLimited} lema=${row.lema ?? '—'}`,
    )
  }

  const attempted = rows.filter((r) => r.attempted).length
  const gated = rows.filter((r) => r.rateLimited).length
  const resolved = rows.filter((r) => r.hasLema).length
  const okRate = rows.length ? attempted / rows.length : 0

  const summary = {
    total: rows.length,
    attempted,
    gated,
    resolved,
    okRate: Number(okRate.toFixed(3)),
    verdict:
      okRate >= 0.8
        ? 'KEEP — typoonline reliable via impit'
        : 'CONSIDER DISABLING — low 200 rate / Cloudflare gating',
  }
  console.log('\nSUMMARY', JSON.stringify(summary, null, 2))

  const outDir = resolve(process.cwd(), '.claude/scripts/output')
  await mkdir(outDir, { recursive: true })
  await writeFile(
    resolve(outDir, 'typoonline-diagnostic.json'),
    JSON.stringify({ summary, rows }, null, 2),
  )
}

main().catch((err) => {
  console.error('diagnostic failed:', err)
  process.exitCode = 1
})
