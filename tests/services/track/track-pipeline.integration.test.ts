import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { extractPdfText } from '#/services/pdf/extractor'
import {
  groupCitations,
  parseCitationsFromPages,
} from '#/services/parser/citation-parser'
import { parseReferences } from '#/services/parser/reference-parser'
import { matchCitations } from '#/services/matcher/citation-matcher'

const THESIS_PDF = resolve(
  process.cwd(),
  '.claude/pdf_examples/thesis_example.pdf',
)
const JOURNAL_PDF = resolve(
  process.cwd(),
  '.claude/pdf_examples/14484.pdf',
)

const AUTHOR_BLACKLIST_SAMPLE = new Set([
  'Abstrak',
  'Bab',
  'Daftar',
  'Gambar',
  'Hal',
  'Halaman',
  'Hasil',
  'Hlm',
  'Judul',
  'Kajian',
  'Kesimpulan',
  'Metode',
  'Nama',
  'No',
  'Nomor',
  'Pembahasan',
  'Penelitian',
  'Penulis',
  'Pustaka',
  'Saran',
  'Tabel',
  'Tahun',
  'Tujuan',
])

interface PipelineResult {
  citations: CitationMatch[]
  grouped: GroupedCitation[]
  references: ParsedReference[]
  matchSummary: MatchSummary
}

async function runPipeline(pdfPath: string): Promise<PipelineResult> {
  const buf = await readFile(pdfPath)
  const { pages } = await extractPdfText(new Uint8Array(buf))
  const citations = parseCitationsFromPages(pages)
  const grouped = groupCitations(citations)
  const references = parseReferences(pages)
  const refEntries = references.map((r, i) => ({
    id: i + 1,
    author: r.author,
    year: r.year,
    title: r.title,
  }))
  const uniqueKeys = [...new Set(citations.map((c) => c.citationKey))]
  const matchSummary = matchCitations(uniqueKeys, refEntries)
  return { citations, grouped, references, matchSummary }
}

function printDiagnostics(label: string, result: PipelineResult): void {
  const uniqueCount = result.grouped.length
  const matched = result.matchSummary.matches.filter(
    (m) => m.matchType !== 'unmatched',
  ).length
  const rate = uniqueCount === 0 ? 0 : matched / uniqueCount
  const lines: string[] = []
  lines.push(`\n━━━ ${label} ━━━`)
  lines.push(`citations.total        = ${result.citations.length}`)
  lines.push(`citations.unique       = ${uniqueCount}`)
  lines.push(`references             = ${result.references.length}`)
  lines.push(`matched.unique         = ${matched}`)
  lines.push(`match.rate             = ${(rate * 100).toFixed(1)}%`)
  lines.push(`orphans                = ${result.matchSummary.orphanCitations.length}`)
  lines.push(`unused.refs            = ${result.matchSummary.unusedReferences.length}`)

  if (result.matchSummary.orphanCitations.length > 0) {
    lines.push(`\nOrphan citations (cited but no matching reference):`)
    const show = result.matchSummary.orphanCitations.slice(0, 50)
    for (const key of show) lines.push(`  - ${key}`)
    const rest = result.matchSummary.orphanCitations.length - show.length
    if (rest > 0) lines.push(`  … and ${rest} more`)
  }

  if (result.matchSummary.unusedReferences.length > 0) {
    lines.push(`\nUnused references (in bibliography but never cited):`)
    const show = result.matchSummary.unusedReferences.slice(0, 50)
    for (const ref of show) {
      const title = ref.title.length > 80 ? `${ref.title.slice(0, 77)}…` : ref.title
      lines.push(`  - ${ref.author} (${ref.year}): ${title}`)
    }
    const rest = result.matchSummary.unusedReferences.length - show.length
    if (rest > 0) lines.push(`  … and ${rest} more`)
  }

  const badRefs = result.references.filter(
    (r) =>
      r.author === 'Unknown' ||
      r.author.length <= 1 ||
      !/^(19|20)\d{2}$/.test(r.year) ||
      r.title.length < 10 ||
      r.title.length > 300,
  )
  if (badRefs.length > 0) {
    lines.push(`\nMalformed references (shape failure):`)
    const show = badRefs.slice(0, 20)
    for (const ref of show) {
      lines.push(
        `  - author=${JSON.stringify(ref.author)} year=${ref.year} title.len=${ref.title.length}`,
      )
      lines.push(`    raw: ${ref.rawText.slice(0, 160).replace(/\s+/g, ' ')}`)
    }
    const rest = badRefs.length - show.length
    if (rest > 0) lines.push(`  … and ${rest} more`)
  }

  // biome-ignore lint/suspicious/noConsole: diagnostic output for iteration
  console.log(lines.join('\n'))
}

