import { ArrowDownToLine } from 'lucide-react'
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
      <p className="kicker kicker-accent mb-3">Penilaian Skripsi</p>
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <h1 className="display-title text-4xl font-medium leading-[1.05] tracking-tight text-[var(--sea-ink)] sm:text-5xl">
            Evaluation Report
          </h1>
          <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-[var(--sea-ink-soft)]">
            <span className="display-title italic text-[var(--sea-ink)]">
              “{stripPdfExt(filename)}”
            </span>
            <span className="mx-2 text-[var(--sea-ink-soft)]/40">·</span>
            <span>{totalPages ?? '—'} halaman</span>
            {isRunning && (
              <>
                <span className="mx-2 text-[var(--sea-ink-soft)]/40">·</span>
                <span className="text-[var(--lagoon-deep)]">
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
                <span className="mx-2 text-[var(--sea-ink-soft)]/40">·</span>
                <InlineFindingsLine
                  kbbi={kbbiCount}
                  eyd={eydCount}
                  onJump={onJumpCategory}
                />
              </>
            )}
            {durationLabel && (
              <>
                <span className="mx-2 text-[var(--sea-ink-soft)]/40">·</span>
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
          <button
            type="button"
            onClick={() =>
              downloadEvaluationXlsx(findings, `evaluation-${evalId}.xlsx`, {
                evalId,
              })
            }
            disabled={findings.length === 0}
            className="group inline-flex items-center gap-2 self-start whitespace-nowrap border-b border-[var(--sea-ink)]/40 pb-1 text-sm font-medium text-[var(--sea-ink)] transition-colors hover:border-[var(--lagoon-deep)] hover:text-[var(--lagoon-deep)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-[var(--sea-ink)]/40 disabled:hover:text-[var(--sea-ink)]"
          >
            <span>Unduh laporan</span>
            <ArrowDownToLine className="h-3.5 w-3.5 -translate-y-px transition-transform group-hover:translate-y-0" />
            <span className="kicker text-[var(--sea-ink-soft)]">xlsx</span>
          </button>
        )}
      </div>
      <div className="editorial-rule mt-6" />
    </header>
  )
}
