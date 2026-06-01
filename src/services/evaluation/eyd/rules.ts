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

const LOCATIVE_AFTER_DI = [
  'atas',
  'bawah',
  'dalam',
  'luar',
  'mana',
  'antara',
  'samping',
  'sebelah',
  'depan',
  'belakang',
  'tengah',
  'pinggir',
  'puncak',
  'ujung',
  'pojok',
  'sudut',
  'sekitar',
  'sekeliling',
  'balik',
  'hadapan',
  'tepi',
  'sini',
  'sana',
  'situ',
  'tempat',
  'rumah',
  'sekolah',
  'kantor',
  'kelas',
  'kamar',
  'gedung',
  'aula',
  'jalan',
  'kota',
  'desa',
  'kampus',
  'kampung',
  'fakultas',
  'jurusan',
  'asrama',
  'hotel',
  'bandara',
  'stasiun',
  'terminal',
  'pelabuhan',
  'klinik',
  'apotek',
  'pabrik',
  'kantin',
  'pasar',
  'taman',
  'lapangan',
  'masjid',
  'gereja',
  'restoran',
  'toko',
  'ruang',
  'pusat',
  'kafe',
  'warung',
  'rumahnya',
  'sekolahnya',
  'kantornya',
] as const

const DI_LOCATIVE_RE = new RegExp(
  `\\bdi(${LOCATIVE_AFTER_DI.join('|')})\\b`,
  'gi',
)

const LOCATIVE_SET: ReadonlySet<string> = new Set(LOCATIVE_AFTER_DI)

const COMMON_PASSIVE_VERBS: ReadonlySet<string> = new Set([
  'bawa',
  'lihat',
  'beli',
  'pakai',
  'buat',
  'baca',
  'tulis',
  'dengar',
  'kenal',
  'jaga',
  'lempar',
  'putar',
  'jual',
  'ambil',
  'taruh',
  'hapus',
  'ganti',
  'suruh',
  'kasih',
  'simpan',
  'kirim',
  'tangkap',
  'ucap',
  'anggap',
  'pikir',
  'panggil',
  'pegang',
  'kira',
  'terima',
  'capai',
  'ajar',
  'latih',
  'gunakan',
  'lakukan',
  'pakaikan',
  'bawakan',
  'berikan',
  'jelaskan',
  'sampaikan',
  'tunjukkan',
  'sebutkan',
  'jadikan',
  'sediakan',
  'kerjakan',
  'terapkan',
  'lupakan',
  'pelajari',
  'datangi',
  'hadiri',
  'lalui',
  'akhiri',
  'mulai',
  'taati',
  'tutupi',
  'dukung',
  'tetapkan',
  'arahkan',
  'jalankan',
  'matikan',
  'hidupkan',
  'tinggalkan',
  'biarkan',
  'temukan',
  'analisis',
  'analisa',
  'evaluasi',
  'observasi',
  'identifikasi',
  'klasifikasi',
  'verifikasi',
  'validasi',
  'kategorikan',
  'klasifikasikan',
  'tampilkan',
  'hasilkan',
  'simpulkan',
  'rumuskan',
  'analisiskan',
  'lakukannya',
  'gunakannya',
])

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
    // Require a 2+ space gap. pdfjs inserts a single spurious space before
    // punctuation from glyph advances (e.g. "Sumber :" / "sendiri ." in
    // captions), so a single space is an extraction artifact, not a typed
    // error — and we can't tell a real single-space typo from the artifact on
    // extracted text. A 2+ space gap is a genuine spacing anomaly. This is
    // document-agnostic: no word whitelist. See KNOWLEDGE_BASE.md §2.0.
    severity: 'warning',
    pattern: new RegExp(`${word}\\s{2,}([,.;:!?])`, 'g'),
    message: () => 'Tidak boleh ada spasi sebelum tanda baca.',
    suggestion: (m) => m[0].replace(/\s+([,.;:!?])/, '$1'),
    skip: isLeaderDot,
  },
  {
    id: 'eyd.missing-space-after-punct',
    severity: 'warning',
    pattern: /[A-Za-zÀ-ÿ]{2,}([,.;:!?])[A-Za-zÀ-ÿ]{2,}/g,
    message: (m) => `Tidak ada spasi setelah tanda "${m[1]}".`,
    suggestion: (m) => m[0].replace(/([,.;:!?])/, '$1 '),
  },
  {
    id: 'eyd.repeated-punct',
    severity: 'warning',
    pattern: /([,;:!?])\1+/g,
    message: (m) => `Tanda "${m[1]}" berulang.`,
    suggestion: (m) => m[1],
  },
  {
    id: 'eyd.repeated-period',
    severity: 'warning',
    pattern: /\.{2,}/g,
    message: () =>
      'Tanda titik berulang. Gunakan satu titik (.) atau elipsis tiga titik (...).',
    suggestion: (m) => (m[0].length === 2 ? '.' : '...'),
    skip: (m) => m[0].length === 3 || m[0].length >= 6,
  },
  {
    id: 'eyd.english-number-format',
    severity: 'info',
    pattern: /\b(\d{1,3}(?:,\d{3})+)(\.\d+)?\b/g,
    message: () =>
      'Format angka tampak gaya Inggris. Indonesia: titik untuk ribuan (1.000), koma untuk desimal (12,5).',
    suggestion: (m) => {
      const intPart = m[1].replace(/,/g, '.')
      const decPart = m[2] ? m[2].replace('.', ',') : ''
      return intPart + decPart
    },
  },
  {
    id: 'eyd.di-locative-one-word',
    severity: 'error',
    pattern: DI_LOCATIVE_RE,
    message: (m) =>
      `"${m[0].toLowerCase()}" ditulis terpisah sebagai "di ${m[1].toLowerCase()}" (kata depan + kata benda/lokasi).`,
    suggestion: (m) => `di ${m[1].toLowerCase()}`,
  },
  {
    id: 'eyd.kemana-one-word',
    severity: 'error',
    pattern: /\bkemana\b/gi,
    message: () => '"kemana" ditulis terpisah sebagai "ke mana".',
    suggestion: (m) => m[0].replace(/kemana/i, 'ke mana'),
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
  {
    id: 'eyd.di-passive-split',
    severity: 'warning',
    pattern: /\b(di|Di)\s+([a-zà-ÿ]{3,})\b/g,
    message: (m) =>
      `Prefiks pasif "di-" ditulis serangkai dengan kata kerja, contoh "di${m[2]}".`,
    suggestion: (m) => `${m[1]}${m[2]}`,
    skip: (m) => {
      const verb = m[2].toLowerCase()
      if (LOCATIVE_SET.has(verb)) return true
      if (COMMON_PASSIVE_VERBS.has(verb)) return false
      if (verb.length >= 5 && verb.endsWith('kan')) return false
      return true
    },
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
