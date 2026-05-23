import {
  BookOpen,
  FileCheck2,
  FileText,
  SpellCheck,
} from 'lucide-react'

export const CATEGORY_LABELS: Record<EvaluationCategory, string> = {
  kbbi: 'KBBI',
  eyd: 'EYD',
  filkom: 'FILKOM Template',
}

export const CATEGORY_DESCRIPTIONS: Record<EvaluationCategory, string> = {
  kbbi: 'Kata yang tidak ditemukan di Kamus Besar Bahasa Indonesia',
  eyd: 'Pelanggaran aturan ejaan yang disempurnakan',
  filkom: 'Struktur dokumen terhadap template skripsi FILKOM v3.0',
}

export const EYD_TIPS = [
  '"Di mana" ditulis terpisah. "dimana" adalah kesalahan umum.',
  'Partikel "-lah" selalu serangkai: "bacalah", bukan "baca lah".',
  '"Daripada" ditulis serangkai, bukan "dari pada".',
  '"Kepada" satu kata; "ke pada" keliru.',
  'Kata depan di, ke, dari berdiri sendiri sebagai penunjuk tempat: "di kantor".',
  'Imbuhan "di-" serangkai untuk verba: "dibaca", "ditulis".',
  'Huruf kapital awal kalimat + nama diri; bukan untuk nama jenis: "pisang ambon".',
  'Istilah asing yang belum diserap ditulis miring.',
  '"Ke mana" dua kata, "kemana" adalah kesalahan.',
  'Tanda hubung "-" bukan tanda pisah "—". Pakai em-dash untuk sisipan.',
] as const

export const KBBI_PROGRESS_SCALE = 100

export const STAGES: EvaluationStage[] = [
  {
    id: 'extract',
    label: 'Extract',
    description: 'Mengambil teks PDF',
    icon: FileText,
  },
  {
    id: 'filkom',
    label: 'FILKOM',
    description: 'Struktur template',
    icon: FileCheck2,
  },
  {
    id: 'kbbi',
    label: 'KBBI',
    description: 'Pemeriksaan ejaan',
    icon: BookOpen,
  },
  { id: 'eyd', label: 'EYD', description: 'Aturan ejaan', icon: SpellCheck },
]
