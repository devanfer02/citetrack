import { describe, expect, it } from 'vitest'
import {
  groupCitations,
  parseCitations,
  parseCitationsFromPages,
} from '#/services/parser/citation-parser'

describe('parseCitations', () => {
  describe('parenthetical citations', () => {
    it('matches (Author, Year)', () => {
      const text = 'Model TCP/IP terdiri dari empat lapisan (Tanenbaum, 2021).'
      const results = parseCitations(text, 1)
      expect(results).toHaveLength(1)
      expect(results[0].citationKey).toBe('Tanenbaum, 2021')
    })

    it('matches (Author & Author, Year)', () => {
      const text = 'Metode ini telah digunakan (Smith & Johnson, 2020).'
      const results = parseCitations(text, 1)
      expect(results).toHaveLength(1)
      expect(results[0].citationKey).toBe('Smith & Johnson, 2020')
    })

    it('matches (Author et al., Year)', () => {
      const text = 'Hasil penelitian menunjukkan (Williams et al., 2019).'
      const results = parseCitations(text, 1)
      expect(results).toHaveLength(1)
      expect(results[0].citationKey).toBe('Williams et al., 2019')
    })

    it('matches (Author dkk., Year) — Bahasa', () => {
      const text = 'Menurut hasil studi (Pratama dkk., 2022).'
      const results = parseCitations(text, 1)
      expect(results).toHaveLength(1)
      expect(results[0].citationKey).toBe('Pratama et al., 2022')
    })
  })

  describe('bahasa-specific patterns', () => {
    it('matches (dalam Author, Year)', () => {
      const text = 'Konsep ini dijelaskan (dalam Tanenbaum, 2021).'
      const results = parseCitations(text, 1)
      expect(results).toHaveLength(1)
      expect(results[0].citationKey).toBe('Tanenbaum, 2021')
    })

    it('matches (dikutip dari Author, Year)', () => {
      const text = 'Data tersebut (dikutip dari Rahman, 2020) menunjukkan.'
      const results = parseCitations(text, 1)
      expect(results).toHaveLength(1)
      expect(results[0].citationKey).toBe('Rahman, 2020')
    })
  })

  describe('multi-word author names', () => {
    it('matches (SoftEther VPN, 2024)', () => {
      const text = 'Teknologi ini (SoftEther VPN, 2024) memungkinkan.'
      const results = parseCitations(text, 1)
      expect(results).toHaveLength(1)
      expect(results[0].citationKey).toBe('SoftEther VPN, 2024')
    })

    it('matches Kubernetes Contributors (2023) narrative', () => {
      const text =
        'Kubernetes Contributors (2023) mencatat bahwa platform ini.'
      const results = parseCitations(text, 1)
      expect(results).toHaveLength(1)
      expect(results[0].citationKey).toBe('Kubernetes Contributors, 2023')
    })
  })

  describe('multi-citation', () => {
    it('matches (Author, Year; Author, Year)', () => {
      const text =
        'Beberapa penelitian (Smith, 2020; Johnson, 2021) menunjukkan.'
      const results = parseCitations(text, 1)
      expect(results).toHaveLength(2)
      expect(results[0].citationKey).toBe('Smith, 2020')
      expect(results[1].citationKey).toBe('Johnson, 2021')
    })

    it('matches three citations in one set of parentheses', () => {
      const text = 'Lihat (Smith, 2020; Johnson, 2021; Lee, 2019) untuk bukti.'
      const results = parseCitations(text, 1)
      expect(results).toHaveLength(3)
    })
  })

  describe('page-specific citations', () => {
    it('matches (Author, Year, p. 42)', () => {
      const text = 'Definisi tersebut (Creswell, 2014, p. 42) menyatakan.'
      const results = parseCitations(text, 1)
      expect(results).toHaveLength(1)
      expect(results[0].citationKey).toBe('Creswell, 2014')
    })

    it('matches (Author, Year, hlm. 15)', () => {
      const text = 'Sebagaimana dijelaskan (Sugiyono, 2018, hlm. 15).'
      const results = parseCitations(text, 1)
      expect(results).toHaveLength(1)
      expect(results[0].citationKey).toBe('Sugiyono, 2018')
    })
  })

  describe('narrative citations', () => {
    it('matches Author (Year)', () => {
      const text = 'Tanenbaum (2021) menyatakan bahwa model TCP/IP.'
      const results = parseCitations(text, 1)
      expect(results).toHaveLength(1)
      expect(results[0].citationKey).toBe('Tanenbaum, 2021')
    })

    it('matches Menurut Author (Year)', () => {
      const text =
        'Menurut Sugiyono (2018), metode penelitian kuantitatif.'
      const results = parseCitations(text, 1)
      expect(results).toHaveLength(1)
      expect(results[0].citationKey).toBe('Sugiyono, 2018')
    })

    it('matches Berdasarkan Author (Year)', () => {
      const text = 'Berdasarkan Creswell (2014), pendekatan mixed method.'
      const results = parseCitations(text, 1)
      expect(results).toHaveLength(1)
      expect(results[0].citationKey).toBe('Creswell, 2014')
    })

    it('matches Author et al. (Year)', () => {
      const text = 'Williams et al. (2019) found significant results.'
      const results = parseCitations(text, 1)
      expect(results).toHaveLength(1)
      expect(results[0].citationKey).toBe('Williams et al., 2019')
    })
  })

  describe('context extraction', () => {
    it('captures surrounding text', () => {
      const text =
        'Penelitian sebelumnya menunjukkan bahwa model TCP/IP terdiri dari empat lapisan (Tanenbaum, 2021). Hal ini menjadi dasar.'
      const results = parseCitations(text, 5)
      expect(results).toHaveLength(1)
      expect(results[0].thesisPage).toBe(5)
      expect(results[0].thesisContext).toContain('Tanenbaum, 2021')
      expect(results[0].thesisContext).toContain('Penelitian')
    })
  })

  describe('deduplication', () => {
    it('does not duplicate same citation at same position', () => {
      const text = 'Data (Smith, 2020) menunjukkan.'
      const results = parseCitations(text, 1)
      expect(results).toHaveLength(1)
    })
  })

  describe('title-fragment false positives', () => {
    it('rejects a long Title Case run ending in (YYYY) — title flattened by pdf.js', () => {
      // Regression from track-pipeline integration: thesis_example.pdf had
      // a table cell flattened into "Grade Students Using Android Game -
      // Based Learning Media (2023)" which the parser previously matched
      // as a narrative citation with an 8-word author. Real APA authors
      // are short; > 4 plain words with no connector ⇒ title fragment.
      const text =
        'Grade Students Using Android Game - Based Learning Media (2023) menunjukkan hasil.'
      expect(parseCitations(text, 1)).toHaveLength(0)
    })

    it('still matches a short institutional author ("Kubernetes Contributors") — positive control', () => {
      const text =
        'Kubernetes Contributors (2023) mencatat bahwa platform ini.'
      const results = parseCitations(text, 1)
      expect(results).toHaveLength(1)
      expect(results[0].citationKey).toBe('Kubernetes Contributors, 2023')
    })

    it('still matches a 3-author comma chain "Smith, Jones, & Brown (2020)" — positive control', () => {
      const text = 'Smith, Jones, & Brown (2020) reported a clear trend.'
      const results = parseCitations(text, 1)
      expect(results.length).toBeGreaterThan(0)
    })
  })

  describe('table-header false positives', () => {
    it('rejects narrative "Tahun\\n(YYYY)" from a table cell', () => {
      const text = 'Usia 5 - 6 Tahun\n(2021)\nMengembangkan media pembelajaran.'
      const results = parseCitations(text, 1)
      expect(results).toHaveLength(0)
    })

    it('rejects parenthetical "(Tahun, YYYY)" from a table row', () => {
      const text = 'Kolom berikutnya memuat (Tahun, 2020).'
      const results = parseCitations(text, 1)
      expect(results).toHaveLength(0)
    })

    it('rejects multi-word author spanning newlines (table cells)', () => {
      const text = 'Based Learning\nMedia (2023) Mengembangkan media.'
      const results = parseCitations(text, 1)
      expect(results).toHaveLength(0)
    })

    it('rejects long table-cell author chain before (Year)', () => {
      const text =
        'Aplikasi Android\nMenggunakan\nJetpack Compose\ndan Kotlin (2023) dikembangkan.'
      const results = parseCitations(text, 1)
      expect(results).toHaveLength(0)
    })
  })

  describe('bahasa narrative prefixes', () => {
    it('strips "Penelitian" prefix from narrative citation', () => {
      const text = 'Penelitian Rozi & Kristari (2020) menunjukkan hasil.'
      const results = parseCitations(text, 1)
      expect(results).toHaveLength(1)
      expect(results[0].citationKey).toBe('Rozi & Kristari, 2020')
    })

    it('strips "Studi" prefix from narrative citation', () => {
      const text = 'Studi Hakim (2023) menyatakan bahwa sistem ini.'
      const results = parseCitations(text, 1)
      expect(results).toHaveLength(1)
      expect(results[0].citationKey).toBe('Hakim, 2023')
    })
  })

  describe('line-wrap preservation', () => {
    it('still matches legit narrative wrap Author\\n(Year)', () => {
      const text =
        'Pada sisi konektivitas jaringan, Yedla\n(2023) mengevaluasi performa.'
      const results = parseCitations(text, 1)
      expect(results).toHaveLength(1)
      expect(results[0].citationKey).toBe('Yedla, 2023')
    })

    it('still matches legit parenthetical wrap (Author\\nSecond, Year)', () => {
      const text = 'Sistem ini (Kubernetes\nContributors, 2023) memungkinkan.'
      const results = parseCitations(text, 1)
      expect(results).toHaveLength(1)
      expect(results[0].citationKey).toBe('Kubernetes Contributors, 2023')
    })
  })
})

