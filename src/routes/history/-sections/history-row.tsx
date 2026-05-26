import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { AlertTriangle, Check, Copy } from 'lucide-react'
import {
  Arrow,
  DottedArc,
  Sparkles,
  Squiggle,
  StarBurst,
} from '#/components/doodles'
import type {
  EvaluationHistoryItem,
  HistoryItem,
  TrackHistoryItem,
} from '#/services/history'
import { formatDuration, relativeTime } from '#/lib/history/utils'

export function HistoryRow({
  item,
  selectable = false,
  selected = false,
  onToggleSelect,
}: {
  item: HistoryItem
  selectable?: boolean
  selected?: boolean
  onToggleSelect?: (id: string) => void
}) {
  return item.kind === 'track' ? (
    <TrackRow item={item} />
  ) : (
    <EvalRow
      item={item}
      selectable={selectable}
      selected={selected}
      onToggleSelect={onToggleSelect}
    />
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

function EvalRow({
  item,
  selectable,
  selected,
  onToggleSelect,
}: {
  item: EvaluationHistoryItem
  selectable?: boolean
  selected?: boolean
  onToggleSelect?: (id: string) => void
}) {
  const link = (
    <Link
      to="/evaluation/$evalId"
      params={{ evalId: item.id }}
      className={rowClass}
    >
      <RowInner item={item} />
    </Link>
  )
  if (!selectable || item.status !== 'done') {
    return (
      <div className="flex items-stretch gap-3">
        {selectable && <span aria-hidden className="w-6 shrink-0" />}
        <div className="min-w-0 flex-1">{link}</div>
      </div>
    )
  }
  return (
    <div className="flex items-stretch gap-3">
      <label className="flex shrink-0 cursor-pointer items-center">
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggleSelect?.(item.id)}
          className="h-5 w-5 cursor-pointer accent-[var(--accent-coral)]"
          aria-label={`Pilih ${item.filename} untuk dibandingkan`}
        />
      </label>
      <div className="min-w-0 flex-1">{link}</div>
    </div>
  )
}

const rowClass =
  'group relative flex flex-col gap-3 rounded-2xl border border-[var(--ink)]/85 bg-[color-mix(in_oklab,var(--bg-butter)_55%,#ffffff)] px-6 py-4 no-underline shadow-[5px_5px_0_0_var(--ink)] transition-all hover:-translate-x-0.5 hover:-translate-y-0.5 hover:border-[var(--ink)] hover:bg-[var(--bg-butter)] hover:shadow-[7px_7px_0_0_var(--ink)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-[2px_2px_0_0_var(--ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-coral)]/40'

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
  done: 'Selesai',
  failed: 'Gagal',
  pending: 'Menunggu',
  extracting: 'Ekstrak',
  analyzing: 'Analisis',
}

function RowInner({ item }: { item: HistoryItem }) {
  const severity = STATUS_SEVERITY[item.status] ?? 'info'
  const isFailed = item.status === 'failed' && !!item.error
  return (
    <>
      <div className="flex w-full items-center gap-4">
        <div className="min-w-0 flex-shrink-0 max-w-[22rem]">
          <h3 className="display-title truncate text-[1.0625rem] font-extrabold leading-snug text-[var(--ink)] transition-colors group-hover:text-[var(--accent-coral-deep)] sm:text-[1.125rem]">
            {item.filename}
          </h3>
          <p className="mt-0.5 whitespace-nowrap text-[0.8125rem] text-[var(--ink-soft)]">
            {relativeTime(item.createdAt)}
          </p>
        </div>

        <DoodleSpacer id={item.id} />

        {!isFailed && (
          <div className="hidden shrink-0 items-baseline gap-1.5 text-[0.8125rem] text-[var(--ink-soft)] md:flex">
            <HistoryStatsInline item={item} />
          </div>
        )}

        <div className="shrink-0">
          <span className="inline-flex items-baseline gap-1.5 whitespace-nowrap">
            <span
              className="severity-dot translate-y-[1px]"
              data-severity={severity}
            />
            <span className="text-[0.875rem] font-medium text-foreground">
              {STATUS_LABEL[item.status]}
            </span>
          </span>
        </div>
      </div>

      {isFailed && <ErrorBox message={item.error!} />}
    </>
  )
}

