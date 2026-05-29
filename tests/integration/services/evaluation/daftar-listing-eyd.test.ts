import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  analyzeEyd,
  isDaftarListingPage,
} from '#/services/evaluation/eyd/analyzer'
import { runEydRules } from '#/services/evaluation/eyd/rules'
import { extractPdfText } from '#/services/pdf/extractor'

// thesis_example_1.pdf carries multi-page front matter — a DAFTAR ISI that
// runs across several pages, then DAFTAR TABEL and DAFTAR GAMBAR. The dot
// leaders that connect each entry to its page number are correct typography,
// but pdf extraction chops the long leader runs into 4-5 dot chunks that would
// otherwise trip eyd.repeated-period / eyd.space-before-punct. analyzeEyd must
// treat these listing pages (including the spillover continuation page) as
// exempt, the same way it already skips DAFTAR PUSTAKA.
const THESIS_PDF = resolve(
  process.cwd(),
  '.claude/pdf_examples/thesis_example_1.pdf',
)
const hasFixture = existsSync(THESIS_PDF)

const loadPages = async (): Promise<AnalyzedPage[]> => {
  const { pages } = await extractPdfText(new Uint8Array(readFileSync(THESIS_PDF)))
  return pages.map((p) => ({
    pageNumber: p.pageNumber,
    content: p.content,
    codeRanges: p.codeRanges,
    italicRanges: p.italicRanges,
  }))
}

describe.skipIf(!hasFixture)(
  'analyzeEyd — DAFTAR listing pages are exempt (thesis_example_1)',
  () => {
    it('emits zero EYD findings across the multi-page front-matter listings', async () => {
      const pages = await loadPages()

      // Front matter = from the first DAFTAR ISI page up to (but excluding) the
      // first prose page (PENDAHULUAN / Latar Belakang). Derived, not hardcoded,
      // so the test survives small fixture changes.
      const tocStart = pages.find((p) => /DAFTAR\s+ISI/i.test(p.content))
      expect(tocStart, 'expected a DAFTAR ISI page').toBeDefined()
      const proseStart = pages.find(
        (p) =>
          p.pageNumber > (tocStart?.pageNumber ?? 0) &&
          /\bPENDAHULUAN\b/.test(p.content) &&
          /Latar\s+B/i.test(p.content),
      )
      expect(proseStart, 'expected a PENDAHULUAN prose page').toBeDefined()

      const frontMatter = pages.filter(
        (p) =>
          p.pageNumber >= (tocStart?.pageNumber ?? 0) &&
          p.pageNumber < (proseStart?.pageNumber ?? Number.MAX_SAFE_INTEGER),
      )
      // The listing genuinely spans more than one page — the whole point.
      expect(
        frontMatter.length,
        'expected the front-matter listing to span multiple pages',
      ).toBeGreaterThan(1)

      const findings = await analyzeEyd(frontMatter)
      expect(
        findings,
        findings.map((f) => `p${f.pageNumber} ${f.ruleId}`).join('; '),
      ).toHaveLength(0)
    }, 120_000)

    it('positive control: the chopped leaders DO trip the rules without the section guard', async () => {
      const pages = await loadPages()
      const listingPages = pages.filter((p) => isDaftarListingPage(p.content))
      expect(listingPages.length, 'expected listing pages').toBeGreaterThan(0)

      // Run the punctuation rules raw (no skip ranges) over the same listing
      // pages. At least one chopped leader must fire repeated-period — that is
      // the false positive analyzeEyd suppresses.
      const rawRuleIds = listingPages.flatMap((p) =>
        runEydRules(p.content, []).map((f) => f.ruleId),
      )
      expect(
        rawRuleIds,
        'without the guard the listing leaders must fire repeated-period',
      ).toContain('eyd.repeated-period')
    }, 120_000)

    it('does not over-suppress: the PENDAHULUAN prose page is not treated as a listing', async () => {
      const pages = await loadPages()
      // Guard with pageNumber > DAFTAR ISI page: the table of contents itself
      // also mentions "PENDAHULUAN" and "Latar Belakang" as entries.
      const tocStart = pages.find((p) => /DAFTAR\s+ISI/i.test(p.content))
      const prosePage = pages.find(
        (p) =>
          p.pageNumber > (tocStart?.pageNumber ?? 0) &&
          /\bPENDAHULUAN\b/.test(p.content) &&
          /Latar\s+B/i.test(p.content),
      )
      expect(prosePage, 'expected the PENDAHULUAN prose page').toBeDefined()
      expect(isDaftarListingPage(prosePage?.content ?? '')).toBe(false)
    }, 120_000)
  },
)
