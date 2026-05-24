import { describe, expect, it } from 'vitest'
import {
  buildWindows,
  looksLikeFrontMatter,
  matchPassage,
  stripFrontMatter,
} from '#/services/matcher/passage-matcher'

const pages: SourcePage[] = [
  {
    pageNumber: 1,
    content: 'Introduction to TCP/IP networking and its layered architecture.',
  },
  {
    pageNumber: 7,
    content:
      'The TCP/IP model consists of four distinct layers: application, transport, internet, and network access. Each layer has well defined responsibilities.',
  },
  {
    pageNumber: 15,
    content:
      'OSI has seven layers, which is more granular than TCP/IP four-layer model. Various protocols exist at each level.',
  },
  {
    pageNumber: 99,
    content: 'References and bibliography follow on the next pages.',
  },
]

describe('matchPassage', () => {
  it('returns an exact-branch match when an 8-word n-gram hits verbatim', async () => {
    const r = await matchPassage({
      citationKey: 'Tanenbaum2021',
      thesisContext:
        'The TCP/IP model consists of four distinct layers: application transport.',
      sourcePages: pages,
    })
    expect(r).not.toBeNull()
    expect(r?.sourcePage).toBe(7)
    expect(r?.confidence).toBeGreaterThanOrEqual(0.9)
  })

  it('falls back to BM25 when no exact n-gram hits but vocabulary overlaps', async () => {
    const r = await matchPassage({
      citationKey: 'Tanenbaum2021',
      thesisContext:
        'application layer transport layer internet layer network access layer',
      sourcePages: pages,
    })
    expect(r).not.toBeNull()
    expect(r?.sourcePage).toBe(7)
  })

  it('returns null when no source page is relevant', async () => {
    const r = await matchPassage({
      citationKey: 'Banana',
      thesisContext: 'sourdough starter hydration ratios for rye bread',
      sourcePages: pages,
    })
    expect(r).toBeNull()
  })

  it('returns null on empty source pages', async () => {
    const r = await matchPassage({
      citationKey: 'X',
      thesisContext: 'anything',
      sourcePages: [],
    })
    expect(r).toBeNull()
  })
})

describe('looksLikeFrontMatter', () => {
  it('flags a journal title page with ISSN + volume + abstract markers', () => {
    const text =
      'E-ISSN : 2540 - 8984 JIPI Volume 05, Nomor 01, Juni 2020 ABSTRAK ' +
      'Penelitian ini merupakan penelitian pengembangan. Kata Kunci: media.'
    expect(looksLikeFrontMatter(text)).toBe(true)
  })

  it('does not flag plain body prose', () => {
    const text =
      'Game merupakan salah satu sarana hiburan yang banyak diminati. ' +
      'Perkembangan game di Indonesia semakin meningkat setiap tahunnya.'
    expect(looksLikeFrontMatter(text)).toBe(false)
  })

  it('does not flag on a single isolated signal', () => {
    const text =
      'Penelitian ini dilakukan tahun 2020 dengan Volume sample yang besar. ' +
      'Hasilnya menunjukkan peningkatan signifikan pada kelompok eksperimen.'
    expect(looksLikeFrontMatter(text)).toBe(false)
  })
})

describe('stripFrontMatter', () => {
  it('cuts at PENDAHULUAN on an Indonesian title page', () => {
    const text =
      'E-ISSN : 2540 - 8984 JIPI Volume 05, Nomor 01 ABSTRAK ' +
      'Penelitian pengembangan. Kata Kunci: media, fisika, android. ' +
      'ABSTRACT This is a development research. Keywords: media. ' +
      'I. P E N D A H U L U A N Game merupakan salah satu sarana hiburan ' +
      'yang banyak diminati oleh banyak orang dari berbagai kalangan.'
    const out = stripFrontMatter(text)
    expect(out.startsWith('Game merupakan')).toBe(true)
    expect(out).not.toContain('ABSTRAK')
    expect(out).not.toContain('ISSN')
  })

  it('cuts at Latar Belakang when PENDAHULUAN is absent', () => {
    const text =
      'CBIS JOURNAL Vol. 11 No. 01 ISSN : 2337-8794 ABSTRACT This research ' +
      'is about Arabic learning. Keywords: Android, Kotlin. ' +
      'KORESPONDENSI E-mail: foo@bar.ac.id ' +
      'I. Latar Belakang Bahasa Arab merupakan salah satu bahasa yang ' +
      'banyak dipelajari di Indonesia, bahkan dunia secara umum.'
    const out = stripFrontMatter(text)
    expect(out.startsWith('Bahasa Arab merupakan')).toBe(true)
    expect(out).not.toContain('KORESPONDENSI')
  })

  it('returns text unchanged when no body marker is found', () => {
    const text =
      'E-ISSN : 1234-5678 Vol. 11 No. 1 Some journal banner with no body ' +
      'section heading at all in this page extract however.'
    expect(stripFrontMatter(text)).toBe(text)
  })

  it('passes plain body prose through untouched', () => {
    const text =
      'Game merupakan salah satu sarana hiburan yang banyak diminati. ' +
      'Penelitian ini menunjukkan tingkat kelayakan sebesar 90 persen.'
    expect(stripFrontMatter(text)).toBe(text)
  })
})

describe('buildWindows with front-matter pages', () => {
  it('emits body-only windows for a title page', () => {
    const titlePage: SourcePage = {
      pageNumber: 1,
      content:
        'E-ISSN : 2540 - 8984 JIPI Volume 05, Nomor 01 ABSTRAK Penelitian ' +
        'pengembangan. Kata Kunci: media. ABSTRACT Development research. ' +
        'Keywords: media. I. PENDAHULUAN Game merupakan salah satu sarana ' +
        'hiburan yang sangat populer. Perkembangan game di Indonesia terus ' +
        'meningkat dari tahun ke tahun.',
    }
    const windows = buildWindows([titlePage])
    expect(windows.length).toBeGreaterThan(0)
    for (const w of windows) {
      expect(w.text).not.toContain('ABSTRAK')
      expect(w.text).not.toContain('E-ISSN')
    }
  })
})
