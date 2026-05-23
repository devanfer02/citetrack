import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { findPdf } from '#/services/pdf/finder'

const mockFetch = vi.fn()
const originalFetch = globalThis.fetch

beforeEach(() => {
  globalThis.fetch = mockFetch as typeof fetch
})

afterEach(() => {
  mockFetch.mockReset()
  globalThis.fetch = originalFetch
})

const FAIL_RESPONSE = { ok: false, headers: new Headers() }
const EMPTY_UNPAYWALL = {
  ok: true,
  json: async () => ({ best_oa_location: null }),
}
const EMPTY_CROSSREF = { ok: false }
const EMPTY_OPENALEX = { ok: false }
const EMPTY_SEMANTIC = {
  ok: true,
  json: async () => ({ data: [] }),
}
const EMPTY_OPENALEX_SEARCH = {
  ok: true,
  json: async () => ({ results: [] }),
}

function failDoiTier() {
  mockFetch.mockResolvedValueOnce(FAIL_RESPONSE)
  mockFetch.mockResolvedValueOnce(EMPTY_UNPAYWALL)
  mockFetch.mockResolvedValueOnce(EMPTY_CROSSREF)
  mockFetch.mockResolvedValueOnce(EMPTY_OPENALEX)
}

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
      mockFetch.mockResolvedValueOnce({
        ok: true,
        url: 'https://publisher.com/abstract',
        headers: new Headers({ 'content-type': 'text/html' }),
      })
      mockFetch.mockResolvedValueOnce(EMPTY_UNPAYWALL)
      mockFetch.mockResolvedValueOnce(EMPTY_CROSSREF)
      mockFetch.mockResolvedValueOnce(EMPTY_OPENALEX)
      mockFetch.mockResolvedValueOnce(EMPTY_SEMANTIC)
      mockFetch.mockResolvedValueOnce(EMPTY_OPENALEX_SEARCH)

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
      mockFetch.mockResolvedValueOnce(FAIL_RESPONSE)
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

  describe('CrossRef', () => {
    it('returns PDF URL from CrossRef link array', async () => {
      mockFetch.mockResolvedValueOnce(FAIL_RESPONSE)
      mockFetch.mockResolvedValueOnce(EMPTY_UNPAYWALL)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          message: {
            link: [
              {
                URL: 'https://publisher.com/paper.pdf',
                'content-type': 'application/pdf',
              },
            ],
          },
        }),
      })

      const result = await findPdf({
        doi: '10.1234/test',
        title: 'Test Paper',
        author: 'Smith',
      })

      expect(result).toEqual({
        url: 'https://publisher.com/paper.pdf',
        source: 'crossref',
      })
    })

    it('falls back to primary resource URL', async () => {
      mockFetch.mockResolvedValueOnce(FAIL_RESPONSE)
      mockFetch.mockResolvedValueOnce(EMPTY_UNPAYWALL)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          message: {
            link: [],
            resource: { primary: { URL: 'https://publisher.com/landing' } },
          },
        }),
      })

      const result = await findPdf({
        doi: '10.1234/test',
        title: 'Test Paper',
        author: 'Smith',
      })

      expect(result).toEqual({
        url: 'https://publisher.com/landing',
        source: 'crossref',
      })
    })
  })

  describe('OpenAlex', () => {
    it('returns OA URL from OpenAlex DOI lookup', async () => {
      mockFetch.mockResolvedValueOnce(FAIL_RESPONSE)
      mockFetch.mockResolvedValueOnce(EMPTY_UNPAYWALL)
      mockFetch.mockResolvedValueOnce(EMPTY_CROSSREF)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          open_access: {
            is_oa: true,
            oa_url: 'https://repo.com/paper.pdf',
          },
          primary_location: { pdf_url: null, landing_page_url: null },
        }),
      })

      const result = await findPdf({
        doi: '10.1234/test',
        title: 'Test Paper',
        author: 'Smith',
      })

      expect(result).toEqual({
        url: 'https://repo.com/paper.pdf',
        source: 'openalex',
      })
    })

    it('returns OA URL from OpenAlex title search when no DOI', async () => {
      mockFetch.mockResolvedValueOnce(EMPTY_SEMANTIC)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [
            {
              open_access: {
                is_oa: true,
                oa_url: 'https://repo.com/paper.pdf',
              },
              primary_location: null,
            },
          ],
        }),
      })

      const result = await findPdf({
        doi: null,
        title: 'Test Paper',
        author: 'Smith',
      })

      expect(result).toEqual({
        url: 'https://repo.com/paper.pdf',
        source: 'openalex',
      })
    })
  })

  describe('CORE', () => {
    it('returns download URL from CORE title search', async () => {
      const origKey = process.env.CORE_API_KEY
      process.env.CORE_API_KEY = 'test-key'

      try {
        mockFetch.mockResolvedValueOnce(EMPTY_SEMANTIC)
        mockFetch.mockResolvedValueOnce(EMPTY_OPENALEX_SEARCH)
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            results: [
              {
                title: 'Scalable Edge Computing Cluster',
                downloadUrl: 'https://core.ac.uk/download/pdf/12345.pdf',
                sourceFulltextUrls: [],
              },
            ],
          }),
        })

        const result = await findPdf({
          doi: null,
          title: 'Scalable Edge Computing',
          author: 'Farrel',
        })

        expect(result).toEqual({
          url: 'https://core.ac.uk/download/pdf/12345.pdf',
          source: 'core',
        })
      } finally {
        process.env.CORE_API_KEY = origKey
      }
    })

    it('skips CORE when API key is not set', async () => {
      mockFetch.mockResolvedValueOnce(EMPTY_SEMANTIC)
      mockFetch.mockResolvedValueOnce(EMPTY_OPENALEX_SEARCH)

      const result = await findPdf({
        doi: null,
        title: 'Test Paper',
        author: 'Smith',
      })

      expect(result).toBeNull()
      expect(mockFetch).toHaveBeenCalledTimes(2)
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
              openAccessPdf: {
                url: 'https://arxiv.org/pdf/2020.12345.pdf',
              },
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
      mockFetch.mockResolvedValueOnce(EMPTY_OPENALEX_SEARCH)

      const result = await findPdf({
        doi: null,
        title: 'Test Paper',
        author: 'Smith',
      })

      expect(result).toBeNull()
    })
  })

  describe('waterfall order', () => {
    it('exhausts DOI tier then title tier', async () => {
      failDoiTier()
      mockFetch.mockResolvedValueOnce(EMPTY_SEMANTIC)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [
            {
              open_access: {
                is_oa: true,
                oa_url: 'https://repo.com/found.pdf',
              },
              primary_location: null,
            },
          ],
        }),
      })

      const result = await findPdf({
        doi: '10.1234/test',
        title: 'Research Design',
        author: 'Creswell',
      })

      expect(result?.source).toBe('openalex')
      expect(mockFetch).toHaveBeenCalledTimes(6)
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
