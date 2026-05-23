import { asc, eq } from 'drizzle-orm'
import { db } from '#/db'
import { evaluationFindings, evaluationPages } from '#/db/schema'

type Page = { pageNumber: number; content: string }
type Finding = typeof evaluationFindings.$inferInsert

const REQUIRED_FRONT_MATTER = [
  'PENGESAHAN',
  'PERSETUJUAN',
  'PERNYATAAN ORISINALITAS',
  'PRAKATA',
  'ABSTRAK',
  'ABSTRACT',
  'DAFTAR ISI',
] as const

const NONIMPLEMENTATIF_CHAPTERS = [
  'PENDAHULUAN',
  'LANDASAN KEPUSTAKAAN',
  'METODOLOGI',
  'HASIL',
  'PEMBAHASAN',
  'PENUTUP',
] as const

const IMPLEMENTATIF_CHAPTERS = [
  'PENDAHULUAN',
  'LANDASAN KEPUSTAKAAN',
  'METODOLOGI',
  'REKAYASA',
  'PERANCANGAN',
  'PENGUJIAN',
  'PENUTUP',
] as const

const DAFTAR_REFERENSI_RE = /\bDAFTAR\s+REFERENSI\b/i

type BabHeading = { number: number; title: string; pageNumber: number }

const findBabHeadings = (pages: Page[]): BabHeading[] => {
  const headings: BabHeading[] = []
  const seen = new Set<number>()
  for (const page of pages) {
    const lines = page.content.split('\n')
    for (const line of lines) {
      const match = line.trim().match(/^BAB\s+(\d+)\s+(.+)$/)
      if (!match) continue
      const num = Number.parseInt(match[1], 10)
      if (seen.has(num)) continue
      seen.add(num)
      headings.push({ number: num, title: match[2].trim(), pageNumber: page.pageNumber })
    }
  }
  return headings.toSorted((a, b) => a.number - b.number)
}

const findKeywordPage = (pages: Page[], keyword: string): number | null => {
  const re = new RegExp(`\\b${keyword}\\b`, 'i')
  for (const page of pages) {
    if (re.test(page.content)) return page.pageNumber
  }
  return null
}

const finding = (
  evalJobId: string,
  severity: 'error' | 'warning' | 'info',
  ruleId: string,
  message: string,
  pageNumber?: number,
  suggestion?: string,
): Finding => ({
  evalJobId,
  category: 'filkom',
  severity,
  ruleId,
  message,
  suggestion: suggestion ?? null,
  pageNumber: pageNumber ?? null,
  offset: null,
  length: null,
  excerpt: null,
})

const checkFrontMatter = (evalJobId: string, pages: Page[]): Finding[] => {
  const findings: Finding[] = []
  const hasPengesahan = findKeywordPage(pages, 'PENGESAHAN')
  const hasPersetujuan = findKeywordPage(pages, 'PERSETUJUAN')

  if (!hasPengesahan && !hasPersetujuan) {
    findings.push(
      finding(
        evalJobId,
        'error',
        'filkom.missing-pengesahan',
        'Skripsi harus memiliki halaman PENGESAHAN atau PERSETUJUAN.',
      ),
    )
  } else if (hasPengesahan && hasPersetujuan) {
    findings.push(
      finding(
        evalJobId,
        'warning',
        'filkom.pengesahan-and-persetujuan',
        'Skripsi mengandung halaman PENGESAHAN dan PERSETUJUAN. Pilih satu sesuai fase.',
      ),
    )
  }

  for (const section of REQUIRED_FRONT_MATTER) {
    if (section === 'PENGESAHAN' || section === 'PERSETUJUAN') continue
    if (findKeywordPage(pages, section) === null) {
      findings.push(
        finding(
          evalJobId,
          'error',
          `filkom.missing-${section.toLowerCase().replace(/\s+/g, '-')}`,
          `Halaman ${section} tidak ditemukan.`,
        ),
      )
    }
  }
  return findings
}

