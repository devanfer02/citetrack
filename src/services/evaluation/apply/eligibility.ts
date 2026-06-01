import type { Finding } from './types'

// The rule whose fix is a formatting change (make the word italic) rather than
// a text replacement. Keyed on the rule id, not a word list, so it generalises
// to any thesis.
export const ITALIC_RULE = 'eyd.foreign-not-italic'

// A finding that can be auto-applied as a text swap: it carries both the
// original text (`token`) and a concrete replacement (`suggestion`). Findings
// without a suggestion (e.g. an undeclared acronym) have nothing to write.
export function hasSuggestion(f: Finding): boolean {
  return (
    typeof f.suggestion === 'string' &&
    f.suggestion.trim() !== '' &&
    typeof f.token === 'string' &&
    f.token.trim() !== ''
  )
}

// A finding whose fix is to italicise the token (no text change).
export function isItalicFix(f: Finding): boolean {
  return (
    f.ruleId === ITALIC_RULE &&
    typeof f.token === 'string' &&
    f.token.trim() !== ''
  )
}

// Eligible = applicable (text swap or italic) and not already resolved.
// Resolved findings are excluded so re-running apply never double-edits.
export function isEligible(f: Finding): boolean {
  return (hasSuggestion(f) || isItalicFix(f)) && f.resolvedAt == null
}

// EYD text fixes are deterministic and safe, so they start checked. KBBI
// spelling suggestions and italic recommendations are higher-risk (foreign-word
// detection and KBBI both have false positives), so they start unchecked — the
// student opts in per word.
export function isDefaultChecked(f: Finding): boolean {
  return isEligible(f) && f.category === 'eyd' && !isItalicFix(f)
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
