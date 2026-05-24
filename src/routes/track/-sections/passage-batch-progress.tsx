import { useEffect, useState } from 'react'
import { AlertTriangle, Check, FileText, Loader2 } from 'lucide-react'
import { Button } from '#/components/ui/button'
import type { PassageBatchSummary } from '#/services/ai/passages'

function useElapsedSeconds(startedAt: number, paused: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (paused) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [paused])
  return Math.max(0, Math.floor((now - startedAt) / 1000))
}

interface PassageBatchProgressProps {
  batches: PassageBatchSummary[]
  startedAt: number
  onRetryFailed?: () => void
  isRetrying?: boolean
}

export function PassageBatchProgress({
  batches,
  startedAt,
  onRetryFailed,
  isRetrying,
}: PassageBatchProgressProps) {
  const done = batches.filter((b) => b.status === 'done').length
  const failed = batches.filter((b) => b.status === 'failed').length
  const running = batches.filter((b) => b.status === 'running').length
  const totalCitations = batches.reduce((s, b) => s + b.citationCount, 0)
  const matchedTotal = batches.reduce((s, b) => s + b.matchedCount, 0)
  const noMatchTotal = batches.reduce((s, b) => s + b.noMatchCount, 0)
  const pct =
    batches.length === 0 ? 0 : Math.round((done / batches.length) * 100)

  const allSettled =
    batches.length > 0 &&
    batches.every((b) => b.status === 'done' || b.status === 'failed')
  const elapsedSec = useElapsedSeconds(startedAt, allSettled)

  return (
    <section className="flex flex-col gap-5">
      <header className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <div>
          <p className="island-kicker text-[var(--lagoon-deep)]">
            Mencocokkan kalimat
          </p>
          <p className="mt-1 display-title text-xl font-medium leading-snug text-foreground sm:text-2xl">
            Sumber {done + running}/{batches.length} sedang diperiksa.
          </p>
        </div>
        <dl className="flex flex-wrap gap-x-6 gap-y-1 text-[0.8125rem] text-[var(--ink-soft)]">
          <Stat label="Cocok">
            <Num>{matchedTotal}</Num> dari <Num>{totalCitations}</Num>
          </Stat>
          <Stat label="Tidak cocok">
            <Num>{noMatchTotal}</Num>
          </Stat>
          {failed > 0 && (
            <Stat label="Gagal">
              <Num>{failed}</Num>
            </Stat>
          )}
          <Stat label="Berjalan">
            <Num>{elapsedSec}</Num>s
          </Stat>
        </dl>
      </header>

      <div className="relative h-1.5 w-full">
        <progress
          className="sr-only"
          value={pct}
          max={100}
          aria-label="Progres pencocokan kutipan"
        >
          {pct}%
        </progress>
        <div
          aria-hidden="true"
          className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--line)]"
        >
          <div
            className="h-full bg-[var(--accent-coral)] transition-[width] duration-300 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <ol className="flex flex-col gap-2">
        {batches.map((b) => (
          <BatchRow key={b.batchIndex} batch={b} />
        ))}
      </ol>

      {failed > 0 && onRetryFailed && (
        <div className="flex items-center justify-end">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onRetryFailed}
            disabled={!!isRetrying}
          >
            {isRetrying ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />
                Mencoba ulang…
              </>
            ) : (
              <>Coba lagi sumber gagal ({failed})</>
            )}
          </Button>
        </div>
      )}
    </section>
  )
}

function BatchRow({ batch }: { batch: PassageBatchSummary }) {
  const isDone = batch.status === 'done'
  const isFailed = batch.status === 'failed'
  const isRunning = batch.status === 'running'

  return (
    <li
      className="flex items-center gap-3 rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-[0.875rem]"
      data-status={batch.status}
    >
      <span className="shrink-0">
        <StatusIcon status={batch.status} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex items-baseline gap-2 truncate font-medium text-foreground">
          <FileText
            className="h-3.5 w-3.5 shrink-0 translate-y-px text-[var(--ink-soft)]"
            strokeWidth={1.75}
          />
          <span className="truncate">
            {batch.filename ?? `Sumber #${batch.sourcePdfId}`}
          </span>
        </p>
        {batch.referenceLabel && (
          <p className="mt-0.5 truncate text-[0.75rem] italic text-[var(--ink-soft)]">
            {batch.referenceLabel}
          </p>
        )}
        {isFailed && batch.errorMessage && (
          <p className="mt-1 line-clamp-2 break-words font-mono text-[0.75rem] leading-[1.55] text-[var(--accent-coral-deep)]">
            {batch.errorMessage}
          </p>
        )}
      </div>
      <div className="shrink-0 text-right text-[0.75rem] tabular-nums text-[var(--ink-soft)]">
        {isDone ? (
          <>
            <span className="font-medium text-foreground">
              {batch.matchedCount}
            </span>
            /{batch.citationCount} cocok
            {batch.noMatchCount > 0 && (
              <span className="ml-2 text-[var(--ink-faint)]">
                · {batch.noMatchCount} miss
              </span>
            )}
          </>
        ) : isRunning ? (
          <span className="italic">memeriksa {batch.citationCount} sitasi…</span>
        ) : isFailed ? (
          <span className="italic text-[var(--accent-coral-deep)]">
            gagal
          </span>
        ) : (
          <span className="italic">{batch.citationCount} sitasi menanti</span>
        )}
      </div>
    </li>
  )
}

function StatusIcon({ status }: { status: PassageBatchSummary['status'] }) {
  switch (status) {
    case 'done':
      return (
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[var(--bg-mint)] text-[var(--marker-green)]">
          <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
        </span>
      )
    case 'running':
      return (
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[var(--bg-butter)] text-[var(--accent-coral-deep)]">
          <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
        </span>
      )
    case 'failed':
      return (
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[var(--bg-blush)] text-[var(--accent-coral-deep)]">
          <AlertTriangle className="h-3.5 w-3.5" strokeWidth={2} />
        </span>
      )
    case 'pending':
    default:
      return (
        <span
          className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-dashed border-[var(--line-strong)] text-[var(--ink-faint)]"
          aria-hidden
        />
      )
  }
}

function Stat({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="inline-flex items-baseline gap-1.5">
      <dt className="kicker">{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

function Num({ children }: { children: React.ReactNode }) {
  return (
    <span className="tabular-nums font-medium text-foreground">
      {children}
    </span>
  )
}
