import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { AlertTriangle, Check, Copy } from 'lucide-react'
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
    return <ErrorBox message={item.error} />
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
      <span className="tabular-nums text-foreground">
        {item.errorCount ?? 0}
      </span>{' '}
      temuan
    </p>
  )
}

function ErrorBox({ message }: { message: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault()
    e.stopPropagation()
    void navigator.clipboard
      .writeText(message)
      .then(() => {
        setCopied(true)
        window.setTimeout(() => setCopied(false), 1500)
      })
      .catch(() => {
        // clipboard may be unavailable (insecure context); silently skip
      })
  }

  return (
    <div
      className="mt-2 flex items-start gap-2 rounded-xl border border-[var(--accent-coral)]/45 bg-[color-mix(in_oklab,var(--bg-blush)_65%,#ffffff)] px-3 py-2 text-[0.8125rem] leading-relaxed text-[var(--ink)]"
      title={message}
    >
      <AlertTriangle
        className="mt-[0.1875rem] h-3.5 w-3.5 shrink-0 text-[var(--accent-coral-deep)]"
        strokeWidth={1.75}
      />
      <span className="line-clamp-3 flex-1 break-words font-mono text-[0.75rem] leading-[1.55]">
        {message}
      </span>
      <button
        type="button"
        aria-label={copied ? 'Tersalin' : 'Salin pesan error'}
        onClick={handleCopy}
        className="ml-1 inline-flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-[var(--ink-soft)] transition-colors hover:bg-[var(--accent-coral)]/15 hover:text-[var(--accent-coral-deep)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-coral)]/40"
      >
        {copied ? (
          <Check className="h-3.5 w-3.5 text-[var(--accent-coral-deep)]" strokeWidth={2} />
        ) : (
          <Copy className="h-3.5 w-3.5" strokeWidth={1.75} />
        )}
      </button>
    </div>
  )
}
