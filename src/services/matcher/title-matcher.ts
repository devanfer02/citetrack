const ACCEPT_THRESHOLD = 0.35

export interface TitleCandidate {
  referenceId: number
  author: string
  year: string
  title: string
}

export interface TitlePairResult {
  referenceId: number | null
  confidence: number
}

const normalize = (s: string): string =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const tokenize = (s: string): string[] =>
  normalize(s).split(' ').filter((t) => t.length >= 3)

const shingles = (tokens: string[], n: number): Set<string> => {
  const out = new Set<string>()
  if (tokens.length < n) {
    if (tokens.length > 0) out.add(tokens.join(' '))
    return out
  }
  for (let i = 0; i <= tokens.length - n; i++) {
    out.add(tokens.slice(i, i + n).join(' '))
  }
  return out
}

const jaccard = (a: Set<string>, b: Set<string>): number => {
  if (a.size === 0 || b.size === 0) return 0
  let intersect = 0
  for (const x of a) if (b.has(x)) intersect++
  const union = a.size + b.size - intersect
  return union === 0 ? 0 : intersect / union
}

const lastNameOf = (author: string): string => {
  const parts = normalize(author).split(' ').filter(Boolean)
  return parts[parts.length - 1] ?? ''
}

const scoreCandidate = (
  queryNorm: string,
  queryTokens: string[],
  candidate: TitleCandidate,
): number => {
  const titleNorm = normalize(candidate.title)
  if (titleNorm && queryNorm.includes(titleNorm)) return 0.95

  const candidateTokens = tokenize(
    `${candidate.author} ${candidate.year} ${candidate.title}`,
  )

  const overlap = (() => {
    if (candidateTokens.length === 0) return 0
    let hits = 0
    const querySet = new Set(queryTokens)
    for (const t of candidateTokens) if (querySet.has(t)) hits++
    return hits / candidateTokens.length
  })()

  const q2 = shingles(queryTokens, 2)
  const c2 = shingles(candidateTokens, 2)
  const jac = jaccard(q2, c2)

  const lastName = lastNameOf(candidate.author)
  const authorHit = lastName && queryTokens.includes(lastName) ? 1 : 0
  const yearHit = candidate.year && queryTokens.includes(candidate.year) ? 1 : 0
  const authorYearBonus = (authorHit + yearHit) * 0.25

  return Math.min(1, overlap * 0.5 + jac * 0.3 + authorYearBonus)
}

export function pickBestReference(
  pdfTitle: string,
  pdfFirstPage: string,
  candidates: TitleCandidate[],
): TitlePairResult {
  if (candidates.length === 0) return { referenceId: null, confidence: 0 }

  const queryText = [pdfTitle, pdfFirstPage.slice(0, 500)]
    .filter(Boolean)
    .join(' ')
    .trim()
  if (!queryText) return { referenceId: null, confidence: 0 }

  const queryNorm = normalize(queryText)
  const queryTokens = tokenize(queryText)
  if (queryTokens.length === 0) return { referenceId: null, confidence: 0 }

  let bestId: number | null = null
  let bestScore = 0
  for (const c of candidates) {
    const s = scoreCandidate(queryNorm, queryTokens, c)
    if (s > bestScore) {
      bestScore = s
      bestId = c.referenceId
    }
  }

  if (bestScore < ACCEPT_THRESHOLD) {
    return { referenceId: null, confidence: bestScore }
  }
  return { referenceId: bestId, confidence: bestScore }
}
