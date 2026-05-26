import { AccentInk, Marker } from '#/components/AccentWord'
import { Section } from '#/components/Section'
import { Arrow, Sparkles } from '#/components/doodles'
import { relativeTime } from '#/lib/history/utils'
import type { ComparisonReport } from '#/lib/evaluation/compare'

export function CompareHeader({ report }: { report: ComparisonReport }) {
  const { before, after, filenameSimilarity, scoreboard } = report
  const mismatched = filenameSimilarity !== null && filenameSimilarity < 0.5
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
        Lihat apa yang berubah antara dua evaluation —{' '}
        <AccentInk tone="indigo">
          yang lama di kiri, yang baru di kanan
        </AccentInk>
        .
      </p>

      <div className="mt-8 grid grid-cols-1 items-stretch gap-4 sm:grid-cols-[1fr_auto_1fr]">
        <EvalPill
          label="Sebelum"
          filename={before.job.filename}
          createdAt={before.job.createdAt}
          score={scoreboard.overallScore.before}
        />
        <div
          aria-hidden
          className="hidden items-center justify-center sm:flex"
        >
          <Arrow tone="coral" size={40} />
        </div>
        <EvalPill
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
          Nama file berbeda — pastikan ini revisi dari dokumen yang sama.
        </div>
      )}
    </Section>
  )
}

function EvalPill({
  label,
  filename,
  createdAt,
  score,
}: {
  label: string
  filename: string
  createdAt: Date
  score: number
}) {
  return (
    <div className="soft-card flex flex-col gap-1 px-5 py-4" data-tone="cream">
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
