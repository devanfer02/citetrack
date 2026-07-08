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

const DAFTAR_LISTING_HEADING_RE =
  /\bDAFTAR\s+(?:ISI|TABEL|GAMBAR|LAMPIRAN|SINGKATAN|LAMBANG|NOTASI|ISTILAH|GRAFIK|BAGAN|DIAGRAM|RUMUS|PERSAMAAN)\b/i
// A run of dot leaders, tolerant to the single spaces pdf extraction sometimes
// injects between glyphs — matches ".........." and ". . . ." alike.
const LEADER_RUN_RE = /\.(?:[ \t]?\.){3,}/g

const countLeaderRuns = (content: string): number =>
  (content.match(LEADER_RUN_RE) ?? []).length

// A page belongs to a "Daftar ..." listing (table of contents, list of
// figures / tables / appendices) when it carries a listing heading or is
// dominated by dot-leader entries. These listings routinely run across several
// pages, so a continuation page — no heading of its own but still full of
// leader entries — counts too when the previous page was already a listing.
// The dot leaders here are correct typography, not repeated-period typos, so
// the whole page is exempt from EYD checks (mirroring the bibliography skip).
// DAFTAR PUSTAKA / REFERENSI is intentionally excluded here: it has no leaders
// and is already handled by findReferencesStartPage.
export const isDaftarListingPage = (
  content: string,
  prevWasListing = false,
): boolean => {
  const leaderRuns = countLeaderRuns(content)
  if (DAFTAR_LISTING_HEADING_RE.test(content)) return leaderRuns >= 1
  if (leaderRuns >= 3) return true
  return prevWasListing && leaderRuns >= 1
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

const ACRONYM_TOKEN_RE = /\b[A-Z]{2,8}\b/g
const ACRONYM_DECL_RE = /(?:\b[A-Za-zà-ÿ][\w-]*\s+){2,9}\(([A-Z]{2,8})\)/g
const ROMAN_NUMERAL_RE = /^M{0,3}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$/
const LABEL_CONTEXT_RE = /\b(BAB|Bab|Tabel|TABEL|Gambar|GAMBAR|Lampiran|LAMPIRAN|Bagian|BAGIAN|Halaman|Pasal|PASAL|Lihat)\s*$/
const CAPTION_LINE_RE =
  /^\s*(?:\d+\s+)?(?:DAFTAR\s+(?:ISI|TABEL|GAMBAR|LAMPIRAN|PUSTAKA|REFERENSI)|(?:Tabel|TABEL|Gambar|GAMBAR|Lampiran|LAMPIRAN|Bab|BAB)\s+\d+(?:\.\s*\d+)*)\b/
const TOC_LEADER_DOT_RE = /\.{4,}/
const TITLE_BLOCK_RE =
  /\b[A-Z][A-Z'-]+\b(?:[\s\d]+\b[A-Z][A-Z'-]+\b){2,}/g

const SECTION_HEADER_WORDS: ReadonlySet<string> = new Set([
  'DAFTAR', 'ISI', 'TABEL', 'GAMBAR', 'BAB', 'LANDASAN',
  'BAGIAN', 'PASAL', 'LAMPIRAN', 'HALAMAN',
  'HASIL', 'PUSTAKA', 'METODE', 'TEORI', 'KAJIAN',
  'ABSTRAK', 'ABSTRACT', 'PENUTUP', 'SARAN',
  'TUJUAN', 'MANFAAT', 'MASALAH', 'BATASAN',
  'ANALISIS', 'DASAR', 'LATAR', 'KATA', 'LEMBAR',
  'RIWAYAT', 'HIDUP', 'PRAKATA', 'SISTEM', 'TERKAIT',
  'KINERJA', 'SOLUSI', 'EVALUASI', 'PENGESAHAN',
])

const UNIVERSAL_ACRONYMS: ReadonlySet<string> = new Set([
  'RI', 'DPR', 'MPR', 'MK', 'MA', 'KPK', 'BPK', 'KPU', 'TNI', 'POLRI',
  'PNS', 'ASN', 'BIN', 'KPI', 'PBB', 'PMI', 'MUI', 'NU', 'UU',
  'BPS', 'BNN', 'BNPB', 'BMKG', 'BPN', 'BPJS', 'BPKP', 'BPOM',
  'SD', 'SDN', 'SMP', 'SMPN', 'SMA', 'SMAN', 'SMK', 'SMKN',
  'MI', 'MIN', 'MTS', 'MTSN', 'MAN', 'NIK', 'SARA',
  'S1', 'S2', 'S3', 'D1', 'D2', 'D3', 'D4',
  'PT', 'PTN', 'PTS',
  'KKN', 'OSIS', 'PMR', 'PJOK', 'PKK',
  'KHS', 'KRS', 'SKS', 'IPK', 'UTS', 'UAS', 'UN', 'UNBK', 'UTBK',
  'NIM', 'NIP', 'NRP', 'NUPTK', 'NPSN',
  'AI', 'ML', 'NLP', 'AR', 'VR', 'XR', 'IT', 'TI',
  'CPU', 'GPU', 'RAM', 'ROM', 'SSD', 'HDD', 'USB',
  'OS', 'UI', 'UX', 'API', 'SDK', 'CLI', 'GUI', 'IDE',
  'URL', 'HTML', 'CSS', 'XML', 'JSON', 'YAML', 'PDF', 'DOC', 'DOCX',
  'HTTP', 'HTTPS', 'TCP', 'UDP', 'IP', 'FTP', 'SSH', 'TLS', 'SSL',
  'SQL', 'JS', 'TS', 'CSV', 'JPG', 'JPEG', 'PNG', 'GIF', 'SVG',
  'MP3', 'MP4', 'AVI', 'WAV',
  'DNS', 'CDN', 'VPN', 'LAN', 'WAN', 'WLAN',
  'DNA', 'RNA', 'GPS', 'GIS', 'CAD', 'CAM',
  'KTP', 'SIM', 'STNK', 'NPWP', 'KK', 'KIA', 'KIS', 'PIN', 'ATM',
  'CV', 'UD', 'BUMN', 'BUMD', 'LSM',
  'WHO', 'UNICEF', 'UNESCO', 'EU', 'ASEAN', 'USA', 'UK',
  'ISO', 'IEEE', 'ACM', 'WIPO',
  'GMT', 'UTC', 'WIB', 'WIT', 'WITA', 'AM', 'PM',
  'TV', 'AC', 'DC', 'OK', 'ID', 'NO',
  'CEO', 'CFO', 'CTO', 'COO', 'HRD',
  'DOI', 'ISBN', 'ISSN', 'ORCID',
])

