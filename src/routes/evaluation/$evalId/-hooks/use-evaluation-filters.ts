import { useMemo, useState } from 'react'
import { useDebouncedValue } from '#/hooks/use-debounced-value'
import { parseExcludedPages, type ParsedFilter } from '#/lib/evaluation/filter'

export type TagFilter = EvaluationCategory | 'all'
export type TypeFilter = EvaluationFinding['severity'] | 'all'

export interface UseEvaluationFiltersResult {
  tagFilter: TagFilter
  setTagFilter: (next: TagFilter) => void
  typeFilter: TypeFilter
  setTypeFilter: (next: TypeFilter) => void
  query: string
  setQuery: (next: string) => void
  includeResolved: boolean
  setIncludeResolved: (next: boolean) => void
  excludedPagesInput: string
  setExcludedPagesInput: (next: string) => void
  parsedFilter: ParsedFilter
}

export function useEvaluationFilters(): UseEvaluationFiltersResult {
  const [tagFilter, setTagFilter] = useState<TagFilter>('all')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [query, setQuery] = useState('')
  const [includeResolved, setIncludeResolved] = useState(false)
  const [excludedPagesInput, setExcludedPagesInput] = useState('')
  const debouncedQuery = useDebouncedValue(query, 200)
  const debouncedExcludedPages = useDebouncedValue(excludedPagesInput, 200)

  const parsedFilter = useMemo<ParsedFilter>(
    () => ({
      categories:
        tagFilter === 'all'
          ? new Set<EvaluationCategory>()
          : new Set<EvaluationCategory>([tagFilter]),
      severities:
        typeFilter === 'all'
          ? new Set<EvaluationFinding['severity']>()
          : new Set<EvaluationFinding['severity']>([typeFilter]),
      query: debouncedQuery.trim().toLowerCase(),
      includeResolved,
      excludedPages: parseExcludedPages(debouncedExcludedPages),
    }),
    [tagFilter, typeFilter, debouncedQuery, includeResolved, debouncedExcludedPages],
  )

  return {
    tagFilter,
    setTagFilter,
    typeFilter,
    setTypeFilter,
    query,
    setQuery,
    includeResolved,
    setIncludeResolved,
    excludedPagesInput,
    setExcludedPagesInput,
    parsedFilter,
  }
}
