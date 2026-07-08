import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'
import { Section } from '#/components/Section'
import type {
  ComparisonScoreboard,
  DeltaStat,
} from '#/lib/evaluation/compare'

export function CompareScoreboard({
  scoreboard,
}: {
  scoreboard: ComparisonScoreboard
}) {
  const { overallScore, totalFindings, byCategory, bySeverity } = scoreboard

  const severityOrder = [
    { key: 'error' as const, label: 'Error', stat: bySeverity.error },
    { key: 'warning' as const, label: 'Peringatan', stat: bySeverity.warning },
    { key: 'info' as const, label: 'Info', stat: bySeverity.info },
  ]
  // Only show severities that actually occur in either evaluation, and scale
  // every bar to one shared maximum so a small Error count never looks as long
  // as a large Peringatan count.
  const severityRows = severityOrder.filter(
    (r) => r.stat.before > 0 || r.stat.after > 0,
  )
  const severityMax = Math.max(
    1,
    ...severityRows.flatMap((r) => [r.stat.before, r.stat.after]),
  )

  return (
    <Section tone="cream" innerClassName="py-12">
      <h2 className="display-title text-2xl font-extrabold text-[var(--ink)]">
        Ringkasan perubahan
      </h2>
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <ScoreCard
          title="Skor keseluruhan"
          before={overallScore.before}
          after={overallScore.after}
          delta={overallScore.delta}
          higherIsBetter
        />
        <StatCard title="Total temuan" stat={totalFindings} />
        <StatCard title="Temuan KBBI" stat={byCategory.kbbi} />
        <StatCard title="Temuan EYD" stat={byCategory.eyd} />
      </div>

      {severityRows.length > 0 && (
        <div className="mt-10">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--ink-soft)]">
            Menurut tingkat keparahan
          </h3>
          <div className="mt-4 flex flex-col gap-5">
            {severityRows.map((r) => (
              <SeverityRow
                key={r.key}
                label={r.label}
                severity={r.key}
                stat={r.stat}
                max={severityMax}
              />
            ))}
          </div>
        </div>
      )}
    </Section>
  )
}

function trend(delta: number, higherIsBetter: boolean) {
  const improving = higherIsBetter ? delta > 0 : delta < 0
  const worsening = higherIsBetter ? delta < 0 : delta > 0
  return { improving, worsening }
}

function DeltaBadge({
  delta,
  higherIsBetter,
}: {
  delta: number
  higherIsBetter: boolean
}) {
  const { improving, worsening } = trend(delta, higherIsBetter)
  const Icon = delta === 0 ? Minus : delta > 0 ? ArrowUpRight : ArrowDownRight
  const color = improving
    ? 'text-[var(--marker-green)]'
    : worsening
      ? 'text-[var(--accent-coral-deep)]'
      : 'text-[var(--ink-soft)]'
  return (
    <span
      className={`inline-flex items-center gap-1 text-sm font-semibold ${color}`}
    >
      <Icon className="h-4 w-4" strokeWidth={2} />
      {delta > 0 ? `+${delta}` : delta}
    </span>
  )
}

function ScoreCard({
  title,
  before,
  after,
  delta,
  higherIsBetter,
}: {
  title: string
  before: number
  after: number
  delta: number
  higherIsBetter: boolean
}) {
  return (
    <div className="soft-card flex flex-col gap-2 px-5 py-4" data-tone="cream">
      <span className="text-xs font-bold uppercase tracking-wider text-[var(--ink-soft)]">
        {title}
      </span>
      <span className="display-title text-2xl font-extrabold tabular-nums text-[var(--ink)]">
        {before} <span className="text-[var(--ink-faint)]">→</span> {after}
      </span>
      <DeltaBadge delta={delta} higherIsBetter={higherIsBetter} />
    </div>
  )
}

function StatCard({ title, stat }: { title: string; stat: DeltaStat }) {
  return (
    <div className="soft-card flex flex-col gap-2 px-5 py-4" data-tone="cream">
      <span className="text-xs font-bold uppercase tracking-wider text-[var(--ink-soft)]">
        {title}
      </span>
      <span className="display-title text-2xl font-extrabold tabular-nums text-[var(--ink)]">
        {stat.before} <span className="text-[var(--ink-faint)]">→</span>{' '}
        {stat.after}
      </span>
      <span className="inline-flex items-center gap-2">
        <DeltaBadge delta={stat.delta} higherIsBetter={false} />
        <span className="text-[0.8125rem] text-[var(--ink-soft)]">
          {stat.pctChange === null
            ? '—'
            : `${stat.pctChange > 0 ? '+' : ''}${stat.pctChange}%`}
        </span>
      </span>
    </div>
  )
}

function SeverityRow({
  label,
  stat,
  severity,
  max,
}: {
  label: string
  stat: DeltaStat
  severity: 'error' | 'warning' | 'info'
  max: number
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-2 text-[0.9375rem] font-semibold text-[var(--ink)]">
          <span className="severity-dot" data-severity={severity} />
          {label}
        </span>
        <DeltaBadge delta={stat.delta} higherIsBetter={false} />
      </div>
      <SeverityTrack caption="Sebelum" value={stat.before} max={max} severity={severity} />
      <SeverityTrack caption="Sesudah" value={stat.after} max={max} severity={severity} />
    </div>
  )
}

function SeverityTrack({
  caption,
  value,
  max,
  severity,
}: {
  caption: string
  value: number
  max: number
  severity: 'error' | 'warning' | 'info'
}) {
  const width = `${Math.max(value > 0 ? 2 : 0, Math.round((value / max) * 100))}%`
  return (
    <div className="grid grid-cols-[5rem_1fr_3rem] items-center gap-3">
      <span className="text-[0.75rem] uppercase tracking-wide text-[var(--ink-soft)]">
        {caption}
      </span>
      <div className="h-2.5 rounded-full bg-[var(--ink)]/10">
        <div
          className="severity-fill h-2.5 rounded-full"
          data-severity={severity}
          style={{ width }}
        />
      </div>
      <span className="text-right text-[0.8125rem] font-medium tabular-nums text-[var(--ink)]">
        {value}
      </span>
    </div>
  )
}
