import { ArrowRight } from 'lucide-react'
import type { EvaluationTierStats } from '#/schemas/evaluation-tier-stats'
import {
  buildTierSegments,
  TIER_STEPS,
  type SegmentTone,
  type StepTone,
} from '#/lib/evaluation/tier-flow'

interface TierFlowExplainerProps {
  stats: EvaluationTierStats | undefined
  className?: string
}

const STEP_BG: Record<StepTone, string> = {
  mint: 'bg-[var(--bg-mint)]',
  sky: 'bg-[var(--bg-sky)]',
  blush: 'bg-[var(--bg-blush)]',
}

const SEGMENT_BG: Record<SegmentTone, string> = {
  mint: 'bg-[var(--bg-mint)]',
  blush: 'bg-[var(--bg-blush)]',
  butter: 'bg-[var(--bg-butter)]',
}

const formatCount = (value: number): string => value.toLocaleString('id-ID')

export function TierFlowExplainer({ stats, className }: TierFlowExplainerProps) {
  const hasData = stats !== undefined && stats.total > 0
  const segments = hasData ? buildTierSegments(stats) : []

  return (
    <section
      className={`soft-card px-6 py-7 sm:px-8 ${className ?? ''}`}
      data-tone="cream"
      aria-label="Cara tiap kata diperiksa"
    >
      <h2 className="display-title text-lg font-bold leading-snug text-[var(--ink)]">
        Bagaimana tiap kata diperiksa
      </h2>
      <p className="mt-2 max-w-prose text-[0.9375rem] leading-relaxed text-[var(--ink-soft)]">
        Tiap kata dicek bertahap dan berhenti begitu cocok. Karena kamus KBBI
        sudah tersimpan di server, kebanyakan kata selesai di langkah awal —
        cepat dan tanpa internet. Hanya sisa kecil yang naik ke KBBI daring.
      </p>

      <ol className="mt-6 flex flex-col gap-2 sm:flex-row sm:items-stretch">
        {TIER_STEPS.map((step, index) => (
          <li key={step.n} className="flex flex-col sm:flex-1 sm:flex-row">
            <div
              className={`flex-1 rounded-xl px-3 py-3 text-center ${STEP_BG[step.tone]}`}
            >
              <span className="text-[0.6875rem] font-bold uppercase tracking-wide text-[var(--ink-faint)]">
                Langkah {step.n}
              </span>
              <span className="mt-1 block text-sm font-bold leading-tight text-[var(--ink)]">
                {step.title}
              </span>
              <span className="mt-0.5 block text-xs leading-snug text-[var(--ink-soft)]">
                {step.desc}
              </span>
            </div>
            {index < TIER_STEPS.length - 1 && (
              <span
                className="flex items-center justify-center py-1 text-[var(--ink-faint)] sm:px-1 sm:py-0"
                aria-hidden="true"
              >
                <ArrowRight className="size-4 rotate-90 sm:rotate-0" strokeWidth={2} />
              </span>
            )}
          </li>
        ))}
      </ol>

      <div className="mt-3 flex justify-between text-[0.6875rem] text-[var(--ink-faint)]">
        <span>cepat · tanpa internet</span>
        <span>lambat · terbatas kuota</span>
      </div>

      {hasData ? (
        <div className="mt-6">
          <div className="flex h-9 w-full overflow-hidden rounded-lg" role="presentation">
            {segments.map((segment) => (
              <div
                key={segment.key}
                className={`flex items-center justify-center text-xs font-bold text-[var(--ink)] ${SEGMENT_BG[segment.tone]}`}
                style={{ width: `${segment.percent}%` }}
              >
                {segment.percent >= 12 ? `${segment.percent}%` : ''}
              </div>
            ))}
          </div>
          <dl className="mt-4 flex flex-col gap-2.5">
            {segments.map((segment) => (
              <div key={segment.key} className="flex items-baseline gap-3 text-sm">
                <span
                  className={`mt-1 size-3 flex-none rounded-sm ${SEGMENT_BG[segment.tone]}`}
                  aria-hidden="true"
                />
                <dt className="font-semibold text-[var(--ink)]">{segment.label}</dt>
                <dd className="text-[var(--ink-soft)]">
                  {segment.percent}% · {formatCount(segment.count)} kata
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-xs text-[var(--ink-faint)]">
            Dihitung dari seluruh kata yang pernah diperiksa di CiteTrack
            ({formatCount(stats.total)} kata).
          </p>
        </div>
      ) : (
        <p className="mt-6 rounded-lg bg-[var(--bg-sky)] px-4 py-3 text-sm leading-relaxed text-[var(--ink-soft)]">
          Proporsinya muncul di sini setelah skripsi pertama selesai diperiksa.
        </p>
      )}

      <p className="mt-5 rounded-xl bg-[var(--bg-butter)] px-4 py-3 text-[0.8125rem] leading-relaxed text-[var(--ink)]">
        Kalau kuota KBBI daring habis atau KBBI sedang tak terjangkau, sisa kata
        ditandai{' '}
        <span className="rounded border border-[var(--ink-faint)]/30 bg-white px-1.5 py-0.5 text-xs">
          diperiksa: basis data lokal
        </span>{' '}
        di hasil — artinya kata itu dicek ke kamus lokal saja, belum sempat
        dipastikan online. Bukan berarti salah.
      </p>
    </section>
  )
}
