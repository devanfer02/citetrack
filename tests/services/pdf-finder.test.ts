import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { findPdf } from '#/services/pdf-finder'

const mockFetch = vi.fn()
const originalFetch = globalThis.fetch

beforeEach(() => {
  globalThis.fetch = mockFetch as typeof fetch
})

afterEach(() => {
  mockFetch.mockReset()
  globalThis.fetch = originalFetch
})

describe('findPdf', () => {
  describe('DOI resolver', () => {
    it('returns PDF URL when DOI resolves to PDF', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        url: 'https://publisher.com/paper.pdf',
        headers: new Headers({ 'content-type': 'application/pdf' }),
      })

      const result = await findPdf({
        doi: '10.1234/test.2020',
        title: 'Test Paper',
        author: 'Smith',
      })

      expect(result).toEqual({
        url: 'https://publisher.com/paper.pdf',
        source: 'doi',
      })
      expect(mockFetch).toHaveBeenCalledWith(
        'https://doi.org/10.1234/test.2020',
        expect.objectContaining({ redirect: 'follow' }),
      )
    })

    it('falls through when DOI does not resolve to PDF', async () => {
      // DOI returns HTML
      mockFetch.mockResolvedValueOnce({
        ok: true,
        url: 'https://publisher.com/abstract',
        headers: new Headers({ 'content-type': 'text/html' }),
      })
      // Unpaywall returns nothing
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ best_oa_location: null }),
      })
      // Semantic Scholar returns nothing
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [] }),
      })

      const result = await findPdf({
        doi: '10.1234/test.2020',
        title: 'Test Paper',
        author: 'Smith',
      })

      expect(result).toBeNull()
    })
  })

  describe('Unpaywall', () => {
    it('returns PDF URL from Unpaywall when DOI direct fails', async () => {
      // DOI fails
      mockFetch.mockResolvedValueOnce({
        ok: false,
        headers: new Headers(),
      })
      // Unpaywall succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          best_oa_location: {
            url_for_pdf: 'https://oa-repo.com/paper.pdf',
            url: 'https://oa-repo.com/paper',
          },
        }),
      })

      const result = await findPdf({
        doi: '10.1234/test.2020',
        title: 'Test Paper',
        author: 'Smith',
      })

      expect(result).toEqual({
        url: 'https://oa-repo.com/paper.pdf',
        source: 'unpaywall',
      })
    })
  })

  describe('Semantic Scholar', () => {
    it('returns PDF URL from Semantic Scholar when no DOI', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            {
              paperId: 'abc123',
              title: 'Test Paper on Something',
              isOpenAccess: true,
              openAccessPdf: { url: 'https://arxiv.org/pdf/2020.12345.pdf' },
            },
          ],
        }),
      })

      const result = await findPdf({
        doi: null,
        title: 'Test Paper on Something',
        author: 'Smith',
      })

      expect(result).toEqual({
        url: 'https://arxiv.org/pdf/2020.12345.pdf',
        source: 'semantic-scholar',
      })
    })

    it('returns null when Semantic Scholar has no open access PDF', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            {
              paperId: 'abc123',
              title: 'Test Paper',
              isOpenAccess: false,
              openAccessPdf: null,
            },
          ],
        }),
      })

      const result = await findPdf({
        doi: null,
        title: 'Test Paper',
        author: 'Smith',
      })

      expect(result).toBeNull()
    })
  })

  describe('waterfall order', () => {
    it('tries DOI first, then Unpaywall, then Semantic Scholar', async () => {
      // DOI fails
      mockFetch.mockResolvedValueOnce({
        ok: false,
        headers: new Headers(),
      })
      // Unpaywall fails
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ best_oa_location: null }),
      })
      // Semantic Scholar succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            {
              paperId: 'x',
              title: 'Research Design Approaches',
              openAccessPdf: { url: 'https://ss.com/paper.pdf' },
            },
          ],
        }),
      })

      const result = await findPdf({
        doi: '10.1234/test',
        title: 'Research Design Approaches',
        author: 'Creswell',
      })

      expect(result?.source).toBe('semantic-scholar')
      expect(mockFetch).toHaveBeenCalledTimes(3)
    })
  })

  describe('all fail', () => {
    it('returns null when all sources fail', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'))

      const result = await findPdf({
        doi: '10.1234/test',
        title: 'Test',
        author: 'Smith',
      })

      expect(result).toBeNull()
    })
  })
})
