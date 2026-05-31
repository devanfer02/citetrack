import type { Finding } from './types'

// A finding can only be auto-applied if it carries both the original text
// (`token`) and a concrete replacement (`suggestion`). Findings without a
// suggestion (e.g. an undeclared acronym, or a word KBBI couldn't resolve)
// have nothing to write.
export function hasSuggestion(f: Finding): boolean {
  return (
    typeof f.suggestion === 'string' &&
    f.suggestion.trim() !== '' &&
    typeof f.token === 'string' &&
    f.token.trim() !== ''
  )
}

// Eligible = has a suggestion and isn't already resolved. Resolved findings are
// excluded so re-running apply never double-edits text that was already fixed.
export function isEligible(f: Finding): boolean {
  return hasSuggestion(f) && f.resolvedAt == null
}

// EYD mechanical fixes are deterministic and safe, so they start checked. KBBI
// spelling suggestions are higher-risk (the false-positive source we tune), so
// they start unchecked — the student opts in per word.
export function isDefaultChecked(f: Finding): boolean {
  return isEligible(f) && f.category === 'eyd'
}

export function partitionEligible(findings: readonly Finding[]): {
  eligible: Finding[]
  ineligible: Finding[]
} {
  const eligible: Finding[] = []
  const ineligible: Finding[] = []
  for (const f of findings) {
    if (isEligible(f)) eligible.push(f)
    else ineligible.push(f)
  }
  return { eligible, ineligible }
}

// The finding ids that should be pre-checked when the apply panel opens.
export function defaultSelectedIds(findings: readonly Finding[]): number[] {
  return findings.filter(isDefaultChecked).map((f) => f.id)
}
