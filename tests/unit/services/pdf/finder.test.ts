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

interface FetchStub {
  ok?: boolean
  url?: string
  status?: number
  headers?: HeadersInit
  json?: () => unknown
  text?: () => string
}

function urlRouter(rules: Array<{ match: RegExp | string; response: FetchStub }>) {
  mockFetch.mockImplementation(async (url: string | URL) => {
    const href = typeof url === 'string' ? url : url.href
    for (const { match, response } of rules) {
      if (typeof match === 'string' ? href.includes(match) : match.test(href)) {
        return {
          ok: response.ok ?? true,
          url: response.url ?? href,
          status: response.status ?? 200,
          headers: new Headers(response.headers ?? {}),
          json: async () => response.json?.() ?? {},
          text: async () => response.text?.() ?? '',
        }
      }
    }
    return {
      ok: false,
      url: href,
      status: 404,
      headers: new Headers(),
      json: async () => ({}),
      text: async () => '',
    }
  })
}

describe('findPdf — DOI tier', () => {
  it('returns PDF URL when DOI directly resolves to PDF', async () => {
    urlRouter([
      {
        match: 'doi.org',
        response: {
          ok: true,
          url: 'https://publisher.com/paper.pdf',
          headers: { 'content-type': 'application/pdf' },
        },
      },
    ])

    const result = await findPdf({
      doi: '10.1234/test.2020',
      title: 'Test Paper',
      author: 'Smith',
    })

    expect(result).toEqual({
      url: 'https://publisher.com/paper.pdf',
      source: 'doi',
    })
  })

  it('picks CrossRef PDF link when DOI direct fails', async () => {
    urlRouter([
      { match: 'doi.org', response: { ok: false } },
      {
        match: 'api.crossref.org',
        response: {
          ok: true,
          json: () => ({
            message: {
              link: [
                {
                  URL: 'https://publisher.com/paper.pdf',
                  'content-type': 'application/pdf',
                },
              ],
            },
          }),
        },
      },
    ])

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

  it('picks Unpaywall when UNPAYWALL_EMAIL is set', async () => {
    const prior = process.env.UNPAYWALL_EMAIL
    process.env.UNPAYWALL_EMAIL = 'dev@example.com'
    try {
      urlRouter([
        { match: 'doi.org', response: { ok: false } },
        { match: 'api.crossref.org', response: { ok: false } },
        {
          match: 'api.unpaywall.org',
          response: {
            ok: true,
            json: () => ({
              best_oa_location: {
                url_for_pdf: 'https://oa-repo.com/paper.pdf',
                url: null,
              },
            }),
          },
        },
      ])

      const result = await findPdf({
        doi: '10.1234/test',
        title: 'Test',
        author: 'Smith',
      })

      expect(result).toEqual({
        url: 'https://oa-repo.com/paper.pdf',
        source: 'unpaywall',
      })
    } finally {
      process.env.UNPAYWALL_EMAIL = prior
    }
  })

  it('skips Unpaywall when UNPAYWALL_EMAIL is not set', async () => {
    const prior = process.env.UNPAYWALL_EMAIL
    delete process.env.UNPAYWALL_EMAIL
    try {
      urlRouter([
        { match: 'doi.org', response: { ok: false } },
        { match: 'api.crossref.org', response: { ok: false } },
      ])

      await findPdf({ doi: '10.1234/test', title: 'Test', author: 'Smith' })

      const hitUnpaywall = mockFetch.mock.calls.some((call) =>
        String(call[0]).includes('api.unpaywall.org'),
      )
      expect(hitUnpaywall).toBe(false)
    } finally {
      if (prior !== undefined) process.env.UNPAYWALL_EMAIL = prior
    }
  })
})

describe('findPdf — Europe PMC', () => {
  it('returns PDF URL from Europe PMC DOI lookup', async () => {
    urlRouter([
      { match: 'doi.org', response: { ok: false } },
      { match: 'api.crossref.org', response: { ok: false } },
      { match: 'api.openalex.org', response: { ok: false } },
      {
        match: 'europepmc',
        response: {
          ok: true,
          json: () => ({
            resultList: {
              result: [
                {
                  fullTextUrlList: {
                    fullTextUrl: [
                      {
                        url: 'https://europepmc.org/articles/PMC12345.pdf',
                        documentStyle: 'pdf',
                        availability: 'Free',
                      },
                    ],
                  },
                },
              ],
            },
          }),
        },
      },
    ])

    const result = await findPdf({
      doi: '10.1234/biomed',
      title: 'Biomedical Paper',
      author: 'Jones',
    })

    expect(result).toEqual({
      url: 'https://europepmc.org/articles/PMC12345.pdf',
      source: 'europepmc',
    })
  })
})

describe('findPdf — PubMed', () => {
  it('returns PMC PDF URL from NCBI esearch hit', async () => {
    urlRouter([
      {
        match: 'eutils.ncbi.nlm.nih.gov',
        response: {
          ok: true,
          json: () => ({ esearchresult: { idlist: ['7654321'] } }),
        },
      },
    ])

    const result = await findPdf({
      doi: null,
      title: 'A Clinical Trial',
      author: 'Nguyen',
    })

    expect(result).toEqual({
      url: 'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7654321/pdf/',
      source: 'pubmed',
    })
  })

  it('returns null when PMC esearch has no ids', async () => {
    urlRouter([
      {
        match: 'eutils.ncbi.nlm.nih.gov',
        response: {
          ok: true,
          json: () => ({ esearchresult: { idlist: [] } }),
        },
      },
    ])

    const result = await findPdf({
      doi: null,
      title: 'Unfindable Paper',
      author: 'Nobody',
    })

    expect(result).toBeNull()
  })

  it('attaches api_key when NCBI_API_KEY is set', async () => {
    const prior = process.env.NCBI_API_KEY
    process.env.NCBI_API_KEY = 'test-ncbi-key'
    try {
      urlRouter([
        {
          match: 'eutils.ncbi.nlm.nih.gov',
          response: {
            ok: true,
            json: () => ({ esearchresult: { idlist: [] } }),
          },
        },
      ])

      await findPdf({ doi: null, title: 'Test', author: 'Smith' })

      const ncbiCall = mockFetch.mock.calls.find((call) =>
        String(call[0]).includes('eutils.ncbi.nlm.nih.gov'),
      )
      expect(ncbiCall).toBeDefined()
      expect(String(ncbiCall![0])).toContain('api_key=test-ncbi-key')
    } finally {
      if (prior === undefined) delete process.env.NCBI_API_KEY
      else process.env.NCBI_API_KEY = prior
    }
  })
})

describe('findPdf — arXiv', () => {
  it('short-circuits when the DOI is an arXiv-issued DOI', async () => {
    urlRouter([
      { match: 'doi.org', response: { ok: false } },
      { match: 'api.crossref.org', response: { ok: false } },
    ])

    const result = await findPdf({
      doi: '10.48550/arXiv.2301.12345',
      title: 'Some Paper',
      author: 'Researcher',
    })

    expect(result).toEqual({
      url: 'https://arxiv.org/pdf/2301.12345.pdf',
      source: 'arxiv',
    })
  })

  it('extracts the PDF URL from arXiv Atom response via title search', async () => {
    const atom = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <id>http://arxiv.org/abs/2402.00001v1</id>
    <title>Example preprint</title>
  </entry>
</feed>`
    urlRouter([
      {
        match: 'export.arxiv.org',
        response: { ok: true, text: () => atom },
      },
    ])

    const result = await findPdf({
      doi: null,
      title: 'Example preprint',
      author: 'Author',
    })

    expect(result).toEqual({
      url: 'https://arxiv.org/pdf/2402.00001v1.pdf',
      source: 'arxiv',
    })
  })
})

describe('findPdf — CORE (opt-in)', () => {
  it('returns download URL when CORE_API_KEY is set', async () => {
    const prior = process.env.CORE_API_KEY
    process.env.CORE_API_KEY = 'test-core-key'
    try {
      urlRouter([
        {
          match: 'api.core.ac.uk',
          response: {
            ok: true,
            json: () => ({
              results: [
                {
                  title: 'Scalable Edge Computing Cluster',
                  downloadUrl: 'https://core.ac.uk/download/pdf/12345.pdf',
                  sourceFulltextUrls: [],
                },
              ],
            }),
          },
        },
      ])

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
      if (prior === undefined) delete process.env.CORE_API_KEY
      else process.env.CORE_API_KEY = prior
    }
  })

  it('skips CORE when CORE_API_KEY is not set', async () => {
    const prior = process.env.CORE_API_KEY
    delete process.env.CORE_API_KEY
    try {
      urlRouter([])

      await findPdf({ doi: null, title: 'Test Paper', author: 'Smith' })

      const hitCore = mockFetch.mock.calls.some((call) =>
        String(call[0]).includes('api.core.ac.uk'),
      )
      expect(hitCore).toBe(false)
    } finally {
      if (prior !== undefined) process.env.CORE_API_KEY = prior
    }
  })
})

describe('findPdf — Semantic Scholar', () => {
  it('attaches x-api-key header when SEMANTIC_SCHOLAR_API_KEY is set', async () => {
    const prior = process.env.SEMANTIC_SCHOLAR_API_KEY
    process.env.SEMANTIC_SCHOLAR_API_KEY = 'test-s2-key'
    try {
      urlRouter([
        {
          match: 'api.semanticscholar.org',
          response: { ok: true, json: () => ({ data: [] }) },
        },
      ])

      await findPdf({ doi: null, title: 'Test', author: 'Smith' })

      const s2Call = mockFetch.mock.calls.find((call) =>
        String(call[0]).includes('api.semanticscholar.org'),
      )
      expect(s2Call).toBeDefined()
      const init = s2Call![1] as RequestInit
      const headers = new Headers(init.headers)
      expect(headers.get('x-api-key')).toBe('test-s2-key')
    } finally {
      if (prior === undefined) delete process.env.SEMANTIC_SCHOLAR_API_KEY
      else process.env.SEMANTIC_SCHOLAR_API_KEY = prior
    }
  })
})

describe('findPdf — OpenAlex landing_page_url is not a PDF', () => {
  it('returns pdf_url when present', async () => {
    urlRouter([
      {
        match: 'api.openalex.org/works?search',
        response: {
          ok: true,
          json: () => ({
            results: [
              {
                primary_location: {
                  pdf_url: 'https://repo.example.com/paper.pdf',
                  landing_page_url: 'https://publisher.example.com/article/123',
                },
                open_access: { oa_url: null },
              },
            ],
          }),
        },
      },
    ])

    const result = await findPdf({
      doi: null,
      title: 'A paper that has a real PDF URL',
      author: 'Smith',
    })

    expect(result).toEqual({
      url: 'https://repo.example.com/paper.pdf',
      source: 'openalex',
    })
  })

  it('falls back to oa_url when pdf_url is absent', async () => {
    urlRouter([
      {
        match: 'api.openalex.org/works?search',
        response: {
          ok: true,
          json: () => ({
            results: [
              {
                primary_location: {
                  pdf_url: null,
                  landing_page_url: 'https://publisher.example.com/article/123',
                },
                open_access: { oa_url: 'https://oa.example.com/paper.pdf' },
              },
            ],
          }),
        },
      },
    ])

    const result = await findPdf({
      doi: null,
      title: 'A paper with oa_url but no pdf_url',
      author: 'Smith',
    })

    expect(result).toEqual({
      url: 'https://oa.example.com/paper.pdf',
      source: 'openalex',
    })
  })

  it('returns null when only landing_page_url is available (the bug we are fixing)', async () => {
    urlRouter([
      {
        match: 'api.openalex.org/works?search',
        response: {
          ok: true,
          json: () => ({
            results: [
              {
                primary_location: {
                  pdf_url: null,
                  landing_page_url: 'https://doi.org/10.1234/landing.only',
                },
                open_access: { oa_url: null },
              },
            ],
          }),
        },
      },
    ])

    const result = await findPdf({
      doi: null,
      title: 'A paper with only a landing page',
      author: 'Smith',
    })

    expect(result).toBeNull()
  })
})

describe('findPdf — waterfall', () => {
  it('returns null when every source fails', async () => {
    urlRouter([])
    const result = await findPdf({
      doi: '10.1234/test',
      title: 'Test',
      author: 'Smith',
    })
    expect(result).toBeNull()
  })

  it('tolerates network errors without throwing', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'))
    const result = await findPdf({
      doi: '10.1234/test',
      title: 'Test',
      author: 'Smith',
    })
    expect(result).toBeNull()
  })
})
