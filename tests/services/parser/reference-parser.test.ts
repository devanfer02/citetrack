import { describe, expect, it } from 'vitest'
import {
  detectReferenceSection,
  parseReferenceEntry,
  parseReferences,
} from '#/services/parser/reference-parser'

describe('detectReferenceSection', () => {
  it('detects "Daftar Pustaka" heading', () => {
    const pages = [
      { pageNumber: 1, content: 'BAB I Pendahuluan bla bla' },
      { pageNumber: 50, content: 'Daftar Pustaka Creswell, J. (2014).' },
    ]
    const section = detectReferenceSection(pages)
    expect(section).not.toBeNull()
    expect(section!.startPage).toBe(50)
  })

  it('detects "References" heading', () => {
    const pages = [
      { pageNumber: 1, content: 'Introduction to the study.' },
      { pageNumber: 30, content: 'References Smith, J. (2020). Title.' },
    ]
    const section = detectReferenceSection(pages)
    expect(section).not.toBeNull()
    expect(section!.startPage).toBe(30)
  })

  it('detects "Bibliography" heading', () => {
    const pages = [
      { pageNumber: 1, content: 'Chapter one.' },
      { pageNumber: 20, content: 'Bibliography Johnson, A. (2019).' },
    ]
    const section = detectReferenceSection(pages)
    expect(section).not.toBeNull()
  })

  it('detects "Referensi" heading', () => {
    const pages = [
      { pageNumber: 1, content: 'Bab satu.' },
      { pageNumber: 25, content: 'Referensi Pratama, B. (2022).' },
    ]
    const section = detectReferenceSection(pages)
    expect(section).not.toBeNull()
  })

  it('returns null when no reference section found', () => {
    const pages = [
      { pageNumber: 1, content: 'Just some regular text here.' },
      { pageNumber: 2, content: 'More regular text.' },
    ]
    expect(detectReferenceSection(pages)).toBeNull()
  })

  it('concatenates text from reference page onwards', () => {
    const pages = [
      { pageNumber: 1, content: 'Intro.' },
      { pageNumber: 10, content: 'Daftar Pustaka First entry.' },
      { pageNumber: 11, content: 'Second entry continued.' },
    ]
    const section = detectReferenceSection(pages)
    expect(section).not.toBeNull()
    expect(section!.text).toContain('First entry')
    expect(section!.text).toContain('Second entry')
  })
})