describe('parseCitationsFromPages', () => {
  it('parses citations across multiple pages', () => {
    const pages = [
      { pageNumber: 1, content: 'Menurut Smith (2020), hasil penelitian.' },
      { pageNumber: 2, content: 'Lihat juga (Johnson, 2021) untuk detail.' },
    ]
    const results = parseCitationsFromPages(pages)
    expect(results).toHaveLength(2)
    expect(results[0].thesisPage).toBe(1)
    expect(results[1].thesisPage).toBe(2)
  })
})

describe('groupCitations', () => {
  it('groups by citation key and counts occurrences', () => {
    const pages = [
      { pageNumber: 1, content: 'Menurut Smith (2020), bla bla.' },
      { pageNumber: 3, content: 'Juga dikatakan (Smith, 2020) bahwa.' },
      { pageNumber: 5, content: 'Lihat (Johnson, 2021) untuk info.' },
    ]
    const matches = parseCitationsFromPages(pages)
    const grouped = groupCitations(matches)

    const smith = grouped.find((g) => g.citationKey === 'Smith, 2020')
    expect(smith).toBeDefined()
    expect(smith!.count).toBe(2)

    const johnson = grouped.find((g) => g.citationKey === 'Johnson, 2021')
    expect(johnson).toBeDefined()
    expect(johnson!.count).toBe(1)
  })

  it('sorts by occurrence count descending', () => {
    const pages = [
      { pageNumber: 1, content: '(Smith, 2020) and (Smith, 2020) again.' },
      { pageNumber: 2, content: '(Johnson, 2021) once.' },
    ]
    const matches = parseCitationsFromPages(pages)
    const grouped = groupCitations(matches)
    expect(grouped[0].count).toBeGreaterThanOrEqual(grouped[1].count)
  })
})
