export interface ParsedFilter {
  categories: Set<EvaluationCategory>
  severities: Set<EvaluationFinding['severity']>
  query: string
}

export function categoryMatchesFilter(
  category: EvaluationCategory,
  filter: ParsedFilter,
): boolean {
  if (filter.categories.size === 0) return true
  return filter.categories.has(category)
}