function runSuite(label: string, pdfPath: string): void {
  describe(`track pipeline — ${label}`, () => {
    let result: PipelineResult

    beforeAll(async () => {
      result = await runPipeline(pdfPath)
      printDiagnostics(label, result)
    }, 120_000)

    it('extracts at least one in-text citation', () => {
      expect(result.citations.length).toBeGreaterThan(0)
    })

    it('extracts at least one reference', () => {
      expect(result.references.length).toBeGreaterThan(0)
    })

    it('every reference has a valid shape (author, year, title)', () => {
      const failures: string[] = []
      for (const ref of result.references) {
        const raw = ref.rawText.slice(0, 100).replace(/\s+/g, ' ')
        if (ref.author === 'Unknown' || ref.author.length <= 1) {
          failures.push(`bad author=${JSON.stringify(ref.author)} :: ${raw}`)
        }
        if (!/^(19|20)\d{2}$/.test(ref.year)) {
          failures.push(`bad year=${ref.year} :: ${raw}`)
        }
        if (ref.title.length < 10 || ref.title.length > 300) {
          failures.push(`bad title.len=${ref.title.length} :: ${raw}`)
        }
      }
      expect(failures, failures.slice(0, 10).join('\n')).toHaveLength(0)
    })

    it('no citation author is a blacklisted generic word', () => {
      const bad: string[] = []
      for (const c of result.citations) {
        const firstToken = c.citationKey.split(/[\s,]/)[0]
        if (AUTHOR_BLACKLIST_SAMPLE.has(firstToken)) {
          bad.push(c.citationKey)
        }
      }
      expect(bad, bad.slice(0, 10).join('; ')).toHaveLength(0)
    })

    it('references are unique (no duplicates)', () => {
      // Use the raw entry text so legitimate APA year-suffix twins (e.g.
      // "Singh … (2025a)" and "Singh … (2025b)") stay distinct. A true parser
      // duplicate would have identical rawText.
      const seen = new Map<string, number>()
      const dupes: string[] = []
      for (const ref of result.references) {
        const key = ref.rawText.slice(0, 200).toLowerCase().replace(/\s+/g, ' ').trim()
        const prior = seen.get(key) ?? 0
        if (prior > 0) dupes.push(key.slice(0, 100))
        seen.set(key, prior + 1)
      }
      expect(dupes, dupes.slice(0, 5).join('\n')).toHaveLength(0)
    })

    it('every found citation matches a reference (100%)', () => {
      const orphans = result.matchSummary.orphanCitations
      const preview = orphans.slice(0, 15).join('; ')
      const more = orphans.length > 15 ? ` …+${orphans.length - 15}` : ''
      expect(orphans.length, `${preview}${more}`).toBe(0)
    })

    it('every matched reference title is non-empty and reasonable', () => {
      const matched = result.matchSummary.matches.filter(
        (m) => m.matchType !== 'unmatched',
      )
      const bad: string[] = []
      for (const m of matched) {
        if (!m.referenceTitle || m.referenceTitle.length < 10) {
          bad.push(`${m.citationKey} -> ${JSON.stringify(m.referenceTitle)}`)
        }
      }
      expect(bad, bad.slice(0, 10).join('\n')).toHaveLength(0)
    })
  })
}

runSuite('thesis_example.pdf', THESIS_PDF)
runSuite('14484.pdf', JOURNAL_PDF)
