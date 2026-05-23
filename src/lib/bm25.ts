const K1 = 1.2
const B = 0.75

const STOPWORDS = new Set([
  'the', 'a', 'an', 'of', 'and', 'or', 'to', 'in', 'on', 'at', 'by', 'for',
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'that', 'this', 'these',
  'those', 'it', 'as', 'with', 'from', 'but', 'not', 'no',
  'yang', 'dan', 'atau', 'di', 'ke', 'dari', 'pada', 'untuk', 'dengan',
  'ini', 'itu', 'adalah', 'ialah', 'akan', 'sudah', 'telah', 'juga', 'bahwa',
])

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t))
}

export interface Bm25Index {
  docs: string[][]
  docLengths: number[]
  avgDocLength: number
  idf: Map<string, number>
}

export function buildIndex(docs: string[]): Bm25Index {
  const tokenized = docs.map(tokenize)
  const docLengths = tokenized.map((d) => d.length)
  const totalLength = docLengths.reduce((sum, n) => sum + n, 0)
  const avgDocLength = tokenized.length > 0 ? totalLength / tokenized.length : 0

  const df = new Map<string, number>()
  for (const doc of tokenized) {
    const seen = new Set<string>()
    for (const term of doc) {
      if (seen.has(term)) continue
      seen.add(term)
      df.set(term, (df.get(term) ?? 0) + 1)
    }
  }

  const idf = new Map<string, number>()
  const N = tokenized.length
  for (const [term, freq] of df) {
    idf.set(term, Math.log(1 + (N - freq + 0.5) / (freq + 0.5)))
  }

  return { docs: tokenized, docLengths, avgDocLength, idf }
}

export function score(
  index: Bm25Index,
  docIdx: number,
  queryTokens: string[],
): number {
  const doc = index.docs[docIdx]
  if (!doc || doc.length === 0) return 0

  const tf = new Map<string, number>()
  for (const term of doc) tf.set(term, (tf.get(term) ?? 0) + 1)

  const docLen = index.docLengths[docIdx]
  const avg = index.avgDocLength || 1

  let sum = 0
  for (const term of queryTokens) {
    const f = tf.get(term) ?? 0
    if (f === 0) continue
    const idf = index.idf.get(term) ?? 0
    const numerator = f * (K1 + 1)
    const denominator = f + K1 * (1 - B + (B * docLen) / avg)
    sum += idf * (numerator / denominator)
  }
  return sum
}

export function rank(
  index: Bm25Index,
  query: string,
): Array<{ docIdx: number; score: number }> {
  const queryTokens = tokenize(query)
  const results: Array<{ docIdx: number; score: number }> = []
  for (let i = 0; i < index.docs.length; i++) {
    const s = score(index, i, queryTokens)
    if (s > 0) results.push({ docIdx: i, score: s })
  }
  return results.toSorted((a, b) => b.score - a.score)
}
