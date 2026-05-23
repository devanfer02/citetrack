const CATEGORIES = new Set(['kbbi', 'eyd', 'filkom'])
const SEVERITIES = new Set(['error', 'warning', 'info'])

export interface ParsedFilter {
  categories: Set<EvaluationCategory>
  severities: Set<EvaluationFinding['severity']>
  query: string
}

export function parseEvaluationFilter(raw: string): ParsedFilter {
  const categories = new Set<EvaluationCategory>()
  const severities = new Set<EvaluationFinding['severity']>()
  const queryParts: string[] = []

  for (const token of raw.trim().split(/\s+/).filter(Boolean)) {
    const tagMatch = /^tag:(.+)$/i.exec(token)
    if (tagMatch) {
      const v = tagMatch[1].toLowerCase()
      if (CATEGORIES.has(v)) categories.add(v as EvaluationCategory)
      continue
    }
    const typeMatch = /^type:(.+)$/i.exec(token)
    if (typeMatch) {
      const v = typeMatch[1].toLowerCase()
      if (SEVERITIES.has(v)) {
        severities.add(v as EvaluationFinding['severity'])
      }
      continue
    }
    queryParts.push(token)
  }

  return {
    categories,
    severities,
    query: queryParts.join(' ').toLowerCase(),
  }
}

export function categoryMatchesFilter(
  category: EvaluationCategory,
  filter: ParsedFilter,
): boolean {
  if (filter.categories.size === 0) return true
  return filter.categories.has(category)
}