const isRomanNumeral = (token: string): boolean =>
  token.length > 0 && ROMAN_NUMERAL_RE.test(token)

const buildDeclaredAcronyms = (pages: AnalyzedPage[]): Map<string, number> => {
  const declared = new Map<string, number>()
  for (const page of pages) {
    const re = new RegExp(ACRONYM_DECL_RE.source, ACRONYM_DECL_RE.flags)
    let m: RegExpExecArray | null
    while ((m = re.exec(page.content)) !== null) {
      const acronym = m[1]
      if (!declared.has(acronym)) declared.set(acronym, page.pageNumber)
    }
  }
  return declared
}

const collectTitleBlockRanges = (
  content: string,
): Array<[number, number]> => {
  const ranges: Array<[number, number]> = []
  for (const m of content.matchAll(TITLE_BLOCK_RE)) {
    const start = m.index ?? 0
    ranges.push([start, start + m[0].length])
  }
  return ranges
}

const checkUndeclaredAcronyms = (
  page: AnalyzedPage,
  declared: Map<string, number>,
  urlRanges: Array<[number, number]>,
  globalSeen: Set<string>,
): EydFinding[] => {
  const findings: EydFinding[] = []
  const skipRanges = [...page.codeRanges, ...urlRanges]
  const titleBlockRanges = collectTitleBlockRanges(page.content)
  const re = new RegExp(ACRONYM_TOKEN_RE.source, ACRONYM_TOKEN_RE.flags)
  let m: RegExpExecArray | null

  while ((m = re.exec(page.content)) !== null) {
    const token = m[0]
    const offset = m.index

    if (globalSeen.has(token)) continue
    if (UNIVERSAL_ACRONYMS.has(token)) continue
    if (SECTION_HEADER_WORDS.has(token)) continue
    if (isRomanNumeral(token)) continue
    if (overlapsRanges(offset, token.length, skipRanges)) continue
    if (overlapsRanges(offset, token.length, page.italicRanges)) continue
    if (overlapsRanges(offset, token.length, titleBlockRanges)) continue

    const lookback = page.content.slice(Math.max(0, offset - 30), offset)
    if (LABEL_CONTEXT_RE.test(lookback)) continue

    const lineStart = page.content.lastIndexOf('\n', offset - 1) + 1
    const lineEndIdx = page.content.indexOf('\n', offset)
    const lineEnd = lineEndIdx === -1 ? page.content.length : lineEndIdx
    const line = page.content.slice(lineStart, lineEnd)
    if (TOC_LEADER_DOT_RE.test(line)) continue
    if (CAPTION_LINE_RE.test(line)) continue

    const declaredOn = declared.get(token)
    if (declaredOn !== undefined && declaredOn <= page.pageNumber) continue

    globalSeen.add(token)
    findings.push({
      ruleId: 'eyd.acronym-undeclared',
      severity: 'warning',
      offset,
      length: token.length,
      message: `Singkatan "${token}" digunakan tanpa penjelasan kepanjangan sebelumnya. Tulis "Kepanjangan (${token})" pada penggunaan pertama.`,
      suggestion: null,
    })
  }

  return findings
}

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
  const declaredAcronyms = buildDeclaredAcronyms(pages)
  const acronymSeen = new Set<string>()
  const out: AnalyzedEydFinding[] = []

  let prevWasListing = false
  for (const page of pages) {
    if (refsPage !== null && page.pageNumber >= refsPage) continue

    const listing = isDaftarListingPage(page.content, prevWasListing)
    prevWasListing = listing
    if (listing) continue

    const urlRanges = collectUrlRanges(page.content)
    const skipRanges = [...page.codeRanges, ...urlRanges]

    for (const f of runEydRules(page.content, skipRanges)) {
      out.push({ ...f, pageNumber: page.pageNumber })
    }
    for (const f of await checkForeignNotItalic(page, urlRanges)) {
      out.push({ ...f, pageNumber: page.pageNumber })
    }
    for (const f of checkUndeclaredAcronyms(
      page,
      declaredAcronyms,
      urlRanges,
      acronymSeen,
    )) {
      out.push({ ...f, pageNumber: page.pageNumber })
    }
  }
  return out
}
