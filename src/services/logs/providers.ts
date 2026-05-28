export const API_PROVIDERS = [
  'openalex',
  'crossref',
  'unpaywall',
  'semantic-scholar',
  'europepmc',
  'pubmed',
  'arxiv',
  'core',
  'doi',
  'kbbi',
  'pdf-download',
] as const

export type ApiProvider = (typeof API_PROVIDERS)[number]

export type ApiCallOutcome =
  | 'success'
  | 'http_error'
  | 'network_error'
  | 'timeout'
  | 'aborted'