const STAT_SEP = (
  <span aria-hidden className="text-[var(--ink-faint)]">
    •
  </span>
)

function HistoryStatsInline({ item }: { item: HistoryItem }) {
  const pages =
    item.totalPages !== null && item.totalPages !== undefined
      ? `${item.totalPages} HLM`
      : null
  const duration =
    item.durationMs !== null && item.durationMs !== undefined
      ? formatDuration(item.durationMs).toUpperCase()
      : null

  const parts: Array<{ key: string; node: React.ReactNode }> = []

  if (item.status === 'done') {
    if (item.kind === 'track') {
      parts.push({
        key: 'sitasi',
        node: (
          <Stat>
            <Num>{item.totalCitations}</Num> sitasi
          </Stat>
        ),
      })
      parts.push({
        key: 'cocok',
        node: (
          <Stat>
            <Num>{item.matchedCitations}</Num> cocok
          </Stat>
        ),
      })
      parts.push({
        key: 'kalimat',
        node: (
          <Stat>
            <Num>{item.passagesFound}</Num> kalimat ditelusuri
          </Stat>
        ),
      })
    } else {
      parts.push({
        key: 'temuan',
        node: (
          <Stat>
            <Num>{item.errorCount ?? 0}</Num> temuan
          </Stat>
        ),
      })
    }
  }
  if (pages) parts.push({ key: 'pages', node: <Stat>{pages}</Stat> })
  if (duration) parts.push({ key: 'dur', node: <Stat>{duration}</Stat> })

  if (parts.length === 0) return null

  return (
    <>
      {parts.map((p, i) => (
        <span key={p.key} className="inline-flex items-baseline gap-1.5">
          {i > 0 && STAT_SEP}
          {p.node}
        </span>
      ))}
    </>
  )
}

function Stat({ children }: { children: React.ReactNode }) {
  return <span className="whitespace-nowrap">{children}</span>
}

function Num({ children }: { children: React.ReactNode }) {
  return (
    <span className="tabular-nums font-medium text-foreground">
      {children}
    </span>
  )
}

const DOODLE_VARIANTS = [
  ['squiggle', 'sparkles'],
  ['squiggle', 'dottedArc'],
  ['sparkles', 'arrow'],
  ['squiggle', 'starBurst'],
] as const

function hashId(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0
  return Math.abs(h)
}

function DoodleSpacer({ id }: { id: string }) {
  const variant = DOODLE_VARIANTS[hashId(id) % DOODLE_VARIANTS.length]
  return (
    <div
      aria-hidden
      className="pointer-events-none hidden min-w-0 flex-1 items-center justify-center gap-10 opacity-70 lg:flex"
    >
      {variant.map((kind, i) => (
        <Doodle key={kind} kind={kind} index={i} />
      ))}
    </div>
  )
}

function Doodle({
  kind,
  index,
}: {
  kind: (typeof DOODLE_VARIANTS)[number][number]
  index: number
}) {
  const tone = index === 0 ? 'coral' : 'indigo'
  switch (kind) {
    case 'squiggle':
      return <Squiggle tone={tone} size={36} />
    case 'sparkles':
      return <Sparkles tone={tone} size={16} />
    case 'dottedArc':
      return <DottedArc tone={tone} size={28} />
    case 'arrow':
      return <Arrow tone={tone} size={22} className="-rotate-[12deg]" />
    case 'starBurst':
      return <StarBurst tone={tone} size={14} />
    default:
      return null
  }
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
      .catch(() => {})
  }

  return (
    <div
      className="flex items-start gap-2 rounded-xl border border-[var(--accent-coral)]/45 bg-[color-mix(in_oklab,var(--bg-blush)_65%,#ffffff)] px-3 py-2 text-[0.8125rem] leading-relaxed text-[var(--ink)]"
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
          <Check
            className="h-3.5 w-3.5 text-[var(--accent-coral-deep)]"
            strokeWidth={2}
          />
        ) : (
          <Copy className="h-3.5 w-3.5" strokeWidth={1.75} />
        )}
      </button>
    </div>
  )
}
