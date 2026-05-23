import {
  type PdfFindResult,
  unpaywallResponseSchema,
  semanticScholarResponseSchema,
} from '#/schemas/pdf-finder'

const UNPAYWALL_EMAIL = process.env.UNPAYWALL_EMAIL ?? 'citetrack@example.com'

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
      `https://api.unpaywall.org/v2/${encodeURIComponent(doi)}?email=${UNPAYWALL_EMAIL}`,
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
  author: string,
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

    const normalizedAuthor = author.split(',')[0].toLowerCase().trim()

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

export interface FindPdfOptions {
  doi: string | null
  title: string
  author: string
}

export async function findPdf(
  ref: FindPdfOptions,
): Promise<PdfFindResult | null> {
  // Try DOI-based resolvers first (fastest and most reliable)
  if (ref.doi) {
    const doiResult = await tryDoi(ref.doi)
    if (doiResult) return doiResult

    const unpaywallResult = await tryUnpaywall(ref.doi)
    if (unpaywallResult) return unpaywallResult
  }

  // Try Semantic Scholar (free, no key needed)
  const semanticResult = await trySemanticScholar(ref.title, ref.author)
  if (semanticResult) return semanticResult

  return null
}
