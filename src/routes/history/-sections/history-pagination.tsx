import { Link } from '@tanstack/react-router'
import { ChevronLeft, ChevronRight } from 'lucide-react'

interface HistoryPaginationProps {
  kind: HistoryKind
  page: number
  totalPages: number
  total: number
  shown: number
}

export function HistoryPagination({
  kind,
  page,
  totalPages,
  total,
  shown,
}: HistoryPaginationProps) {
  if (total === 0) return null

  const prevDisabled = page <= 1
  const nextDisabled = page >= totalPages

  return (
    <nav
      aria-label="Pagination"
      className="mt-6 flex items-center justify-between gap-3"
    >
      <p className="text-xs text-muted-foreground">
        Showing {shown} of {total} {kind === 'track' ? 'uploads' : 'evaluations'}
      </p>
      <div className="flex items-center gap-2">
        <PageButton
          disabled={prevDisabled}
          kind={kind}
          page={page - 1}
          label="Previous page"
        >
          <ChevronLeft className="h-4 w-4" />
          <span className="hidden sm:inline">Prev</span>
        </PageButton>
        <span className="text-xs text-muted-foreground">
          Page {page} of {totalPages}
        </span>
        <PageButton
          disabled={nextDisabled}
          kind={kind}
          page={page + 1}
          label="Next page"
        >
          <span className="hidden sm:inline">Next</span>
          <ChevronRight className="h-4 w-4" />
        </PageButton>
      </div>
    </nav>
  )
}

function PageButton({
  disabled,
  kind,
  page,
  label,
  children,
}: {
  disabled: boolean
  kind: HistoryKind
  page: number
  label: string
  children: React.ReactNode
}) {
  const baseClass =
    'inline-flex h-8 items-center gap-1 rounded-md border border-[var(--line)] bg-[var(--chip-bg)] px-3 text-xs font-medium'
  if (disabled) {
    return (
      <span
        aria-disabled
        className={`${baseClass} cursor-not-allowed text-muted-foreground/50`}
      >
        {children}
      </span>
    )
  }
  return (
    <Link
      to="/history"
      search={{ kind, page }}
      aria-label={label}
      className={`${baseClass} text-foreground transition-colors hover:border-primary/40 hover:bg-primary/5`}
    >
      {children}
    </Link>
  )
}
