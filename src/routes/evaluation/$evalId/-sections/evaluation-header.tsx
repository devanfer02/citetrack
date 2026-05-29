import { useMutation } from '@tanstack/react-query'
import { ArrowDownToLine, Loader2 } from 'lucide-react'
import { Marker } from '#/components/AccentWord'
import { Button } from '#/components/ui/button'
import { downloadEvaluationXlsx } from '#/lib/evaluation/utils'
import { downloadResponse } from '#/lib/download'
import { formatDurationMs } from '#/lib/utils'
import { InlineFindingsLine } from './inline-findings-line'
import { ComparePicker } from './compare-picker'

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
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => xlsxMutation.mutate()}
              disabled={
                findings.length === 0 ||
                xlsxMutation.isPending ||
                pdfMutation.isPending
              }
              aria-busy={xlsxMutation.isPending}
              className="whitespace-nowrap"
            >
              {xlsxMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
              ) : (
                <ArrowDownToLine className="h-3.5 w-3.5" />
              )}
              <span>
                {xlsxMutation.isPending ? 'Menyiapkan…' : 'Unduh laporan'}
              </span>
              <span className="translate-y-[1px] text-[0.625rem] leading-none tracking-wider text-[var(--ink-soft)]">
                XLSX
              </span>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => pdfMutation.mutate()}
              disabled={
                findings.length === 0 ||
                pdfMutation.isPending ||
                xlsxMutation.isPending
              }
              aria-busy={pdfMutation.isPending}
              className="whitespace-nowrap"
            >
              {pdfMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
              ) : (
                <ArrowDownToLine className="h-3.5 w-3.5" />
              )}
              <span>
                {pdfMutation.isPending ? 'Menyiapkan…' : 'PDF beranotasi'}
              </span>
              <span className="translate-y-[1px] text-[0.625rem] leading-none tracking-wider text-[var(--ink-soft)]">
                PDF
              </span>
            </Button>
          </div>
        )}
      </div>
      <div className="editorial-rule mt-6" />
    </header>
  )
}
