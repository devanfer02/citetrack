// Non-LLM fuzzy matcher for the settings search box. Tokenizes a free-text
// query ("bagaimana cara ubah ukuran unggah"), drops bilingual filler words,
// and scores each setting by how many query tokens appear in its searchable
// text (code + label + description + keywords + group). Pure and synchronous
// so it can run on every keystroke and be unit-tested in isolation.

const STOPWORDS = new Set<string>([
  // Indonesian fillers / question words
  'bagaimana',
  'gimana',
  'gmn',
  'cara',
  'caranya',
  'mau',
  'ingin',
  'pengen',
  'untuk',
  'supaya',
  'biar',
  'agar',
  'yang',
  'dengan',
  'dari',
  'saya',
  'aku',
  'kita',
  'tolong',
  'mohon',
  'apa',
  'itu',
  'ini',
  'bisa',
  'dong',
  'nya',
  'dan',
  'atau',
  'setelan',
  'pengaturan',
  // English fillers / question words
  'how',
  'do',
  'to',
  'the',
  'an',
  'can',
  'my',
  'want',
  'where',
  'is',
  'of',
  'for',
  'in',
  'on',
  'it',
  'please',
  'setting',
  'settings',
  'option',
  'config',
])

export function tokenizeQuery(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 2)
}

// Drop stopwords, but if the query was *only* stopwords (e.g. "how do i")
// fall back to the raw tokens so the user still gets something to match on.
export function meaningfulTokens(query: string): string[] {
  const all = tokenizeQuery(query)
  const kept = all.filter((token) => !STOPWORDS.has(token))
  return kept.length > 0 ? kept : all
}

function scoreTokens(tokens: readonly string[], haystack: string): number {
  const hay = haystack.toLowerCase()
  let score = 0
  for (const token of tokens) {
    if (hay.includes(token)) score += 1
  }
  return score
}

export function scoreMatch(query: string, haystack: string): number {
  const tokens = meaningfulTokens(query)
  if (tokens.length === 0) return 0
  return scoreTokens(tokens, haystack)
}

// Returns the items whose haystack matches at least one query token, ordered
// by descending score. Array.sort is stable, so ties keep their input order
// (which is the canonical settings order grouped by tab).
export function rankByQuery<T>(
  query: string,
  items: readonly T[],
  getHaystack: (item: T) => string,
): T[] {
  const tokens = meaningfulTokens(query)
  if (tokens.length === 0) return []
  return items
    .map((item) => ({ item, score: scoreTokens(tokens, getHaystack(item)) }))
    .filter((ranked) => ranked.score > 0)
    .toSorted((a, b) => b.score - a.score)
    .map((ranked) => ranked.item)
}
