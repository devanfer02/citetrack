import { describe, expect, it } from 'vitest'
import { matchCitations } from '#/services/citation-matcher'

const refs = [
  { id: 1, author: 'Creswell, J. W.', year: '2014', title: 'Research Design' },
  {
    id: 2,
    author: 'Smith, J. A., & Johnson, B.',
    year: '2020',
    title: 'Citation Patterns',
  },
  {
    id: 3,
    author: 'Williams, R., Brown, T., & Davis, M.',
    year: '2019',
    title: 'Collaborative Research',
  },
  { id: 4, author: 'Sugiyono', year: '2018', title: 'Metode Penelitian' },
  {
    id: 5,
    author: 'Tanenbaum, A. S.',
    year: '2021',
    title: 'Computer Networks',
  },
]

describe('matchCitations', () => {
  describe('exact matching', () => {
    it('matches single author by surname + year', () => {
      const result = matchCitations(['Creswell, 2014'], refs)
      expect(result.matches).toHaveLength(1)
      expect(result.matches[0].referenceId).toBe(1)
      expect(result.matches[0].matchType).toBe('exact')
      expect(result.matches[0].confidence).toBe(1)
    })

    it('matches single-name author (no first name)', () => {
      const result = matchCitations(['Sugiyono, 2018'], refs)
      expect(result.matches).toHaveLength(1)
      expect(result.matches[0].referenceId).toBe(4)
      expect(result.matches[0].matchType).toBe('exact')
    })

    it('matches first author of multi-author reference', () => {
      const result = matchCitations(['Smith, 2020'], refs)
      expect(result.matches).toHaveLength(1)
      expect(result.matches[0].referenceId).toBe(2)
    })
  })

  describe('et al. handling', () => {
    it('matches et al. to multi-author reference', () => {
      const result = matchCitations(['Williams et al., 2019'], refs)
      expect(result.matches).toHaveLength(1)
      expect(result.matches[0].referenceId).toBe(3)
      expect(result.matches[0].confidence).toBeGreaterThanOrEqual(0.9)
    })
  })

  describe('fuzzy matching', () => {
    it('matches with minor typo (Tannenbaum vs Tanenbaum)', () => {
      const result = matchCitations(['Tannenbaum, 2021'], refs)
      expect(result.matches).toHaveLength(1)
      expect(result.matches[0].referenceId).toBe(5)
      expect(result.matches[0].matchType).toBe('fuzzy')
      expect(result.matches[0].confidence).toBeGreaterThan(0.5)
    })
  })

  describe('unmatched citations', () => {
    it('flags citation with no matching reference as unmatched', () => {
      const result = matchCitations(['Unknown, 2099'], refs)
      expect(result.matches).toHaveLength(1)
      expect(result.matches[0].matchType).toBe('unmatched')
      expect(result.matches[0].referenceId).toBeNull()
      expect(result.matches[0].confidence).toBe(0)
    })

    it('flags citation with matching author but wrong year', () => {
      const result = matchCitations(['Creswell, 2020'], refs)
      expect(result.matches[0].matchType).toBe('unmatched')
    })
  })

  describe('orphan and unused detection', () => {
    it('detects orphan citations', () => {
      const result = matchCitations(
        ['Creswell, 2014', 'Nobody, 2099'],
        refs,
      )
      expect(result.orphanCitations).toEqual(['Nobody, 2099'])
    })

    it('detects unused references', () => {
      const result = matchCitations(['Creswell, 2014'], refs)
      expect(result.unusedReferences.map((r) => r.id)).toContain(2)
      expect(result.unusedReferences.map((r) => r.id)).toContain(3)
      expect(result.unusedReferences.map((r) => r.id)).toContain(4)
      expect(result.unusedReferences.map((r) => r.id)).toContain(5)
      expect(result.unusedReferences.map((r) => r.id)).not.toContain(1)
    })
  })

  describe('deduplication', () => {
    it('deduplicates identical citation keys', () => {
      const result = matchCitations(
        ['Creswell, 2014', 'Creswell, 2014'],
        refs,
      )
      expect(result.matches).toHaveLength(1)
    })
  })

  describe('multiple citations', () => {
    it('matches all citations correctly', () => {
      const result = matchCitations(
        ['Creswell, 2014', 'Smith, 2020', 'Williams et al., 2019'],
        refs,
      )
      expect(result.matches).toHaveLength(3)
      expect(result.orphanCitations).toHaveLength(0)
      const matchedIds = result.matches.map((m) => m.referenceId)
      expect(matchedIds).toContain(1)
      expect(matchedIds).toContain(2)
      expect(matchedIds).toContain(3)
    })
  })
})
