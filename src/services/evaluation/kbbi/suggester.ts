import { db } from '#/db'
import { dictionary } from '#/db/schema'

let cachedBuckets: Map<string, string[]> | null = null

export async function loadDictBuckets(): Promise<Map<string, string[]>> {
  if (cachedBuckets) return cachedBuckets
  const rows = await db.select({ word: dictionary.word }).from(dictionary)
  const buckets = new Map<string, string[]>()
  for (const { word } of rows) {
    const w = word.toLowerCase().trim()
    if (!w) continue
    const first = w[0]
    if (!first) continue
    const bucket = buckets.get(first) ?? []
    bucket.push(w)
    buckets.set(first, bucket)
  }
  cachedBuckets = buckets
  return buckets
}

function levenshtein(a: string, b: string, cap: number): number {
  const m = a.length
  const n = b.length
  if (Math.abs(m - n) > cap) return cap + 1
  if (m === 0) return n
  if (n === 0) return m
  let prev = Array.from<number>({ length: n + 1 })
  let curr = Array.from<number>({ length: n + 1 })
  for (let j = 0; j <= n; j++) prev[j] = j
  for (let i = 1; i <= m; i++) {
    curr[0] = i
    let rowMin = curr[0]
    for (let j = 1; j <= n; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1
      const del = prev[j] + 1
      const ins = curr[j - 1] + 1
      const sub = prev[j - 1] + cost
      const v = del < ins ? (del < sub ? del : sub) : ins < sub ? ins : sub
      curr[j] = v
      if (v < rowMin) rowMin = v
    }
    if (rowMin > cap) return cap + 1
    ;[prev, curr] = [curr, prev]
  }
  return prev[n]
}

export function suggestKbbiWord(
  word: string,
  buckets: Map<string, string[]>,
): string | null {
  const w = word.toLowerCase().trim()
  if (w.length < 3 || w.length > 20) return null
  const bucket = buckets.get(w[0] ?? '')
  if (!bucket || !bucket.length) return null

  const maxDistance = w.length <= 5 ? 1 : 2
  let bestWord: string | null = null
  let bestDistance = maxDistance + 1

  for (const candidate of bucket) {
    if (Math.abs(candidate.length - w.length) > maxDistance) continue
    const d = levenshtein(w, candidate, bestDistance)
    if (d < bestDistance) {
      bestDistance = d
      bestWord = candidate
      if (d === 1) break
    }
  }

  return bestDistance <= maxDistance ? bestWord : null
}

export function kbbiUrlFor(word: string): string {
  return `https://kbbi.kemendikdasmen.go.id/entri/${encodeURIComponent(
    word.toLowerCase().trim(),
  )}`
}
