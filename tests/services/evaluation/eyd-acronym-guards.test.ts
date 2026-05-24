import { beforeAll, describe, expect, it } from 'vitest'
import { analyzeEyd } from '#/services/evaluation/eyd/analyzer'
import { refreshVocabularyCache } from '#/services/evaluation/vocabulary-cache'

beforeAll(async () => {
  await refreshVocabularyCache()
})

const makePage = (pageNumber: number, content: string): AnalyzedPage => ({
  pageNumber,
  content,
  codeRanges: [],
  italicRanges: [],
})

const acronymTokens = async (pages: AnalyzedPage[]): Promise<string[]> => {
  const findings = await analyzeEyd(pages)
  return findings
    .filter((f) => f.ruleId === 'eyd.acronym-undeclared')
    .map((f) => {
      const page = pages.find((p) => p.pageNumber === f.pageNumber)
      return page?.content.slice(f.offset, f.offset + f.length) ?? ''
    })
}

describe('eyd.acronym-undeclared — FP guards', () => {
  it('skips Indonesian section-header words on TOC / chapter title pages', async () => {
    const tokens = await acronymTokens([
      makePage(
        1,
        'DAFTAR ISI\n\nDAFTAR TABEL\n\nDAFTAR GAMBAR\n\nBAB 1 PENDAHULUAN\n\nBAB 2 LANDASAN KEPUSTAKAAN\n',
      ),
    ])
    for (const word of ['DAFTAR', 'TABEL', 'GAMBAR', 'BAB', 'LANDASAN']) {
      expect(tokens, `expected "${word}" to be filtered`).not.toContain(word)
    }
  })

  it('skips acronyms on Tabel/Gambar caption lines (ATP, ADDIE, TKJ)', async () => {
    const tokens = await acronymTokens([
      makePage(
        1,
        'Tabel 4.1 ATP Mata Pelajaran Informatika\n\nGambar 4.1 ADDIE Model untuk Pengembangan Kurikulum\n\nGambar 4.2 Topologi Jaringan TKJ pada Laboratorium\n',
      ),
    ])
    for (const word of ['ATP', 'ADDIE', 'TKJ']) {
      expect(tokens, `expected "${word}" to be filtered`).not.toContain(word)
    }
  })

  it('skips remaining words on a chapter title line (BAB N TITLE)', async () => {
    const tokens = await acronymTokens([
      makePage(1, 'BAB 4 ANALISIS DAN PERANCANGAN SISTEM\n'),
    ])
    for (const word of ['BAB', 'ANALISIS']) {
      expect(tokens, `expected "${word}" to be filtered`).not.toContain(word)
    }
  })

  it('skips school-type abbreviations (SDN, SMPN, SMAN, SMKN)', async () => {
    const tokens = await acronymTokens([
      makePage(
        1,
        'Penelitian dilakukan di SDN 1 Pamekasan dan SMPN 3 Surabaya. SMAN 5 Bandung dan SMKN 1 Yogyakarta turut berpartisipasi dalam studi.\n',
      ),
    ])
    for (const word of ['SDN', 'SMPN', 'SMAN', 'SMKN']) {
      expect(tokens, `expected "${word}" to be filtered`).not.toContain(word)
    }
  })

  it('still flags genuinely undeclared acronyms in prose (positive control)', async () => {
    const tokens = await acronymTokens([
      makePage(
        1,
        'Penelitian ini mengacu pada laporan QNBP tahun 2023 mengenai pendidikan vokasi di Indonesia.\n',
      ),
    ])
    expect(tokens).toContain('QNBP')
  })

  it('respects prior `Phrase (ACRONYM)` declaration in prose', async () => {
    const tokens = await acronymTokens([
      makePage(
        1,
        'Penelitian ini menggunakan Quantum Neural Bayesian Predictor (QNBP) sebagai alat utama. Hasil QNBP menunjukkan akurasi tinggi.\n',
      ),
    ])
    expect(tokens).not.toContain('QNBP')
  })

  it('does not let caption-line guard mask a genuine acronym used elsewhere', async () => {
    const tokens = await acronymTokens([
      makePage(1, 'Tabel 4.1 XYZQ Daftar Sampel Penelitian\n'),
      makePage(
        2,
        'Hasil pengukuran menunjukkan bahwa XYZQ memiliki nilai rata-rata yang signifikan.\n',
      ),
    ])
    expect(tokens).toContain('XYZQ')
  })

  it('suppresses cover-page title block (no newlines, long all-caps run)', async () => {
    const tokens = await acronymTokens([
      makePage(
        1,
        'PENGEMBANGAN MEDIA PEMBELAJARAN BERBASIS GIM ANDROID MENGGUNAKAN JETPACK COMPOSE PADA MATA PELAJARAN MEDIA DAN JARINGAN TELEKOMUNIKASI DI SMK NEGERI 5 MALANG SKRIPSI Disusun oleh Devan',
      ),
    ])
    for (const word of [
      'MEDIA', 'GIM', 'ANDROID', 'JETPACK', 'COMPOSE',
      'PADA', 'MATA', 'DAN', 'JARINGAN', 'NEGERI', 'MALANG', 'SKRIPSI',
    ]) {
      expect(tokens, `cover-page token "${word}" should be suppressed`).not.toContain(word)
    }
  })

  it('suppresses TOC entries on lines with leader dots', async () => {
    const tokens = await acronymTokens([
      makePage(
        1,
        '4 3.4.2 Teknik Pengumpulan ...................... 39 3.5 Instrumen Penelitian KINERJA SOLUSI ............ 41\n',
      ),
    ])
    for (const word of ['KINERJA', 'SOLUSI']) {
      expect(tokens, `TOC token "${word}" should be suppressed`).not.toContain(word)
    }
  })

  it('handles leading page number before chapter title (102 BAB 6 …)', async () => {
    const tokens = await acronymTokens([
      makePage(1, '102 BAB 6 IMPLEMENTASI DAN EVALUASI MEDIA PEMBELAJARAN\n'),
    ])
    for (const word of ['BAB', 'EVALUASI', 'MEDIA']) {
      expect(tokens, `"${word}" should be suppressed on chapter title line`).not.toContain(word)
    }
  })

  it('handles caption line with leading page number and space-in-decimal (69 Tabel 4. 7 …)', async () => {
    const tokens = await acronymTokens([
      makePage(1, '69 Tabel 4. 7 Use Case Scenario Memulai Quiz UC - QP - 1 Nama\n'),
    ])
    expect(tokens).not.toContain('QP')
  })

  it('suppresses DAFTAR TABEL / DAFTAR GAMBAR page headers concatenated with first entry', async () => {
    const tokens = await acronymTokens([
      makePage(
        1,
        '6 DAFTAR TABEL Tabel 2.1 Kajian Pustaka ........... 14 Tabel 3.1 Skala Likert ........... ATP ........... 23\n',
      ),
      makePage(
        2,
        '7 DAFTAR GAMBAR Gambar 3.1 Tahapan dalam model ADDIE ........... 35 Gambar 3.2 Lokasi SMK Negeri ........... TKJ ........... 47\n',
      ),
    ])
    for (const word of ['ATP', 'TKJ']) {
      expect(tokens, `"${word}" on DAFTAR header line should be suppressed`).not.toContain(word)
    }
  })

  it('keeps flagging acronyms in single-occurrence prose (round-2 positive control)', async () => {
    const tokens = await acronymTokens([
      makePage(
        1,
        'Penelitian ini membahas konsep ZYXW yang dikembangkan di laboratorium pada tahun 2024.\n',
      ),
    ])
    expect(tokens).toContain('ZYXW')
  })
})
