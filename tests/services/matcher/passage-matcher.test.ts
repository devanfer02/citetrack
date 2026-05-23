import { describe, expect, it } from 'vitest'
import { matchPassage } from '#/services/matcher/passage-matcher'

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
  it('returns an exact-branch match when an 8-word n-gram hits verbatim', () => {
    const r = matchPassage({
      citationKey: 'Tanenbaum2021',
      thesisContext:
        'The TCP/IP model consists of four distinct layers: application transport.',
      sourcePages: pages,
    })
    expect(r).not.toBeNull()
    expect(r?.sourcePage).toBe(7)
    expect(r?.confidence).toBeGreaterThanOrEqual(0.9)
  })

  it('falls back to BM25 when no exact n-gram hits but vocabulary overlaps', () => {
    const r = matchPassage({
      citationKey: 'Tanenbaum2021',
      thesisContext:
        'application layer transport layer internet layer network access layer',
      sourcePages: pages,
    })
    expect(r).not.toBeNull()
    expect(r?.sourcePage).toBe(7)
  })

  it('returns null when no source page is relevant', () => {
    const r = matchPassage({
      citationKey: 'Banana',
      thesisContext: 'sourdough starter hydration ratios for rye bread',
      sourcePages: pages,
    })
    expect(r).toBeNull()
  })

  it('returns null on empty source pages', () => {
    const r = matchPassage({
      citationKey: 'X',
      thesisContext: 'anything',
      sourcePages: [],
    })
    expect(r).toBeNull()
  })
})
