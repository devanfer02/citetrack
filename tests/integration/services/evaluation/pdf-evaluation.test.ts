import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { extractPdfText } from '#/services/pdf/extractor'
import { analyzeEyd } from '#/services/evaluation/eyd/analyzer'
import { analyzeKbbi } from '#/services/evaluation/kbbi/analyzer'
import { refreshVocabularyCache } from '#/services/evaluation/vocabulary-cache'

const THESIS_PDF = resolve(
  process.cwd(),
  '.claude/pdf_examples/thesis_example.pdf',
)
const JOURNAL_PDF = resolve(
  process.cwd(),
  '.claude/pdf_examples/14484.pdf',
)
// thesis_example.pdf is set in Calibri throughout — no Courier text at all,
// so it can't exercise code-range detection. Template-Skripsi-v3.0.pdf has
// pseudocode blocks in Courier on a couple of pages (≈p20 and p26).
const TEMPLATE_PDF = resolve(
  process.cwd(),
  '.claude/pdf_examples/Template-Skripsi-v3.0.pdf',
)

beforeAll(async () => {
  await refreshVocabularyCache()
})

const loadPdf = async (path: string): Promise<AnalyzedPage[]> => {
  const buf = await readFile(path)
  const { pages } = await extractPdfText(new Uint8Array(buf))
  return pages.map((p) => ({
    pageNumber: p.pageNumber,
    content: p.content,
    codeRanges: p.codeRanges,
    italicRanges: p.italicRanges,
  }))
}

describe('extractor — font-aware ranges', () => {
  it('detects Courier/monospace ranges in a template with pseudocode blocks', async () => {
    const pages = await loadPdf(TEMPLATE_PDF)
    const withCode = pages.filter((p) => p.codeRanges.length > 0)
    expect(
      withCode.length,
      `expected at least one page with code ranges; pages: ${pages
        .map((p) => `${p.pageNumber}=${p.codeRanges.length}`)
        .filter((s) => !s.endsWith('=0'))
        .join(', ') || '(none)'}`,
    ).toBeGreaterThan(0)
    // The pseudocode block on the algorithm page contains a function
    // signature in monospace — assert at least one range covers it.
    const algoPage = withCode.find((p) =>
      /Algoritme|namaFungsi|tipedatakembalian/.test(p.content),
    )
    expect(algoPage, 'expected the pseudocode page to be detected').toBeDefined()
  }, 60_000)

  it('detects italic ranges on journal body pages', async () => {
    const pages = await loadPdf(JOURNAL_PDF)
    const bodyPage = pages.find((p) => p.pageNumber === 2)
    expect(bodyPage).toBeDefined()
    expect(bodyPage?.italicRanges.length ?? 0).toBeGreaterThan(5)
  }, 60_000)

  it('emits no ranges past content length', async () => {
    const pages = await loadPdf(THESIS_PDF)
    for (const p of pages) {
      for (const [s, e] of p.codeRanges) {
        expect(s).toBeGreaterThanOrEqual(0)
        expect(e).toBeLessThanOrEqual(p.content.length)
        expect(e).toBeGreaterThan(s)
      }
      for (const [s, e] of p.italicRanges) {
        expect(s).toBeGreaterThanOrEqual(0)
        expect(e).toBeLessThanOrEqual(p.content.length)
        expect(e).toBeGreaterThan(s)
      }
    }
  }, 60_000)
})