const checkChapterStructure = (
  evalJobId: string,
  pages: Page[],
): Finding[] => {
  const findings: Finding[] = []
  const babs = findBabHeadings(pages)

  if (!babs.length) {
    findings.push(
      finding(
        evalJobId,
        'error',
        'filkom.no-chapters',
        'Tidak ada heading "BAB" yang terdeteksi.',
      ),
    )
    return findings
  }

  for (let i = 0; i < babs.length; i++) {
    if (babs[i].number !== i + 1) {
      findings.push(
        finding(
          evalJobId,
          'error',
          'filkom.chapter-numbering',
          `BAB ${babs[i].number} muncul di posisi ${i + 1}; penomoran bab harus berurutan.`,
          babs[i].pageNumber,
        ),
      )
      break
    }
  }

  const babCount = babs.length
  const expected =
    babCount >= 7
      ? IMPLEMENTATIF_CHAPTERS
      : babCount === 5
        ? NONIMPLEMENTATIF_CHAPTERS.filter((c) => c !== 'HASIL')
        : NONIMPLEMENTATIF_CHAPTERS

  if (
    babCount !== NONIMPLEMENTATIF_CHAPTERS.length &&
    babCount !== IMPLEMENTATIF_CHAPTERS.length &&
    babCount !== 5
  ) {
    findings.push(
      finding(
        evalJobId,
        'warning',
        'filkom.unexpected-chapter-count',
        `Jumlah bab ${babCount} tidak cocok dengan skripsi nonimplementatif (6), implementatif (7), atau merged (5).`,
      ),
    )
  }

  for (const [i, bab] of babs.entries()) {
    const expectedKeyword = expected[i]
    if (!expectedKeyword) continue
    if (!new RegExp(expectedKeyword, 'i').test(bab.title)) {
      findings.push(
        finding(
          evalJobId,
          'warning',
          'filkom.chapter-title-mismatch',
          `BAB ${bab.number} berjudul "${bab.title}". Diharapkan mengandung "${expectedKeyword}".`,
          bab.pageNumber,
        ),
      )
    }
  }

  return findings
}

const checkHeadingDepth = (evalJobId: string, pages: Page[]): Finding[] => {
  const findings: Finding[] = []
  const deep = /^(\d+(?:\.\d+){4,})\s/m
  for (const page of pages) {
    const match = page.content.match(deep)
    if (match) {
      findings.push(
        finding(
          evalJobId,
          'warning',
          'filkom.heading-depth',
          `Penomoran sub-bab "${match[1]}" melebihi kedalaman 4. Template FILKOM membatasi hingga X.X.X.X.`,
          page.pageNumber,
        ),
      )
    }
  }
  return findings
}

const checkAbstract = (evalJobId: string, pages: Page[]): Finding[] => {
  const findings: Finding[] = []
  const abstrakPage = pages.find((p) => /\bABSTRAK\b/.test(p.content))
  if (!abstrakPage) return findings

  const content = abstrakPage.content
  const kataKunciIdx = content.search(/Kata\s+kunci\s*:/i)
  const bodyEnd =
    kataKunciIdx > -1 ? kataKunciIdx : content.length
  const bodyStart = content.search(/\bABSTRAK\b/) + 'ABSTRAK'.length
  const body = content.slice(bodyStart, bodyEnd).trim()
  const wordCount = body.split(/\s+/).filter(Boolean).length

  if (wordCount < 200 || wordCount > 300) {
    findings.push(
      finding(
        evalJobId,
        'warning',
        'filkom.abstract-word-count',
        `Abstrak berisi ${wordCount} kata; template mensyaratkan 200–300 kata.`,
        abstrakPage.pageNumber,
      ),
    )
  }

  if (kataKunciIdx === -1) {
    findings.push(
      finding(
        evalJobId,
        'error',
        'filkom.missing-kata-kunci',
        'Baris "Kata kunci:" tidak ditemukan pada halaman ABSTRAK.',
        abstrakPage.pageNumber,
      ),
    )
    return findings
  }

  const kataKunciLine = content
    .slice(kataKunciIdx)
    .split(/\r?\n/)[0]
    .replace(/^Kata\s+kunci\s*:\s*/i, '')
  const keywords = kataKunciLine
    .split(/[,;]/)
    .map((k) => k.trim())
    .filter(Boolean)

  if (keywords.length < 5 || keywords.length > 7) {
    findings.push(
      finding(
        evalJobId,
        'warning',
        'filkom.kata-kunci-count',
        `Kata kunci berisi ${keywords.length} item; template mensyaratkan 5–7 kata kunci.`,
        abstrakPage.pageNumber,
      ),
    )
  }

  return findings
}

const checkDaftarReferensi = (
  evalJobId: string,
  pages: Page[],
): Finding[] => {
  if (pages.some((p) => DAFTAR_REFERENSI_RE.test(p.content))) return []
  return [
    finding(
      evalJobId,
      'error',
      'filkom.missing-daftar-referensi',
      'Halaman DAFTAR REFERENSI tidak ditemukan.',
    ),
  ]
}

export async function runFilkomCheck(evalJobId: string): Promise<number> {
  const pages = await db
    .select({
      pageNumber: evaluationPages.pageNumber,
      content: evaluationPages.content,
    })
    .from(evaluationPages)
    .where(eq(evaluationPages.evalJobId, evalJobId))
    .orderBy(asc(evaluationPages.pageNumber))

  if (!pages.length) return 0

  const rows: Finding[] = [
    ...checkFrontMatter(evalJobId, pages),
    ...checkChapterStructure(evalJobId, pages),
    ...checkHeadingDepth(evalJobId, pages),
    ...checkAbstract(evalJobId, pages),
    ...checkDaftarReferensi(evalJobId, pages),
  ]

  if (rows.length) {
    await db.insert(evaluationFindings).values(rows)
  }

  return rows.length
}
