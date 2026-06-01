import { useMutation } from '@tanstack/react-query'
import { ArrowDownToLine, ChevronDown, Loader2 } from 'lucide-react'
import { Marker } from '#/components/AccentWord'
import { buttonVariants } from '#/components/ui/button'
import { downloadEvaluationXlsx } from '#/lib/evaluation/utils'
import { downloadResponse } from '#/lib/download'
import { cn, formatDurationMs } from '#/lib/utils'
import { InlineFindingsLine } from './inline-findings-line'
import { ComparePicker } from './compare-picker'
import { ApplyFixesDialog } from './apply-fixes-dialog'

function stripPdfExt(name: string): string {
  return name.replace(/\.pdf$/i, '')
}

export interface EvaluationHeaderProps {
  filename: string
  totalPages: number | null
  isRunning: boolean
  isDone: boolean
  evalId: string
  findings: EvaluationFinding[]
  summary: { kbbiErrorCount: number; eydErrorCount: number } | null
  durationMs: number | null
  onJumpCategory: (category: EvaluationCategory) => void
}

export function EvaluationHeader({
  filename,
  totalPages,
  isRunning,
  isDone,
  evalId,
  findings,
  summary,
  durationMs,
  onJumpCategory,
}: EvaluationHeaderProps) {
  const kbbiCount = summary?.kbbiErrorCount ?? 0
  const eydCount = summary?.eydErrorCount ?? 0
  const durationLabel = isDone ? formatDurationMs(durationMs) : null

  const xlsxMutation = useMutation({
    mutationFn: () =>
      downloadEvaluationXlsx(findings, `evaluation-${evalId}.xlsx`, {
        evalId,
      }),
  })

  const pdfMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/evaluation-annotated-pdf/${evalId}`)
      if (!res.ok) {
        throw new Error('Gagal menyiapkan PDF beranotasi.')
      }
      await downloadResponse(res, `evaluation-${evalId}-annotated.pdf`)
    },
  })

  return (
    <header className="mb-8">
      <span className="kicker text-[var(--accent-coral-deep)]">
        Penilaian Skripsi
      </span>
      <div className="mt-3 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <h1 className="display-title text-[clamp(2.25rem,3.6vw,3rem)] font-extrabold leading-[1.05] tracking-tight text-[var(--ink)]">
            Laporan pemeriksaan
          </h1>
          <div className="mt-4 max-w-2xl text-[0.9375rem] leading-relaxed text-[var(--ink-soft)]">
            <Marker tone="yellow">{stripPdfExt(filename)}</Marker>
            <span className="mx-2 text-[var(--ink-faint)]">·</span>
            <span>{totalPages ?? '—'} halaman</span>
            {isRunning && (
              <>
                <span className="mx-2 text-[var(--ink-faint)]">·</span>
                <span className="text-[var(--accent-coral-deep)]">
                  sedang diperiksa
                  <span className="dots-loop ml-0.5">
                    <span>.</span>
                    <span>.</span>
                    <span>.</span>
                  </span>
                </span>
              </>
            )}
            {isDone && summary && (
              <>
                <span className="mx-2 text-[var(--ink-faint)]">·</span>
                <InlineFindingsLine
                  kbbi={kbbiCount}
                  eyd={eydCount}
                  onJump={onJumpCategory}
                />
              </>
            )}
            {durationLabel && (
              <>
                <span className="mx-2 text-[var(--ink-faint)]">·</span>
                <span
                  className="tabular-nums"
                  aria-label={`Lama pemeriksaan ${durationLabel}`}
                >
                  selesai dalam {durationLabel}
                </span>
              </>
            )}
          </div>
        </div>
        {isDone && (
          <div className="flex flex-wrap items-center gap-2 self-start">
            <ComparePicker currentEvalId={evalId} />
            <ApplyFixesDialog evalJobId={evalId} findings={findings} />
            <DownloadMenu
              disabled={findings.length === 0}
              busy={xlsxMutation.isPending || pdfMutation.isPending}
              onXlsx={() => xlsxMutation.mutate()}
              onPdf={() => pdfMutation.mutate()}
              xlsxPending={xlsxMutation.isPending}
              pdfPending={pdfMutation.isPending}
            />
          </div>
        )}
      </div>
      <div className="editorial-rule mt-6" />
    </header>
  )
}

function closeMenu(e: React.MouseEvent<HTMLButtonElement>): void {
  e.currentTarget.closest('details')?.removeAttribute('open')
}

function DownloadMenu({
  disabled,
  busy,
  onXlsx,
  onPdf,
  xlsxPending,
  pdfPending,
}: {
  disabled: boolean
  busy: boolean
  onXlsx: () => void
  onPdf: () => void
  xlsxPending: boolean
  pdfPending: boolean
}) {
  return (
    <details className="group relative">
      <summary
        className={cn(
          buttonVariants({ variant: 'outline', size: 'sm' }),
          'cursor-pointer list-none whitespace-nowrap [&::-webkit-details-marker]:hidden',
        )}
        aria-label="Pilihan unduhan"
      >
        {busy ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
        ) : (
          <ArrowDownToLine className="h-3.5 w-3.5" />
        )}
        <span>{busy ? 'Menyiapkan…' : 'Unduh'}</span>
        <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
      </summary>
      <div className="absolute right-0 z-20 mt-1 flex w-60 flex-col gap-0.5 rounded-xl border border-[var(--line)] bg-white p-1 shadow-[0_8px_24px_rgba(0,0,0,0.08)]">
        <DownloadItem
          label="Laporan Excel"
          tag="XLSX"
          pending={xlsxPending}
          disabled={disabled}
          onClick={(e) => {
            closeMenu(e)
            onXlsx()
          }}
        />
        <DownloadItem
          label="PDF beranotasi"
          tag="PDF"
          pending={pdfPending}
          disabled={disabled}
          onClick={(e) => {
            closeMenu(e)
            onPdf()
          }}
        />
      </div>
    </details>
  )
}

function DownloadItem({
  label,
  tag,
  pending,
  disabled,
  onClick,
}: {
  label: string
  tag: string
  pending: boolean
  disabled: boolean
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || pending}
      className="flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-[var(--ink)] transition-colors hover:bg-[var(--bg-cream)] disabled:pointer-events-none disabled:opacity-50"
    >
      {pending ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
      ) : (
        <ArrowDownToLine className="h-3.5 w-3.5 text-[var(--ink-soft)]" />
      )}
      <span className="flex-1">{label}</span>
      <span className="text-[0.625rem] leading-none tracking-wider text-[var(--ink-faint)]">
        {tag}
      </span>
    </button>
  )
}
