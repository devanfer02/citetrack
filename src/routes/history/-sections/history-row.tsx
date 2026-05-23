import { Link } from '@tanstack/react-router'
import type {
  EvaluationHistoryItem,
  HistoryItem,
  TrackHistoryItem,
} from '#/services/history'
import { formatDuration, relativeTime } from '#/lib/history/utils'

export function HistoryRow({ item }: { item: HistoryItem }) {
  return item.kind === 'track' ? (
    <TrackRow item={item} />
  ) : (
    <EvalRow item={item} />
  )
}

function TrackRow({ item }: { item: TrackHistoryItem }) {
  const inner = <RowInner item={item} />
  if (item.status === 'done') {
    return (
      <Link
        to="/results/$jobId"
        params={{ jobId: item.id }}
        className={rowClass}
      >
        {inner}
      </Link>
    )
  }
  return (
    <Link to="/track" search={{ jobId: item.id }} className={rowClass}>
      {inner}
    </Link>
  )
}

function EvalRow({ item }: { item: EvaluationHistoryItem }) {
  return (
    <Link
      to="/evaluation/$evalId"
      params={{ evalId: item.id }}
      className={rowClass}
    >
      <RowInner item={item} />
    </Link>
  )
}

const rowClass =
  'group relative grid grid-cols-[6rem_1fr_auto] items-baseline gap-x-5 rounded-2xl border border-[var(--line)] bg-white px-5 py-5 no-underline transition-all hover:-translate-y-0.5 hover:border-[var(--marker-yellow)] hover:bg-[var(--bg-butter)]/45 hover:shadow-[0_8px_24px_rgba(27,27,31,0.07)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-coral)]/40 hover:[&_.history-rule]:opacity-100'

const STATUS_SEVERITY: Record<
  HistoryItem['status'],
  'error' | 'warning' | 'info'
> = {
  done: 'info',
  failed: 'error',
  pending: 'warning',
  extracting: 'warning',
  analyzing: 'warning',
}

const STATUS_LABEL: Record<HistoryItem['status'], string> = {
  done: 'selesai',
  failed: 'gagal',
  pending: 'menunggu',
  extracting: 'ekstrak',
  analyzing: 'analisis',
}

function RowInner({ item }: { item: HistoryItem }) {
  const isTrack = item.kind === 'track'
  const severity = STATUS_SEVERITY[item.status] ?? 'info'
  return (
    <>
      <span
        aria-hidden
        className="history-rule marginalia-rule absolute left-[6rem] top-4 bottom-4 w-px opacity-50 transition-opacity"
        data-severity={severity}
      />
      <div className="flex flex-col items-end gap-0.5">
        <span className="kicker whitespace-nowrap tabular-nums text-foreground">
          {relativeTime(item.createdAt)}
        </span>
        <span className="kicker whitespace-nowrap text-[var(--sea-ink-soft)]/80">
          {isTrack ? 'tracer' : 'eval'}
        </span>
      </div>
      <div className="min-w-0 pl-3 sm:pl-5">
        <h3 className="display-title truncate text-lg font-extrabold leading-snug text-[var(--ink)] transition-colors group-hover:text-[var(--accent-coral-deep)] sm:text-xl">
          {item.filename}
        </h3>
        <HistoryStats item={item} />
      </div>
      <div className="flex flex-col items-end gap-1">
        <span className="inline-flex items-baseline gap-1.5">
          <span
            className="severity-dot translate-y-[1px]"
            data-severity={severity}
          />
          <span className="kicker text-foreground">
            {STATUS_LABEL[item.status]}
          </span>
        </span>
        {item.totalPages ? (
          <span className="kicker tabular-nums text-[var(--sea-ink-soft)]/80">
            {item.totalPages} hlm
          </span>
        ) : null}
        {item.durationMs !== null ? (
          <span
            className="kicker tabular-nums text-[var(--sea-ink-soft)]/80"
            title="Lama pemrosesan"
          >
            {formatDuration(item.durationMs)}
          </span>
        ) : null}
      </div>
    </>
  )
}

function HistoryStats({ item }: { item: HistoryItem }) {
  if (item.status === 'failed' && item.error) {
    return (
      <p className="mt-1 text-[0.8125rem] leading-relaxed text-[var(--destructive)]">
        {item.error}
      </p>
    )
  }
  if (item.status !== 'done') return null

  if (item.kind === 'track') {
    return (
      <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-[var(--sea-ink-soft)]">
        <span className="tabular-nums text-foreground">
          {item.totalCitations}
        </span>{' '}
        sitasi ·{' '}
        <span className="tabular-nums text-foreground">
          {item.matchedCitations}
        </span>{' '}
        cocok ·{' '}
        <span className="tabular-nums text-foreground">
          {item.passagesFound}
        </span>{' '}
        kalimat ditelusuri
      </p>
    )
  }
  return (
    <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-[var(--sea-ink-soft)]">
      Nilai{' '}
      <span className="tabular-nums text-foreground">
        {item.overallScore ?? '—'}
      </span>{' '}
      ·{' '}
      <span className="tabular-nums text-foreground">
        {item.errorCount ?? 0}
      </span>{' '}
      temuan
    </p>
  )
}
