import { Check, Undo2 } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '#/components/ui/alert-dialog'
import { Button } from '#/components/ui/button'
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
  excludedPagesInput: string
  onExcludedPagesChange: (next: string) => void
  hiddenByPageCount: number
  includeResolved: boolean
  onIncludeResolvedChange: (next: boolean) => void
  resolvedCount: number
  visibleUnresolvedCount: number
  visibleResolvedCount: number
  onBulkResolve: () => void
  onBulkRestore: () => void
  bulkPending: boolean
}

export function EvaluationFilters({
  tagFilter,
  onTagFilterChange,
  typeFilter,
  onTypeFilterChange,
  query,
  onQueryChange,
  excludedPagesInput,
  onExcludedPagesChange,
  hiddenByPageCount,
  includeResolved,
  onIncludeResolvedChange,
  resolvedCount,
  visibleUnresolvedCount,
  visibleResolvedCount,
  onBulkResolve,
  onBulkRestore,
  bulkPending,
}: EvaluationFiltersProps) {
  return (
    <div className="mb-6 flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
      <span className="kicker">Filter</span>
      <Select
        value={tagFilter}
        onValueChange={(v) => onTagFilterChange(v as TagFilter)}
      >
        <SelectTrigger
          size="sm"
          className="h-8 w-[8.5rem] border-0 border-b border-[var(--line)] bg-transparent text-sm shadow-none hover:border-[var(--sea-ink-soft)] focus-visible:border-[var(--lagoon-deep)] focus-visible:ring-0"
          aria-label="Saring berdasarkan tag"
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
          aria-label="Saring berdasarkan tingkat"
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
        aria-label="Cari kata atau aturan"
        className="h-8 max-w-xs rounded-none border-0 border-b border-[var(--line)] bg-transparent px-0 text-sm shadow-none focus-visible:border-[var(--lagoon-deep)] focus-visible:ring-0"
      />
      <div className="flex items-center gap-2">
        <label
          htmlFor="excluded-pages"
          className="kicker whitespace-nowrap text-[var(--sea-ink-soft)]"
        >
          Kecualikan halaman
        </label>
        <Input
          id="excluded-pages"
          inputMode="numeric"
          placeholder="mis. 7, 10-12"
          value={excludedPagesInput}
          onChange={(e) => onExcludedPagesChange(e.target.value)}
          aria-label="Kecualikan halaman dari hasil"
          className="h-8 w-[8rem] rounded-none border-0 border-b border-[var(--line)] bg-transparent px-0 text-sm shadow-none focus-visible:border-[var(--lagoon-deep)] focus-visible:ring-0"
        />
        {excludedPagesInput.trim() !== '' && (
          <>
            <span className="text-[0.8125rem] tabular-nums text-[var(--ink-soft)]">
              menyembunyikan {hiddenByPageCount} temuan
            </span>
            <button
              type="button"
              onClick={() => onExcludedPagesChange('')}
              className="kicker text-[var(--sea-ink-soft)] underline-offset-2 hover:text-foreground hover:underline"
            >
              Hapus
            </button>
          </>
        )}
      </div>
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {visibleUnresolvedCount} temuan belum selesai
        {includeResolved && visibleResolvedCount > 0
          ? `, ${visibleResolvedCount} sudah selesai`
          : ''}
        .
      </span>
      {resolvedCount > 0 && (
        <label
          className={`kicker ml-auto inline-flex cursor-pointer items-baseline gap-2 border-b pb-1 transition-colors ${
            includeResolved
              ? 'border-[var(--sea-ink)] text-foreground'
              : 'border-transparent text-[var(--sea-ink-soft)] hover:text-foreground'
          }`}
        >
          <input
            type="checkbox"
            checked={includeResolved}
            onChange={(e) => onIncludeResolvedChange(e.target.checked)}
            aria-label="Sertakan temuan yang sudah selesai"
            className="h-3 w-3 translate-y-[2px] accent-[var(--accent-coral)]"
          />
          Sertakan yang sudah selesai
          <span className="tabular-nums text-[var(--ink-faint)]">
            ({resolvedCount})
          </span>
        </label>
      )}
      </div>
      {(visibleUnresolvedCount > 0 ||
        (includeResolved && visibleResolvedCount > 0)) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[0.8125rem] text-[var(--ink-soft)]">
          <span className="kicker">Sekaligus</span>
          {visibleUnresolvedCount > 0 && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={bulkPending}
                >
                  <Check className="h-3.5 w-3.5" strokeWidth={2} />
                  Tandai selesai semua yang difilter
                  <span className="kicker tabular-nums text-[var(--ink-faint)]">
                    ({visibleUnresolvedCount})
                  </span>
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    Tandai {visibleUnresolvedCount} temuan sebagai selesai?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    Yang ditandai selesai akan disembunyikan dari daftar, tapi
                    tidak dihapus. Hanya berlaku untuk {visibleUnresolvedCount}{' '}
                    temuan yang cocok dengan filter saat ini. Kamu masih bisa
                    memunculkannya kembali lewat{' '}
                    <span className="font-medium text-[var(--ink)]">
                      Sertakan yang sudah selesai
                    </span>{' '}
                    di atas.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel asChild>
                    <Button type="button" variant="ghost" size="sm">
                      Batal
                    </Button>
                  </AlertDialogCancel>
                  <AlertDialogAction asChild>
                    <Button
                      type="button"
                      variant="default"
                      size="sm"
                      onClick={onBulkResolve}
                    >
                      <Check className="h-3.5 w-3.5" strokeWidth={2} />
                      Tandai selesai
                    </Button>
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          {includeResolved && visibleResolvedCount > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onBulkRestore}
              disabled={bulkPending}
            >
              <Undo2 className="h-3.5 w-3.5" strokeWidth={2} />
              Pulihkan semua yang ditampilkan
              <span className="kicker tabular-nums text-[var(--ink-faint)]">
                ({visibleResolvedCount})
              </span>
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
