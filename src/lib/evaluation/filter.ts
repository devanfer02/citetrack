import type { VocabClassification } from '#/services/evaluation/vocabulary'

export interface ParsedFilter {
  categories: Set<EvaluationCategory>
  severities: Set<EvaluationFinding['severity']>
  query: string
  includeResolved: boolean
  excludedPages: Set<number>
}

export function parseExcludedPages(input: string): Set<number> {
  const pages = new Set<number>()
  for (const rawToken of input.split(',')) {
    const token = rawToken.trim()
    if (!token) continue
    const range = /^(\d+)\s*-\s*(\d+)$/.exec(token)
    if (range) {
      const a = Number(range[1])
      const b = Number(range[2])
      const lo = Math.min(a, b)
      const hi = Math.max(a, b)
      for (let p = lo; p <= hi; p++) pages.add(p)
      continue
    }
    if (/^\d+$/.test(token)) {
      const n = Number(token)
      if (n > 0) pages.add(n)
    }
  }
  return pages
}

export function categoryMatchesFilter(
  category: EvaluationCategory,
  filter: ParsedFilter,
): boolean {
  if (filter.categories.size === 0) return true
  return filter.categories.has(category)
}

const TOKEN_MESSAGE_RE = /^Kata "([^"]+)"|^Istilah (?:teknis|asing) "([^"]+)"/

export function isClassifiableRule(ruleId: string | null): boolean {
  return !!ruleId && ruleId.startsWith('kbbi.unknown-word')
}

export function tokenFromFinding(f: EvaluationFinding): string | null {
  if (!isClassifiableRule(f.ruleId)) return null
  const match = TOKEN_MESSAGE_RE.exec(f.message)
  return match ? (match[1] ?? match[2] ?? '').toLowerCase() : null
}

export function filterFindings(
  findings: EvaluationFinding[],
  filter: ParsedFilter,
  vocabMap?: Map<string, VocabClassification>,
): EvaluationFinding[] {
  const useVocab = vocabMap && vocabMap.size > 0
  return findings.filter((f) => {
    if (filter.categories.size > 0 && !filter.categories.has(f.category)) {
      return false
    }
    if (!filter.includeResolved && f.resolvedAt !== null) return false
    if (filter.severities.size > 0 && !filter.severities.has(f.severity)) {
      return false
    }
    if (filter.excludedPages.size > 0 && filter.excludedPages.has(f.pageNumber)) {
      return false
    }
    if (filter.query) {
      const q = filter.query
      const hit =
        f.message.toLowerCase().includes(q) ||
        (f.excerpt?.toLowerCase().includes(q) ?? false) ||
        (f.ruleId?.toLowerCase().includes(q) ?? false)
      if (!hit) return false
    }
    if (useVocab) {
      const token = tokenFromFinding(f)
      if (token && vocabMap.has(token)) return false
    }
    return true
  })
}
