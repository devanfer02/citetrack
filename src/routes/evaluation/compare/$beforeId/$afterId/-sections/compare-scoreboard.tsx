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

      <div className="mt-8 flex flex-col gap-3">
        <SeverityBar label="Error" stat={bySeverity.error} severity="error" />
        <SeverityBar
          label="Warning"
          stat={bySeverity.warning}
          severity="warning"
        />
        <SeverityBar label="Info" stat={bySeverity.info} severity="info" />
      </div>
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

function SeverityBar({
  label,
  stat,
  severity,
}: {
  label: string
  stat: DeltaStat
  severity: 'error' | 'warning' | 'info'
}) {
  const max = Math.max(stat.before, stat.after, 1)
  const pct = (n: number) => `${Math.round((n / max) * 100)}%`
  return (
    <div className="grid grid-cols-[5rem_1fr_4rem] items-center gap-3">
      <span className="text-[0.8125rem] font-medium text-[var(--ink-soft)]">
        {label}
      </span>
      <div className="flex flex-col gap-1">
        <div className="h-2 rounded-full bg-[var(--ink)]/10">
          <div
            className="severity-fill h-2 rounded-full"
            data-severity={severity}
            style={{ width: pct(stat.before) }}
          />
        </div>
        <div className="h-2 rounded-full bg-[var(--ink)]/10">
          <div
            className="severity-fill h-2 rounded-full"
            data-severity={severity}
            style={{ width: pct(stat.after) }}
          />
        </div>
      </div>
      <span className="text-right text-[0.8125rem] tabular-nums text-[var(--ink-soft)]">
        {stat.before}→{stat.after}
      </span>
    </div>
  )
}
