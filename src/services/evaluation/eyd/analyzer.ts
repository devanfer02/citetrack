import { isEnglishWord } from '#/services/evaluation/kbbi/english'
import { isKnownWord } from '#/services/evaluation/kbbi/lookup'
import { overlapsRanges } from '#/services/evaluation/range-utils'
import { getCachedClassification } from '#/services/evaluation/vocabulary-cache'
import { runEydRules, type EydFinding } from '#/services/evaluation/eyd/rules'

const TOKEN_RE = /[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'-]*/g
const URL_RE = /\bhttps?:\/\/\S+|\bwww\.\S+|\b\S+\.(?:com|org|net|ac\.id|co\.id|io|ly|gov)(?:\/\S*)?/gi
const DAFTAR_REFERENSI_RE = /\bDAFTAR\s+(REFERENSI|PUSTAKA)\b/i

export type AnalyzedEydFinding = EydFinding & { pageNumber: number }

const TOC_LEADER_RE = /\.{6,}/
const BAB_LISTING_RE = /\bBAB\s+\d+\b.*\bBAB\s+\d+\b/s

const findReferencesStartPage = (pages: AnalyzedPage[]): number | null => {
  for (let i = pages.length - 1; i >= 0; i--) {
    const page = pages[i]
    if (!DAFTAR_REFERENSI_RE.test(page.content)) continue
    if (TOC_LEADER_RE.test(page.content) && BAB_LISTING_RE.test(page.content)) continue
    return page.pageNumber
  }
  return null
}

const collectUrlRanges = (content: string): Array<[number, number]> => {
  const ranges: Array<[number, number]> = []
  for (const m of content.matchAll(URL_RE)) {
    const start = m.index ?? 0
    ranges.push([start, start + m[0].length])
  }
  return ranges
}

const isAllCaps = (token: string): boolean => /^[A-Z]+$/.test(token)

async function checkForeignNotItalic(
  page: AnalyzedPage,
  urlRanges: Array<[number, number]>,
): Promise<EydFinding[]> {
  const findings: EydFinding[] = []
  const seen = new Set<string>()
  const skipRanges = [...page.codeRanges, ...urlRanges]

  for (const match of page.content.matchAll(TOKEN_RE)) {
    const token = match[0]
    if (token.length < 4) continue
    const offset = match.index ?? 0
    if (overlapsRanges(offset, token.length, skipRanges)) continue
    if (overlapsRanges(offset, token.length, page.italicRanges)) continue

    const lower = token.toLowerCase()
    if (seen.has(lower)) continue

    if (isAllCaps(token) && token.length <= 6) continue
    const isFirstOfSentence = offset === 0
    if (!isFirstOfSentence && /^[A-Z]/.test(token)) continue

    const cachedClass = getCachedClassification(lower)
    const techMatch = cachedClass === 'tech'
    const englishMatch =
      cachedClass === 'tech' ||
      cachedClass === 'english' ||
      (await isEnglishWord(lower))
    if (!englishMatch) continue

    const kbbiResult = await isKnownWord(token)
    if (kbbiResult.known && !kbbiResult.isEnglish) continue

    seen.add(lower)

    const kind = techMatch ? 'istilah teknis' : 'istilah asing'
    findings.push({
      ruleId: 'eyd.foreign-not-italic',
      severity: 'warning',
      offset,
      length: token.length,
      message: `${kind.charAt(0).toUpperCase()}${kind.slice(1)} "${token}" sebaiknya ditulis miring.`,
      suggestion: null,
    })
  }
  return findings
}

export async function analyzeEyd(
  pages: AnalyzedPage[],
): Promise<AnalyzedEydFinding[]> {
  const refsPage = findReferencesStartPage(pages)
  const out: AnalyzedEydFinding[] = []

  for (const page of pages) {
    if (refsPage !== null && page.pageNumber >= refsPage) continue

    const urlRanges = collectUrlRanges(page.content)
    const skipRanges = [...page.codeRanges, ...urlRanges]

    for (const f of runEydRules(page.content, skipRanges)) {
      out.push({ ...f, pageNumber: page.pageNumber })
    }
    for (const f of await checkForeignNotItalic(page, urlRanges)) {
      out.push({ ...f, pageNumber: page.pageNumber })
    }
  }
  return out
}
