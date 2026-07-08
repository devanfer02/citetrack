import { describe, expect, it } from 'vitest'
import {
  extractKeywords,
  preFilterPages,
  scorePageRelevance,
} from '#/services/matcher/passage-prefilter'

const samplePages: SourcePage[] = [
  { pageNumber: 1, content: 'Introduction to computer networks and protocols.' },
  {
    pageNumber: 42,
    content:
      'The TCP/IP model consists of four layers: application, transport, internet, and network access. Tanenbaum described this architecture in 2021.',
  },
  {
    pageNumber: 43,
    content:
      'OSI model has seven layers compared to the four-layer TCP/IP approach. Various protocols operate at different levels.',
  },
  { pageNumber: 100, content: 'References and bibliography section here.' },
]

describe('extractKeywords', () => {
  it('extracts proper nouns', () => {
    const kw = extractKeywords(
      'Menurut Tanenbaum (2021), model TCP/IP terdiri dari empat lapisan.',
    )
    expect(kw).toContain('tanenbaum')
    expect(kw).toContain('menurut')
  })

  it('extracts numbers', () => {
    const kw = extractKeywords('Data dari tahun 2021 menunjukkan 45% peningkatan.')
    expect(kw).toContain('2021')
    expect(kw.some((k) => k.includes('45'))).toBe(true)
  })

  it('extracts acronyms', () => {
    const kw = extractKeywords('Protokol TCP dan HTTP digunakan secara luas.')
    expect(kw).toContain('tcp')
    expect(kw).toContain('http')
  })

  it('deduplicates keywords', () => {
    const kw = extractKeywords('Smith and Smith wrote about Smith methodology.')
    const smithCount = kw.filter((k) => k === 'smith').length
    expect(smithCount).toBe(1)
  })

  it('returns empty for text with no keywords', () => {
    const kw = extractKeywords('ini adalah teks sederhana tanpa kata kunci.')
    expect(kw.length).toBeLessThanOrEqual(2)
  })
})

describe('scorePageRelevance', () => {
  it('scores higher for pages with more keyword matches', () => {
    const keywords = ['tanenbaum', 'tcp', '2021']
    const score42 = scorePageRelevance(keywords, samplePages[1].content)
    const score1 = scorePageRelevance(keywords, samplePages[0].content)
    expect(score42).toBeGreaterThan(score1)
  })

  it('returns 0 for pages with no matches', () => {
    const keywords = ['quantum', 'physics', 'einstein']
    const score = scorePageRelevance(keywords, samplePages[0].content)
    expect(score).toBe(0)
  })

  it('returns 0 for empty keywords', () => {
    expect(scorePageRelevance([], 'any content')).toBe(0)
  })
})

describe('preFilterPages', () => {
  it('returns top pages sorted by relevance', () => {
    const filtered = preFilterPages(
      'Menurut Tanenbaum (2021), model TCP/IP terdiri dari empat lapisan.',
      samplePages,
      3,
    )
    expect(filtered.length).toBeLessThanOrEqual(3)
    expect(filtered[0].pageNumber).toBe(42)
  })

  it('returns first N pages when no keywords match', () => {
    const filtered = preFilterPages(
      'ini teks tanpa kata kunci yang relevan sama sekali.',
      samplePages,
      2,
    )
    expect(filtered.length).toBe(2)
  })

  it('respects maxPages limit', () => {
    const filtered = preFilterPages(
      'TCP networks Tanenbaum 2021',
      samplePages,
      1,
    )
    expect(filtered.length).toBe(1)
  })

  it('handles empty source pages', () => {
    const filtered = preFilterPages('some context', [], 5)
    expect(filtered).toEqual([])
  })
})
