import { Section } from '#/components/Section'
import type { RuleDelta } from '#/lib/evaluation/compare'

export function RuleDeltas({
  reductions,
  regressions,
}: {
  reductions: RuleDelta[]
  regressions: RuleDelta[]
}) {
  if (reductions.length === 0 && regressions.length === 0) return null
  return (
    <Section tone="cream" innerClassName="py-12">
      <h2 className="display-title text-2xl font-extrabold text-[var(--ink)]">
        Per aturan
      </h2>
      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
        <RuleColumn title="Paling banyak berkurang" rules={reductions} />
        <RuleColumn title="Paling banyak bertambah" rules={regressions} />
      </div>
    </Section>
  )
}

function RuleColumn({ title, rules }: { title: string; rules: RuleDelta[] }) {
  return (
    <div className="soft-card px-5 py-4" data-tone="cream">
      <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--ink-soft)]">
        {title}
      </h3>
      {rules.length === 0 ? (
        <p className="mt-3 text-[0.875rem] text-[var(--ink-soft)]">
          Tidak ada.
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {rules.map((r) => (
            <li
              key={r.ruleId}
              className="flex items-baseline justify-between gap-3"
            >
              <span className="break-words font-mono text-[0.8125rem] text-[var(--ink)]">
                {r.ruleId}
              </span>
              <span className="shrink-0 text-[0.8125rem] tabular-nums text-[var(--ink-soft)]">
                {r.before} → {r.after}{' '}
                <span className="font-semibold text-[var(--ink)]">
                  ({r.delta > 0 ? `+${r.delta}` : r.delta})
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
