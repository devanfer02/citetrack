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
  it('detects Courier/monospace ranges on thesis code pages', async () => {
    const pages = await loadPdf(THESIS_PDF)
    const codePages = pages.filter((p) => p.pageNumber >= 87 && p.pageNumber <= 109)
    const withCode = codePages.filter((p) => p.codeRanges.length > 0)
    expect(withCode.length).toBeGreaterThan(codePages.length * 0.7)
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
  it('produces zero EYD findings inside code ranges (thesis)', async () => {
    const pages = await loadPdf(THESIS_PDF)
    const findings = await analyzeEyd(pages)
    for (const f of findings) {
      const page = pages.find((p) => p.pageNumber === f.pageNumber)
      if (!page) continue
      for (const [s, e] of page.codeRanges) {
        expect(f.offset < s || f.offset >= e).toBe(true)
      }
    }
  }, 120_000)

  it('produces zero KBBI findings inside code ranges (thesis)', async () => {
    const pages = await loadPdf(THESIS_PDF)
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
