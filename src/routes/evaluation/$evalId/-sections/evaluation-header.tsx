import { ArrowDownToLine } from 'lucide-react'
import { Marker } from '#/components/AccentWord'
import { Button } from '#/components/ui/button'
import { downloadEvaluationXlsx } from '#/lib/evaluation/utils'
import { formatDurationMs } from '#/lib/utils'
import { InlineFindingsLine } from './inline-findings-line'

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

  return (
    <header className="mb-8">
      <span className="kicker text-[var(--accent-coral-deep)]">
        Penilaian Skripsi
      </span>
      <div className="mt-3 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <h1 className="display-title text-[clamp(2.25rem,3.6vw,3rem)] font-extrabold leading-[1.05] tracking-tight text-[var(--ink)]">
            Evaluation Report
          </h1>
          <p className="mt-4 max-w-2xl text-[0.9375rem] leading-relaxed text-[var(--ink-soft)]">
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
          </p>
        </div>
        {isDone && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              downloadEvaluationXlsx(findings, `evaluation-${evalId}.xlsx`, {
                evalId,
              })
            }
            disabled={findings.length === 0}
            className="self-start whitespace-nowrap"
          >
            <ArrowDownToLine className="h-3.5 w-3.5" />
            <span>Unduh laporan</span>
            <span className="text-[0.625rem] tracking-wider text-[var(--ink-soft)]">
              XLSX
            </span>
          </Button>
        )}
      </div>
      <div className="editorial-rule mt-6" />
    </header>
  )
}
