import { useNavigate } from '@tanstack/react-router'
import { ArrowLeftRight } from 'lucide-react'
import { AccentInk, Marker } from '#/components/AccentWord'
import { Section } from '#/components/Section'
import { Sparkles } from '#/components/doodles'
import { relativeTime } from '#/lib/history/utils'
import type { ComparisonReport } from '#/lib/evaluation/compare'
import type { CompareDelta } from '#/schemas/evaluation'

// Wrap a navigation in the browser's View Transitions API when available so
// the two EvalPill cards morph from one slot to the other (paired by
// view-transition-name=pill-${jobId}). Falls through to a plain navigate on
// browsers without the API.
function withViewTransition(run: () => void): void {
  if (
    typeof document !== 'undefined' &&
    'startViewTransition' in document &&
    typeof (document as { startViewTransition?: unknown }).startViewTransition ===
      'function'
  ) {
    ;(document as unknown as {
      startViewTransition: (cb: () => void) => void
    }).startViewTransition(run)
  } else {
    run()
  }
}

export function CompareHeader({
  report,
  beforeId,
  afterId,
  delta,
  swap,
}: {
  report: ComparisonReport
  beforeId: string
  afterId: string
  delta: CompareDelta
  swap: boolean
}) {
  const { before, after, filenameSimilarity, scoreboard } = report
  const mismatched = filenameSimilarity !== null && filenameSimilarity < 0.5
  const navigate = useNavigate()
  const onSwap = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault()
    // navigate() runs from the user's click, not during render — false
    // positive on tanstack-start-no-navigate-in-render here.
    withViewTransition(() => {
      // react-doctor-disable-next-line tanstack-start-no-navigate-in-render
      void navigate({
        to: '/evaluation/compare/$beforeId/$afterId',
        params: { beforeId: afterId, afterId: beforeId },
        search: { delta, swap: !swap },
        replace: true,
        resetScroll: false,
      })
    })
  }
  return (
    <Section tone="sky" grid innerClassName="relative pb-10 pt-14">
      <Sparkles
        tone="indigo"
        size={40}
        className="absolute right-[8%] top-10 hidden md:block"
      />
      <span className="inline-flex items-center gap-2 rounded-full bg-white/70 px-3 py-1 text-xs font-bold uppercase tracking-wider text-[var(--accent-indigo-deep)]">
        Perbandingan
      </span>
      <h1 className="display-title mt-4 text-[clamp(2.25rem,3.6vw,2.75rem)] font-extrabold leading-[1.05] tracking-tight text-[var(--ink)]">
        Sebelum dan <Marker tone="green">sesudah</Marker>.
      </h1>
      <p className="mt-4 max-w-prose text-[0.9375rem] leading-relaxed text-[var(--ink-soft)]">
        Lihat apa yang berubah antara dua evaluation:{' '}
        <AccentInk tone="indigo">
          yang lama di kiri, yang baru di kanan
        </AccentInk>
        .
      </p>

      <div className="mt-8 grid grid-cols-1 items-stretch gap-4 sm:grid-cols-[1fr_auto_1fr]">
        <EvalPill
          jobId={before.job.id}
          label="Sebelum"
          filename={before.job.filename}
          createdAt={before.job.createdAt}
          score={scoreboard.overallScore.before}
        />
        <div className="hidden items-center justify-center sm:flex">
          <button
            type="button"
            onClick={onSwap}
            aria-label="Tukar arah perbandingan"
            title="Tukar Sebelum dan Sesudah"
            className="group inline-flex size-11 items-center justify-center rounded-full border border-[var(--ink)]/15 bg-white text-[var(--accent-coral-deep)] shadow-sm transition-colors hover:border-[var(--accent-coral)] hover:bg-[var(--bg-cream)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-coral)]/40"
            style={{ viewTransitionName: 'compare-swap-button' }}
          >
            <ArrowLeftRight
              className="size-5 transition-transform duration-200 ease-out group-hover:rotate-180 group-active:rotate-180 group-active:scale-95"
              strokeWidth={1.75}
            />
          </button>
        </div>
        <EvalPill
          jobId={after.job.id}
          label="Sesudah"
          filename={after.job.filename}
          createdAt={after.job.createdAt}
          score={scoreboard.overallScore.after}
        />
      </div>

      {mismatched && (
        <div
          className="mt-5 flex items-start gap-2 rounded-xl border border-[var(--ink)]/15 bg-[var(--bg-sky)] px-4 py-3 text-[0.875rem] leading-relaxed text-[var(--ink)]"
          data-severity="info"
        >
          Nama file berbeda. Pastikan ini revisi dari dokumen yang sama.
        </div>
      )}
    </Section>
  )
}

function EvalPill({
  jobId,
  label,
  filename,
  createdAt,
  score,
}: {
  jobId: string
  label: string
  filename: string
  createdAt: Date
  score: number
}) {
  // Pair the card to its evaluation job so the browser can morph it across
  // slots when the user clicks swap. Both the "before" and "after" cards
  // before/after the swap end up with the same name on opposite sides ->
  // browser animates them sliding across.
  return (
    <div
      className="soft-card flex flex-col gap-1 px-5 py-4"
      data-tone="cream"
      style={{ viewTransitionName: 'pill-' + jobId }}
    >
      <span className="text-xs font-bold uppercase tracking-wider text-[var(--ink-soft)]">
        {label}
      </span>
      <span className="display-title break-words text-[1.0625rem] font-extrabold leading-snug text-[var(--ink)]">
        {filename}
      </span>
      <span className="text-[0.8125rem] text-[var(--ink-soft)]">
        {relativeTime(createdAt)} · skor {score}
      </span>
    </div>
  )
}
