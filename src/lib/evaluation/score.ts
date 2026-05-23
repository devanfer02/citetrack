// Page-density based score for an evaluation. The previous formula was
// `100 - findings * weight`, which collapsed to 0 on any thesis with more
// than ~30 findings regardless of length. The new formula scales penalty
// by findings per page so a 100-page draft with 200 findings (2/page)
// scores like a 10-page paper with 20 findings.

const DENSITY_PENALTY = 14

export function computeEvaluationScore(
  kbbiCount: number,
  eydCount: number,
  totalPages: number | null | undefined,
): number {
  const total = (kbbiCount ?? 0) + (eydCount ?? 0)
  if (total === 0) return 100
  if (!totalPages || totalPages <= 0) {
    // No page count yet (job still extracting). Use a gentler absolute
    // penalty so the displayed score stays meaningful.
    return Math.max(0, Math.min(100, Math.round(100 - total * 0.5)))
  }
  const density = total / totalPages
  return Math.max(0, Math.min(100, Math.round(100 - density * DENSITY_PENALTY)))
}
