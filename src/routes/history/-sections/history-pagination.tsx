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
      aria-label="Navigasi halaman"
      className="mt-10 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-3 border-t border-[var(--line)] pt-5"
    >
      <p className="kicker text-[var(--sea-ink-soft)]">
        <span className="tabular-nums text-foreground">{shown}</span>{' '}
        <span>dari</span>{' '}
        <span className="tabular-nums text-foreground">{total}</span>{' '}
        {kind === 'track' ? 'pelacakan' : 'pemeriksaan'}
      </p>
      <div className="flex items-baseline gap-x-5">
        <PageLink
          disabled={prevDisabled}
          kind={kind}
          page={page - 1}
          label="Halaman sebelumnya"
          dir="prev"
        >
          <ChevronLeft
            className="h-3.5 w-3.5"
            strokeWidth={1.75}
            aria-hidden="true"
          />
          <span className="hidden sm:inline">Sebelumnya</span>
        </PageLink>
        <span className="kicker tabular-nums text-[var(--sea-ink-soft)]/80">
          hlm {page} / {totalPages}
        </span>
        <PageLink
          disabled={nextDisabled}
          kind={kind}
          page={page + 1}
          label="Halaman berikutnya"
          dir="next"
        >
          <span className="hidden sm:inline">Berikutnya</span>
          <ChevronRight
            className="h-3.5 w-3.5"
            strokeWidth={1.75}
            aria-hidden="true"
          />
        </PageLink>
      </div>
    </nav>
  )
}

function PageLink({
  disabled,
  kind,
  page,
  label,
  dir,
  children,
}: {
  disabled: boolean
  kind: HistoryKind
  page: number
  label: string
  dir: 'prev' | 'next'
  children: React.ReactNode
}) {
  if (disabled) {
    return (
      <span
        aria-disabled="true"
        aria-label={`${label} (tidak tersedia)`}
        className="kicker inline-flex cursor-not-allowed items-baseline gap-1 text-[var(--sea-ink-soft)]/40"
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
      rel={dir}
      className="kicker inline-flex items-baseline gap-1 text-[var(--sea-ink-soft)] transition-colors hover:text-[var(--lagoon-deep)]"
    >
      {children}
    </Link>
  )
}
