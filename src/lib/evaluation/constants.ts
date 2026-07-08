import { BookOpen, FileText, SpellCheck } from 'lucide-react'

export const CATEGORY_LABELS: Record<EvaluationCategory, string> = {
  kbbi: 'KBBI',
  eyd: 'EYD',
}

export const CATEGORY_DESCRIPTIONS: Record<EvaluationCategory, string> = {
  kbbi: 'Kata yang tidak ditemukan di Kamus Besar Bahasa Indonesia',
  eyd: 'Penyimpangan dari aturan EYD',
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
  'Tanda hubung "-" beda dengan tanda pisah "—". Pakai tanda pisah untuk sisipan.',
  '"Pun" terpisah jika partikel: "siapa pun", "apa pun". Serangkai untuk yang sudah lazim: "walaupun", "ataupun".',
  '"Bagaimana" satu kata; "bagai mana" keliru.',
  'Huruf kapital untuk nama hari, bulan, dan hari raya: "Senin", "Januari", "Idulfitri".',
  'Akronim yang diucap sebagai kata pakai huruf kecil: "tilang", "rudal", "puskesmas".',
  'Bilangan satu atau dua kata ditulis dengan huruf: "dua belas", "lima ratus". Selebihnya pakai angka.',
  'Tanda titik pada singkatan gelar: "Dr.", "S.Kom.", "M.Pd." — tapi "MBA" tanpa titik.',
  '"Per" terpisah saat berarti "mulai" atau "tiap": "per 1 Januari", "per orang".',
  'Tanda koma sebelum "tetapi", "melainkan", "sedangkan" pada kalimat majemuk setara.',
  'Awalan "se-" selalu serangkai: "sekamar", "setahun", "sekantor".',
  'Nama jenis dengan asal tempat ditulis huruf kecil: "jeruk bali", "kucing anggora", "batik solo".',
  'Singkatan nama orang pakai titik: "B.J. Habibie", "M. Hatta", "S.T. Alisjahbana".',
  'Judul buku, film, atau karya ditulis miring atau diapit tanda kutip.',
  'Kata serapan ikut ejaan Indonesia: "kualitas" bukan "quality", "ekstrak" bukan "extract".',
  'Tanda titik dua tidak dipakai jika pernyataan sebelumnya bukan kalimat utuh.',
] as const

export const KBBI_PROGRESS_SCALE = 100

// EYD comes before KBBI in the displayed pipeline because KBBI usually
// finishes last (external lookups, larger search space). Putting the slower
// stage at the end keeps the visible progress in step with the real backend.
export const STAGES: EvaluationStage[] = [
  {
    id: 'extract',
    label: 'Ekstrak',
    description: 'Mengambil teks PDF',
    icon: FileText,
  },
  { id: 'eyd', label: 'EYD', description: 'Aturan ejaan', icon: SpellCheck },
  {
    id: 'kbbi',
    label: 'KBBI',
    description: 'Pemeriksaan ejaan',
    icon: BookOpen,
  },
]