describe('analyzers — respect structural ranges', () => {
  it('produces zero EYD findings inside code ranges (template w/ pseudocode)', async () => {
    // Use TEMPLATE_PDF because thesis_example.pdf has no Courier text and
    // would make this assertion vacuously true.
    const pages = await loadPdf(TEMPLATE_PDF)
    const totalCodeRanges = pages.reduce((acc, p) => acc + p.codeRanges.length, 0)
    expect(
      totalCodeRanges,
      'fixture must have code ranges for this assertion to be meaningful',
    ).toBeGreaterThan(0)
    const findings = await analyzeEyd(pages)
    for (const f of findings) {
      const page = pages.find((p) => p.pageNumber === f.pageNumber)
      if (!page) continue
      for (const [s, e] of page.codeRanges) {
        expect(f.offset < s || f.offset >= e).toBe(true)
      }
    }
  }, 120_000)

  it('produces zero KBBI findings inside code ranges (template w/ pseudocode)', async () => {
    const pages = await loadPdf(TEMPLATE_PDF)
    const totalCodeRanges = pages.reduce((acc, p) => acc + p.codeRanges.length, 0)
    expect(
      totalCodeRanges,
      'fixture must have code ranges for this assertion to be meaningful',
    ).toBeGreaterThan(0)
    const findings = await analyzeKbbi(pages)
    for (const f of findings) {
      const page = pages.find((p) => p.pageNumber === f.pageNumber)
      if (!page) continue
      for (const [s, e] of page.codeRanges) {
        expect(f.offset < s || f.offset >= e).toBe(true)
      }
    }
  }, 600_000)

  it('produces zero foreign-not-italic findings inside italic ranges', async () => {
    for (const path of [THESIS_PDF, JOURNAL_PDF]) {
      const pages = await loadPdf(path)
      const findings = await analyzeEyd(pages)
      const italic = findings.filter((f) => f.ruleId === 'eyd.foreign-not-italic')
      for (const f of italic) {
        const page = pages.find((p) => p.pageNumber === f.pageNumber)
        if (!page) continue
        for (const [s, e] of page.italicRanges) {
          expect(f.offset < s || f.offset >= e).toBe(true)
        }
      }
    }
  }, 120_000)
})

describe('structural FP suppression', () => {
  it('suppresses TOC leader-dot matches in space-before-punct', async () => {
    const pages = await loadPdf(THESIS_PDF)
    const findings = await analyzeEyd(pages)
    const tocFindings = findings.filter(
      (f) =>
        f.ruleId === 'eyd.space-before-punct' &&
        f.pageNumber >= 2 &&
        f.pageNumber <= 5,
    )
    expect(tocFindings.length).toBeLessThan(5)
  }, 120_000)

  it('skips URL tokens in KBBI check', async () => {
    const pages = await loadPdf(THESIS_PDF)
    const findings = await analyzeKbbi(pages)
    const urlFragments = findings.filter((f) =>
      /^(https?|www|doi|kemendikdasmen|kubernetes|j-ptiik)$/i.test(f.token),
    )
    expect(urlFragments.length).toBe(0)
  }, 600_000)

  it('skips hyphenated reduplications like ciri-ciri, masing-masing', async () => {
    const pages = await loadPdf(THESIS_PDF)
    const findings = await analyzeKbbi(pages)
    const redups = findings.filter((f) =>
      /^(ciri|hasil|masing|jenis|elemen|penelitian|lain|fakta)$/i.test(f.token),
    )
    expect(redups.length).toBe(0)
  }, 600_000)

  it('skips PDF-split fragments when joined form is known', async () => {
    const pages = await loadPdf(THESIS_PDF)
    const findings = await analyzeKbbi(pages)
    const tokens = new Set(findings.map((f) => f.token.toLowerCase()))
    const splits = ['ika', 'otlin', 'eserta', 'pabila', 'ggunakan']
    const flagged = splits.filter((w) => tokens.has(w))
    expect(flagged).toEqual([])
  }, 600_000)
})

describe('analyzers — recall on real errors', () => {
  it('flags real Indonesian typos', async () => {
    const pages = await loadPdf(THESIS_PDF)
    const findings = await analyzeKbbi(pages)
    const tokens = findings.map((f) => f.token.toLowerCase())
    const realTypos = [
      'pembalajaran',
      'didominiasi',
      'mencatatat',
      'menampilakn',
      'saaat',
      'atua',
      'dengna',
    ]
    for (const typo of realTypos) {
      expect(tokens, `expected typo "${typo}" to be flagged`).toContain(typo)
    }
  }, 600_000)

  it('flags at least one terdsitribusi typo in the journal', async () => {
    const pages = await loadPdf(JOURNAL_PDF)
    const findings = await analyzeKbbi(pages)
    const tokens = findings.map((f) => f.token.toLowerCase())
    expect(tokens).toContain('terdsitribusi')
  }, 300_000)
})
