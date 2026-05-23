import { BookCheck, FileCheck2 } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { Badge } from '#/components/ui/badge'
import type {
  EvaluationHistoryItem,
  HistoryItem,
  TrackHistoryItem,
} from '#/services/history'
import { relativeTime } from '#/lib/history/utils'

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
  'flex items-center gap-4 rounded-xl border border-[var(--line)] bg-[var(--chip-bg)] px-4 py-3 transition-colors hover:border-primary/40 hover:bg-primary/5'

function RowInner({ item }: { item: HistoryItem }) {
  const isTrack = item.kind === 'track'
  const Icon = isTrack ? BookCheck : FileCheck2
  return (
    <>
      <div
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
          isTrack
            ? 'bg-primary/10 text-primary'
            : 'bg-accent/15 text-accent-foreground'
        }`}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-foreground">
            {item.filename}
          </span>
          <StatusBadge status={item.status} />
        </div>
        <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          <span>{isTrack ? 'Track' : 'Evaluation'}</span>
          <span>•</span>
          <span>{relativeTime(item.createdAt)}</span>
          {item.totalPages ? (
            <>
              <span>•</span>
              <span>{item.totalPages} pages</span>
            </>
          ) : null}
        </div>
        <HistoryStats item={item} />
      </div>
    </>
  )
}

function StatusBadge({ status }: { status: HistoryItem['status'] }) {
  if (status === 'done')
    return (
      <Badge className="border-accent/20 bg-accent/10 text-accent-foreground text-xs">
        Done
      </Badge>
    )
  if (status === 'failed')
    return (
      <Badge variant="destructive" className="text-xs">
        Failed
      </Badge>
    )
  return (
    <Badge variant="outline" className="text-xs">
      In progress
    </Badge>
  )
}

function HistoryStats({ item }: { item: HistoryItem }) {
  if (item.status === 'failed' && item.error) {
    return <p className="text-xs text-destructive">{item.error}</p>
  }
  if (item.status !== 'done') return null

  if (item.kind === 'track') {
    return (
      <p className="text-xs text-muted-foreground">
        {item.totalCitations} citations • {item.matchedCitations} matched •{' '}
        {item.passagesFound} passages
      </p>
    )
  }
  return (
    <p className="text-xs text-muted-foreground">
      Score {item.overallScore ?? '—'} • {item.errorCount ?? 0} issues
    </p>
  )
}
