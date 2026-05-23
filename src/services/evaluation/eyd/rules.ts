import { overlapsRanges } from '#/services/evaluation/range-utils'

export type EydFinding = {
  ruleId: string
  severity: 'error' | 'warning' | 'info'
  offset: number
  length: number
  message: string
  suggestion: string | null
}

type EydRule = {
  id: string
  severity: 'error' | 'warning' | 'info'
  pattern: RegExp
  message: (match: RegExpMatchArray) => string
  suggestion: (match: RegExpMatchArray) => string | null
  skip?: (match: RegExpExecArray, text: string) => boolean
}

const word = String.raw`[A-Za-zÀ-ÿ]`

const PUN_FIXED_FORMS = new Set([
  'adapun',
  'andaipun',
  'ataupun',
  'bagaimanapun',
  'biarpun',
  'jikapun',
  'kalaupun',
  'kendatipun',
  'maupun',
  'meskipun',
  'sekalipun',
  'sementangpun',
  'sungguhpun',
  'walaupun',
])

const isLeaderDot = (match: RegExpExecArray, text: string): boolean => {
  const punctIdx = match.index + match[0].length - 1
  if (text[punctIdx] !== '.') return false
  const next = text[punctIdx + 1]
  if (next === '.') return true
  if (next === ' ' && text[punctIdx + 2] === '.') return true
  let i = punctIdx - 1
  while (i >= 0 && text[i] === ' ') i--
  if (text[i] === '.') return true
  return false
}

const RULES: EydRule[] = [
  {
    id: 'eyd.double-space',
    severity: 'warning',
    pattern: new RegExp(`${word}  +${word}`, 'g'),
    message: () => 'Dua spasi atau lebih berturut-turut antara kata.',
    suggestion: (m) => m[0].replace(/\s+/g, ' '),
  },
  {
    id: 'eyd.space-before-punct',
    severity: 'warning',
    pattern: new RegExp(`${word}\\s+([,.;:!?])`, 'g'),
    message: () => 'Tidak boleh ada spasi sebelum tanda baca.',
    suggestion: (m) => m[0].replace(/\s+([,.;:!?])/, '$1'),
    skip: isLeaderDot,
  },
  {
    id: 'eyd.dimana-one-word',
    severity: 'error',
    pattern: /\bdimana\b/gi,
    message: () => '"dimana" ditulis terpisah sebagai "di mana" (kata depan + kata tanya).',
    suggestion: (m) => m[0].replace(/dimana/i, 'di mana'),
  },
  {
    id: 'eyd.kemana-one-word',
    severity: 'error',
    pattern: /\bkemana\b/gi,
    message: () => '"kemana" ditulis terpisah sebagai "ke mana".',
    suggestion: (m) => m[0].replace(/kemana/i, 'ke mana'),
  },
  {
    id: 'eyd.diatas-one-word',
    severity: 'error',
    pattern: /\bdiatas\b/gi,
    message: () => '"diatas" ditulis terpisah sebagai "di atas".',
    suggestion: (m) => m[0].replace(/diatas/i, 'di atas'),
  },
  {
    id: 'eyd.dibawah-one-word',
    severity: 'error',
    pattern: /\bdibawah\b/gi,
    message: () => '"dibawah" ditulis terpisah sebagai "di bawah".',
    suggestion: (m) => m[0].replace(/dibawah/i, 'di bawah'),
  },
  {
    id: 'eyd.didalam-one-word',
    severity: 'error',
    pattern: /\bdidalam\b/gi,
    message: () => '"didalam" ditulis terpisah sebagai "di dalam".',
    suggestion: (m) => m[0].replace(/didalam/i, 'di dalam'),
  },
  {
    id: 'eyd.diluar-one-word',
    severity: 'error',
    pattern: /\bdiluar\b/gi,
    message: () => '"diluar" ditulis terpisah sebagai "di luar".',
    suggestion: (m) => m[0].replace(/diluar/i, 'di luar'),
  },
  {
    id: 'eyd.daripada-two-words',
    severity: 'error',
    pattern: /\bdari\s+pada\b/gi,
    message: () => '"dari pada" ditulis serangkai sebagai "daripada".',
    suggestion: () => 'daripada',
  },
  {
    id: 'eyd.kepada-two-words',
    severity: 'error',
    pattern: /\bke\s+pada\b/gi,
    message: () => '"ke pada" ditulis serangkai sebagai "kepada".',
    suggestion: () => 'kepada',
  },
  {
    id: 'eyd.bagaimana-two-words',
    severity: 'error',
    pattern: /\bbagai\s+mana\b/gi,
    message: () => '"bagai mana" ditulis serangkai sebagai "bagaimana".',
    suggestion: () => 'bagaimana',
  },
  {
    id: 'eyd.ketika-two-words',
    severity: 'error',
    pattern: /\bke\s+tika\b/gi,
    message: () => '"ke tika" ditulis serangkai sebagai "ketika".',
    suggestion: () => 'ketika',
  },
  {
    id: 'eyd.particle-lah-separated',
    severity: 'error',
    pattern: /\b(\w+)\s+(lah|kah|tah)\b/g,
    message: (m) =>
      `Partikel "-${m[2]}" ditulis serangkai dengan kata sebelumnya, contoh "${m[1]}${m[2]}".`,
    suggestion: (m) => `${m[1]}${m[2]}`,
  },
  {
    id: 'eyd.particle-pun-attached',
    severity: 'error',
    pattern: /\b([A-Za-zÀ-ÿ]+)pun\b/g,
    message: (m) =>
      `Partikel "pun" ditulis terpisah ("${m[1]} pun"), kecuali pada bentuk tetap seperti walaupun, meskipun, adapun, maupun.`,
    suggestion: (m) => `${m[1]} pun`,
    skip: (m) => PUN_FIXED_FORMS.has(m[0].toLowerCase()),
  },
]

export function runEydRules(
  text: string,
  codeRanges: Array<[number, number]> = [],
): EydFinding[] {
  const findings: EydFinding[] = []
  for (const rule of RULES) {
    const re = new RegExp(rule.pattern.source, rule.pattern.flags)
    let match: RegExpExecArray | null
    while ((match = re.exec(text)) !== null) {
      if (overlapsRanges(match.index, match[0].length, codeRanges)) continue
      if (rule.skip?.(match, text)) continue
      findings.push({
        ruleId: rule.id,
        severity: rule.severity,
        offset: match.index,
        length: match[0].length,
        message: rule.message(match),
        suggestion: rule.suggestion(match),
      })
    }
  }
  return findings
}
