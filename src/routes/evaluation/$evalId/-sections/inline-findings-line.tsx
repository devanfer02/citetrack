export function InlineFindingsLine({
  kbbi,
  eyd,
  onJump,
}: {
  kbbi: number
  eyd: number
  onJump: (category: EvaluationCategory) => void
}) {
  if (kbbi === 0 && eyd === 0) {
    return <span className="text-[var(--palm)]">tanpa temuan</span>
  }
  return (
    <span>
      <CountLink count={kbbi} category="kbbi" onJump={onJump} />
      <span className="mx-1.5 text-[var(--sea-ink-soft)]/40">·</span>
      <CountLink count={eyd} category="eyd" onJump={onJump} />
    </span>
  )
}

function CountLink({
  count,
  category,
  onJump,
}: {
  count: number
  category: EvaluationCategory
  onJump: (category: EvaluationCategory) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onJump(category)}
      className="inline-flex items-baseline gap-1 border-b border-transparent transition-colors hover:border-[var(--lagoon-deep)] focus-visible:border-[var(--lagoon-deep)] focus-visible:outline-none"
    >
      <span className="display-title font-medium text-[var(--sea-ink)]">
        {count}
      </span>
      <span className="kicker">{category}</span>
    </button>
  )
}
