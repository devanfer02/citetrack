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

  it('returns empty array when no reference section found', () => {
    const pages = [{ pageNumber: 1, content: 'Just text, no references.' }]
    expect(parseReferences(pages)).toEqual([])
  })
})
