const EYD_BASE = 'https://eyd.netlify.app/'

// Map each rule emitted by services/evaluation/eyd/rules.ts to the closest
// chapter on the public EYD reference site. Only rules with a definitive
// chapter get a URL; everything else returns null so the UI hides the link
// instead of pointing at an unrelated page.
const EYD_RULE_PATHS: Record<string, string> = {
  'eyd.dimana-one-word': 'penulisan-kata/kata-depan',
  'eyd.kemana-one-word': 'penulisan-kata/kata-depan',
  'eyd.diatas-one-word': 'penulisan-kata/kata-depan',
  'eyd.dibawah-one-word': 'penulisan-kata/kata-depan',
  'eyd.didalam-one-word': 'penulisan-kata/kata-depan',
  'eyd.diluar-one-word': 'penulisan-kata/kata-depan',
  'eyd.daripada-two-words': 'penulisan-kata/kata-turunan',
  'eyd.kepada-two-words': 'penulisan-kata/kata-turunan',
  'eyd.bagaimana-two-words': 'penulisan-kata/kata-turunan',
  'eyd.ketika-two-words': 'penulisan-kata/kata-turunan',
  'eyd.particle-lah-separated': 'penulisan-kata/partikel',
  'eyd.space-before-punct': 'penggunaan-tanda-baca/tanda-titik',
}

export function eydRuleUrl(ruleId: string | null): string | null {
  if (!ruleId || !ruleId.startsWith('eyd.')) return null
  const slug = EYD_RULE_PATHS[ruleId]
  if (!slug) return null
  return `${EYD_BASE}${slug}`
}
