import type { z } from 'zod'
import {
  unpaywallResponseSchema,
  semanticScholarResponseSchema,
  crossRefResponseSchema,
  openAlexWorkSchema,
  openAlexSearchSchema,
  coreSearchSchema,
} from '#/schemas/pdf-finder'
import { env } from '#/env'

async function tryDoi(doi: string): Promise<PdfFindResult | null> {
  try {
    const res = await fetch(`https://doi.org/${doi}`, {
      redirect: 'follow',
      headers: { Accept: 'application/pdf' },
      signal: AbortSignal.timeout(10000),
    })

    if (
      res.ok &&
      res.headers.get('content-type')?.includes('application/pdf')
    ) {
      return { url: res.url, source: 'doi' }
    }

    return null
  } catch {
    return null
  }
}

async function tryUnpaywall(doi: string): Promise<PdfFindResult | null> {
  try {
    const res = await fetch(
      `https://api.unpaywall.org/v2/${encodeURIComponent(doi)}?email=${env.UNPAYWALL_EMAIL ?? 'citetrack@example.com'}`,
      { signal: AbortSignal.timeout(10000) },
    )

    if (!res.ok) return null

    const parsed = unpaywallResponseSchema.safeParse(await res.json())
    if (!parsed.success) return null

    const loc = parsed.data.best_oa_location
    const pdfUrl = loc?.url_for_pdf ?? loc?.url
    if (!pdfUrl) return null

    return { url: pdfUrl, source: 'unpaywall' }
  } catch {
    return null
  }
}

async function trySemanticScholar(
  title: string,
  _author: string,
): Promise<PdfFindResult | null> {
  try {
    const query = encodeURIComponent(title)
    const res = await fetch(
      `https://api.semanticscholar.org/graph/v1/paper/search?query=${query}&limit=3&fields=title,isOpenAccess,openAccessPdf`,
      { signal: AbortSignal.timeout(10000) },
    )

    if (!res.ok) return null

    const parsed = semanticScholarResponseSchema.safeParse(await res.json())
    if (!parsed.success) return null

    for (const paper of parsed.data.data) {
      const titleMatch =
        paper.title.toLowerCase().includes(title.toLowerCase().slice(0, 30))
      if (!titleMatch) continue

      if (paper.openAccessPdf?.url) {
        return { url: paper.openAccessPdf.url, source: 'semantic-scholar' }
      }
    }

    // Fallback: return first open access result even without strict title match
    const openAccess = parsed.data.data.find((p) => p.openAccessPdf?.url)
    if (openAccess?.openAccessPdf?.url) {
      return { url: openAccess.openAccessPdf.url, source: 'semantic-scholar' }
    }

    return null
  } catch {
    return null
  }
}


async function tryCrossRef(doi: string): Promise<PdfFindResult | null> {
  try {
    const res = await fetch(
      `https://api.crossref.org/works/${encodeURIComponent(doi)}`,
      {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(10000),
      },
    )
    if (!res.ok) return null

    const parsed = crossRefResponseSchema.safeParse(await res.json())
    if (!parsed.success) return null

    const pdfLink = parsed.data.message.link.find((l) =>
      l['content-type']?.includes('application/pdf'),
    )
    if (pdfLink) return { url: pdfLink.URL, source: 'crossref' }

    const primary = parsed.data.message.resource?.primary?.URL
    if (primary) return { url: primary, source: 'crossref' }

    return null
  } catch {
    return null
  }
}

function extractOpenAlexUrl(
  data: z.infer<typeof openAlexWorkSchema>,
): string | null {
  return (
    data.primary_location?.pdf_url ??
    data.open_access?.oa_url ??
    data.primary_location?.landing_page_url ??
    null
  )
}

async function tryOpenAlexDoi(doi: string): Promise<PdfFindResult | null> {
  try {
    const res = await fetch(
      `https://api.openalex.org/works/doi:${encodeURIComponent(doi)}`,
      {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(10000),
      },
    )
    if (!res.ok) return null

    const parsed = openAlexWorkSchema.safeParse(await res.json())
    if (!parsed.success) return null

    const url = extractOpenAlexUrl(parsed.data)
    return url ? { url, source: 'openalex' } : null
  } catch {
    return null
  }
}

async function tryOpenAlexTitle(title: string): Promise<PdfFindResult | null> {
  try {
    const res = await fetch(
      `https://api.openalex.org/works?search=${encodeURIComponent(title)}&per_page=3`,
      {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(10000),
      },
    )
    if (!res.ok) return null

    const parsed = openAlexSearchSchema.safeParse(await res.json())
    if (!parsed.success) return null

    for (const work of parsed.data.results) {
      const url = extractOpenAlexUrl(work)
      if (url) return { url, source: 'openalex' }
    }

    return null
  } catch {
    return null
  }
}

async function tryCoreAc(title: string): Promise<PdfFindResult | null> {
  const apiKey = env.CORE_API_KEY
  if (!apiKey) return null

  try {
    const res = await fetch(
      `https://api.core.ac.uk/v3/search/works?q=${encodeURIComponent(title)}&limit=3`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(10000),
      },
    )
    if (!res.ok) return null

    const parsed = coreSearchSchema.safeParse(await res.json())
    if (!parsed.success) return null

    for (const work of parsed.data.results) {
      const titleMatch = work.title
        ?.toLowerCase()
        .includes(title.toLowerCase().slice(0, 30))
      if (!titleMatch) continue

      const url = work.downloadUrl ?? work.sourceFulltextUrls[0]
      if (url) return { url, source: 'core' }
    }

    return null
  } catch {
    return null
  }
}

export async function findPdf(
  ref: FindPdfOptions,
): Promise<PdfFindResult | null> {
  // Tier 1: DOI-based resolvers (fastest, most reliable)
  if (ref.doi) {
    const doiResult = await tryDoi(ref.doi)
    if (doiResult) return doiResult

    const unpaywallResult = await tryUnpaywall(ref.doi)
    if (unpaywallResult) return unpaywallResult

    const crossRefResult = await tryCrossRef(ref.doi)
    if (crossRefResult) return crossRefResult

    const openAlexDoiResult = await tryOpenAlexDoi(ref.doi)
    if (openAlexDoiResult) return openAlexDoiResult
  }

  // Tier 2: Title-based search
  const semanticResult = await trySemanticScholar(ref.title, ref.author)
  if (semanticResult) return semanticResult

  const openAlexTitleResult = await tryOpenAlexTitle(ref.title)
  if (openAlexTitleResult) return openAlexTitleResult

  const coreResult = await tryCoreAc(ref.title)
  if (coreResult) return coreResult

  return null
}
