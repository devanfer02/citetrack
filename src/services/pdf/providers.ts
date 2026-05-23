import { createServerFn } from '@tanstack/react-start'
import { env } from '#/env'

export interface SourceProviderStatus {
  name: string
  enabled: boolean
  envVar: string | null
  // When the env var only enhances (better rate limit) rather than
  // unlocks the provider entirely.
  enhancement?: boolean
  note?: string
}

export const getSourceProviderStatus = createServerFn({ method: 'GET' })
  .handler(async (): Promise<SourceProviderStatus[]> => {
    const hasNcbi = !!env.NCBI_API_KEY
    const hasSemantic = !!env.SEMANTIC_SCHOLAR_API_KEY
    return [
      {
        name: 'CrossRef',
        enabled: true,
        envVar: null,
        note: 'DOI lookup',
      },
      {
        name: 'OpenAlex',
        enabled: true,
        envVar: null,
        note: 'DOI + title',
      },
      {
        name: 'Europe PMC',
        enabled: true,
        envVar: null,
      },
      {
        name: 'PubMed / NCBI',
        enabled: true,
        envVar: 'NCBI_API_KEY',
        enhancement: true,
        note: hasNcbi
          ? 'with API key'
          : 'rate-limited; add NCBI_API_KEY for higher limits',
      },
      {
        name: 'arXiv',
        enabled: true,
        envVar: null,
      },
      {
        name: 'Semantic Scholar',
        enabled: true,
        envVar: 'SEMANTIC_SCHOLAR_API_KEY',
        enhancement: true,
        note: hasSemantic
          ? 'with API key'
          : 'rate-limited; add SEMANTIC_SCHOLAR_API_KEY for higher limits',
      },
      {
        name: 'Unpaywall',
        enabled: !!env.UNPAYWALL_EMAIL,
        envVar: 'UNPAYWALL_EMAIL',
      },
      {
        name: 'CORE',
        enabled: !!env.CORE_API_KEY,
        envVar: 'CORE_API_KEY',
      },
    ]
  })
