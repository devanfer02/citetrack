import { Input } from '#/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select'
import type {
  TagFilter,
  TypeFilter,
} from '../-hooks/use-evaluation-filters'

export interface EvaluationFiltersProps {
  tagFilter: TagFilter
  onTagFilterChange: (next: TagFilter) => void
  typeFilter: TypeFilter
  onTypeFilterChange: (next: TypeFilter) => void
  query: string
  onQueryChange: (next: string) => void
}

export function EvaluationFilters({
  tagFilter,
  onTagFilterChange,
  typeFilter,
  onTypeFilterChange,
  query,
  onQueryChange,
}: EvaluationFiltersProps) {
  return (
    <div className="mb-6 flex flex-wrap items-center gap-x-5 gap-y-3">
      <span className="kicker">Filter</span>
      <Select
        value={tagFilter}
        onValueChange={(v) => onTagFilterChange(v as TagFilter)}
      >
        <SelectTrigger
          size="sm"
          className="h-8 w-[8.5rem] border-0 border-b border-[var(--line)] bg-transparent text-sm shadow-none hover:border-[var(--sea-ink-soft)] focus-visible:border-[var(--lagoon-deep)] focus-visible:ring-0"
          aria-label="Filter by tag"
        >
          <SelectValue placeholder="Tag" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Semua tag</SelectItem>
          <SelectItem value="kbbi">KBBI</SelectItem>
          <SelectItem value="eyd">EYD</SelectItem>
        </SelectContent>
      </Select>
      <Select
        value={typeFilter}
        onValueChange={(v) => onTypeFilterChange(v as TypeFilter)}
      >
        <SelectTrigger
          size="sm"
          className="h-8 w-[9.5rem] border-0 border-b border-[var(--line)] bg-transparent text-sm shadow-none hover:border-[var(--sea-ink-soft)] focus-visible:border-[var(--lagoon-deep)] focus-visible:ring-0"
          aria-label="Filter by type"
        >
          <SelectValue placeholder="Tingkat" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Semua tingkat</SelectItem>
          <SelectItem value="error">Error</SelectItem>
          <SelectItem value="warning">Peringatan</SelectItem>
          <SelectItem value="info">Info</SelectItem>
        </SelectContent>
      </Select>
      <Input
        placeholder="Cari kata atau aturan…"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        className="h-8 max-w-xs rounded-none border-0 border-b border-[var(--line)] bg-transparent px-0 text-sm shadow-none focus-visible:border-[var(--lagoon-deep)] focus-visible:ring-0"
      />
    </div>
  )
}