describe('parseReferenceEntry', () => {
  it('parses APA book entry', () => {
    const raw =
      'Creswell, J. W. (2014). Research design: Qualitative, quantitative, and mixed methods approaches. Sage Publications.'
    const ref = parseReferenceEntry(raw)
    expect(ref.author).toBe('Creswell, J. W')
    expect(ref.year).toBe('2014')
    expect(ref.title).toContain('Research design')
    expect(ref.rawText).toBe(raw)
  })

  it('parses APA journal entry', () => {
    const raw =
      'Smith, J. A., & Johnson, B. (2020). A study of citation patterns. Journal of Information Science, 46(3), 301-315.'
    const ref = parseReferenceEntry(raw)
    expect(ref.author).toContain('Smith')
    expect(ref.author).toContain('Johnson')
    expect(ref.year).toBe('2020')
    expect(ref.title).toContain('citation patterns')
  })

  it('parses Indonesian "Author. Year. Title" format', () => {
    const raw =
      'Abdul Majid. 2007. Perencanaan pembelajaran (mengembangkan Standar Kompetensi guru). Bandung: PT Remaja Rosdakarya.'
    const ref = parseReferenceEntry(raw)
    expect(ref.author).toBe('Abdul Majid')
    expect(ref.year).toBe('2007')
    expect(ref.title).toContain('Perencanaan pembelajaran')
    expect(ref.publisher).toContain('Bandung')
  })

  it('parses Indonesian "Author, F. Year." format', () => {
    const raw =
      'Atar Semi. 1990. Menulis Efektif. Padang: CV Angkasa Raya.'
    const ref = parseReferenceEntry(raw)
    expect(ref.author).toBe('Atar Semi')
    expect(ref.year).toBe('1990')
    expect(ref.title).toContain('Menulis Efektif')
  })

  it('parses Indonesian entry with "dan" (and)', () => {
    const raw =
      'Darmiyati Zuchdi dan Budiasih. 2001. Pendidikan Bahasa dan Sastra Indonesia di Kelas Rendah. Yogyakarta: PAS.'
    const ref = parseReferenceEntry(raw)
    expect(ref.author).toContain('Darmiyati')
    expect(ref.year).toBe('2001')
    expect(ref.title).toContain('Pendidikan Bahasa')
  })

  it('parses Indonesian entry with URL and access date', () => {
    const raw =
      'Achmad Alfianto. 2006. Pembelajaran Bahasa Indonesia di Sekolah, Metamorfosis Ulat menjadi Kepompong dalam http://re-searchengines.com/0106achmad.html - diakses tanggal 8 Oktober 2010.'
    const ref = parseReferenceEntry(raw)
    expect(ref.author).toBe('Achmad Alfianto')
    expect(ref.year).toBe('2006')
    expect(ref.url).toContain('re-searchengines.com')
  })

  it('parses IEEE-style entry with DOI', () => {
    const raw =
      "Farrel, G.E. et al. (2023) 'Scalable Edge Computing Cluster Using a Set of Raspberry Pi.' Proceedings of the 8th Conference, pp. 287-296. https://doi.org/10.1145/3626641.3626936."
    const ref = parseReferenceEntry(raw)
    expect(ref.author).toContain('Farrel')
    expect(ref.year).toBe('2023')
    expect(ref.doi).toBe('10.1145/3626641.3626936')
  })

  it('extracts DOI', () => {
    const raw =
      'Lee, K. (2019). Deep learning basics. Neural Computing, 31(2), 45-60. https://doi.org/10.1234/nc.2019.001'
    const ref = parseReferenceEntry(raw)
    expect(ref.doi).toBe('10.1234/nc.2019.001')
  })

  it('extracts DOI with doi: prefix', () => {
    const raw =
      'Lee, K. (2019). Deep learning basics. doi: 10.1234/nc.2019.001'
    const ref = parseReferenceEntry(raw)
    expect(ref.doi).toBe('10.1234/nc.2019.001')
  })

  it('extracts URL', () => {
    const raw =
      'Ministry of Education. (2021). Education report. Retrieved from https://example.com/report.pdf'
    const ref = parseReferenceEntry(raw)
    expect(ref.url).toBe('https://example.com/report.pdf')
  })

  it('handles missing year gracefully', () => {
    const raw = 'Unknown Author. Title of something without year.'
    const ref = parseReferenceEntry(raw)
    expect(ref.year).toBe('n.d.')
  })

  it('handles et al. in entry', () => {
    const raw =
      'Williams, R., Brown, T., & Davis, M. (2019). Collaborative research methods. Oxford University Press.'
    const ref = parseReferenceEntry(raw)
    expect(ref.author).toContain('Williams')
    expect(ref.year).toBe('2019')
  })
})

describe('parseReferences', () => {
  it('parses multiple APA entries from a reference section', () => {
    const pages = [
      { pageNumber: 1, content: 'BAB I Pendahuluan content here.' },
      {
        pageNumber: 50,
        content:
          'Daftar Pustaka\n\nCreswell, J. W. (2014). Research design: Qualitative, quantitative, and mixed methods approaches. Sage Publications.\n\nSugiyono. (2018). Metode penelitian kuantitatif. Alfabeta.\n\nSmith, J. A., & Johnson, B. (2020). Citation patterns. Journal of Info, 46(3), 301-315.',
      },
    ]
    const refs = parseReferences(pages)
    expect(refs.length).toBeGreaterThanOrEqual(2)
    expect(refs[0].startPage).toBe(50)
  })

  it('parses multiple Indonesian-style entries', () => {
    const pages = [
      {
        pageNumber: 80,
        content:
          'DAFTAR PUSTAKA\n\nAbdul Majid. 2007. Perencanaan pembelajaran (mengembangkan Standar Kompetensi guru). Bandung: PT Remaja Rosdakarya.\n\nAtar Semi. 1990. Menulis Efektif. Padang: CV Angkasa Raya.\n\nBadudu. 1992. Mahir berbahasa Indonesia 1 Petunjuk Guru. Klaten: CV Sahabat.',
      },
    ]
    const refs = parseReferences(pages)
    expect(refs.length).toBeGreaterThanOrEqual(2)
    const majid = refs.find((r) => r.author.includes('Majid'))
    expect(majid).toBeDefined()
    expect(majid!.year).toBe('2007')
  })

  it('returns empty array when no reference section found', () => {
    const pages = [{ pageNumber: 1, content: 'Just text, no references.' }]
    expect(parseReferences(pages)).toEqual([])
  })
})
