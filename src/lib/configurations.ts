import { z } from 'zod'

export const EMBEDDING_MODEL_VALUES = [
  'none',
  'paraphrase-minilm-l12-v2',
  'multilingual-e5-small',
  'multilingual-e5-base',
] as const

export type EmbeddingModel = (typeof EMBEDDING_MODEL_VALUES)[number]

export const CONFIG_SCHEMAS = {
  'autofetch.staleness_timeout_ms': z.number().int().positive(),
  'autofetch.download_timeout_ms': z.number().int().positive(),
  'autofetch.concurrency': z.number().int().positive(),
  'upload.max_file_size_bytes': z.number().int().positive(),
  'purge.retention_days': z.number().int().positive(),
  'purge.orphan_grace_hours': z.number().int().positive(),
  'kbbi.use_tor_proxy': z.number().int().min(0).max(1),
  'kbbi.disable_local_dump': z.number().int().min(0).max(1),
  'kbbi.external_lookup_budget': z.number().int().min(0),
  'kbbi.external_lookup_timeout_ms': z.number().int().min(0),
  'kbbi.source.kemendikdasmen': z.number().int().min(0).max(1),
  'kbbi.source.web_id': z.number().int().min(0).max(1),
  'kbbi.source.typoonline': z.number().int().min(0).max(1),
  'kbbi.source.co_id': z.number().int().min(0).max(1),
  'kbbi.source.raf555': z.number().int().min(0).max(1),
  'passage.embedding_model': z.enum(EMBEDDING_MODEL_VALUES),
} as const

export type ConfigKey = keyof typeof CONFIG_SCHEMAS
export type ConfigValue<K extends ConfigKey> = z.infer<(typeof CONFIG_SCHEMAS)[K]>
export type AnyConfigValue = ConfigValue<ConfigKey>

export const CONFIG_DEFAULTS: { [K in ConfigKey]: ConfigValue<K> } = {
  'autofetch.staleness_timeout_ms': 5 * 60 * 1000,
  'autofetch.download_timeout_ms': 30 * 1000,
  'autofetch.concurrency': 4,
  'upload.max_file_size_bytes': 50 * 1024 * 1024,
  'purge.retention_days': 30,
  'purge.orphan_grace_hours': 24,
  'kbbi.use_tor_proxy': 0,
  'kbbi.disable_local_dump': 0,
  'kbbi.external_lookup_budget': 300,
  'kbbi.external_lookup_timeout_ms': 7000,
  'kbbi.source.kemendikdasmen': 1,
  'kbbi.source.web_id': 1,
  'kbbi.source.typoonline': 1,
  'kbbi.source.co_id': 0,
  'kbbi.source.raf555': 1,
  'passage.embedding_model': 'multilingual-e5-small',
}

export const CONFIG_DESCRIPTIONS: Record<ConfigKey, string> = {
  'autofetch.staleness_timeout_ms':
    'Kalau pencarian PDF sumber diam tanpa kemajuan selama waktu ini, dia ditandai gagal pada pemeriksaan berikutnya. Disimpan dalam milidetik.',
  'autofetch.download_timeout_ms':
    'Berapa lama menunggu satu unduhan PDF sumber sebelum dibatalkan. Disimpan dalam milidetik.',
  'autofetch.concurrency':
    'Berapa PDF sumber yang boleh diunduh bersamaan saat pencarian otomatis berjalan.',
  'upload.max_file_size_bytes':
    'Ukuran maksimum PDF yang boleh diunggah, baik skripsi maupun sumber. Diisi dalam MB, disimpan dalam bytes.',
  'purge.retention_days':
    'Pekerjaan yang sudah selesai (berhasil atau gagal) dan usianya lebih dari batas ini akan dihapus saat kamu menekan tombol "Bersihkan sekarang". Pekerjaan yang masih berjalan tidak disentuh.',
  'purge.orphan_grace_hours':
    'Saat pembersihan, berkas di disk yang sudah tidak punya catatan di database ikut terhapus, asalkan usianya lebih dari batas jam ini. Jeda ini melindungi unggahan yang baru saja dimulai.',
  'kbbi.use_tor_proxy':
    'Saat aktif, pencarian KBBI ke kbbi.kemendikdasmen.go.id dirutekan lewat sidecar Tor sehingga batas harian per-IP tidak menghambat evaluasi. Sumber KBBI lain tetap langsung. Sidecar otomatis ikut start di docker compose; saat mati, tetap aman karena fallback ke koneksi langsung.',
  'kbbi.disable_local_dump':
    'Saat aktif, kamus KBBI lokal (dump PostgreSQL hasil seed) dilewati sepenuhnya. Setiap kata akan langsung dicek ke cache, lalu ke sumber KBBI eksternal (kbbi.web.id, kbbi.kemendikdasmen.go.id, dst.) — sama seperti default, tapi tanpa membaca dump lokal sama sekali. Pakai ini kalau dump lokal kelihatannya kedaluwarsa atau kamu mau tegas memakai sumber resmi. Konsekuensi: evaluasi jauh lebih lama karena semua kata harus lewat HTTP; aktifkan hanya bila perlu.',
  'kbbi.external_lookup_budget':
    'Berapa kata unik yang boleh dicek ke sumber KBBI eksternal per pekerjaan evaluasi. Kata yang tidak ada di kamus lokal akan dicek satu per satu ke kbbi.web.id, kbbi.kemendikdasmen.go.id, dst., dan setelah jatah ini habis, sisanya dilaporkan sebagai "tidak bisa diverifikasi online" tanpa mengetuk sumber lagi. Pasang ke 0 untuk menonaktifkan batas (semua kata diteruskan ke eksternal, hati-hati: bisa kena rate-limit pada skripsi panjang). Default 300 cocok untuk satu naskah dengan banyak istilah asing/typo yang masih wajar.',
  'kbbi.external_lookup_timeout_ms':
    'Berapa lama menunggu satu kata diverifikasi ke sumber KBBI eksternal sebelum pencarian dihentikan dan kata itu ditandai "tidak bisa diverifikasi online". Ini batas yang kita pasang sendiri, bukan galat jaringan — di Log API ia muncul sebagai outcome "aborted", bukan "network error". Diisi dalam detik, disimpan dalam milidetik. Naikkan kalau sumber sering lambat dan banyak kata terlewat; pasang 0 untuk mematikan batas (tunggu tanpa henti, hati-hati pada skripsi panjang). Default 7 detik.',
  'kbbi.source.kemendikdasmen':
    'Saat aktif, sumber resmi kbbi.kemendikdasmen.go.id ikut dipakai untuk verifikasi kata. Resmi tetapi sering kena batas harian per-IP — pertimbangkan menyalakan "Rute KBBI Kemendikdasmen via Tor" bila ingin tetap menjangkau ini saat batas tercapai.',
  'kbbi.source.web_id':
    'Saat aktif, kbbi.web.id ikut dipakai. Mirror cepat dengan cakupan KBBI V; jarang rate-limit dan biasanya jadi tulang punggung verifikasi online.',
  'kbbi.source.typoonline':
    'Saat aktif, typoonline.com ikut dipakai. Sumber cadangan ringan untuk pengecekan kata baku.',
  'kbbi.source.co_id':
    'Saat aktif, kbbi.co.id ikut dipakai. Sering mengembalikan 429 (rate-limit) sehingga default mati — nyalakan kalau kamu butuh tambahan sumber dan tidak masalah dengan jeda otomatis.',
  'kbbi.source.raf555':
    'Saat aktif, kbbi.raf555.dev (JSON API, KBBI VI dari official APK v6.1.0) ikut dipakai. Cakupan paling lengkap; matikan kalau kamu mau hanya pakai sumber Indonesia.',
  'passage.embedding_model':
    'Model embedding untuk mencocokkan kutipan skripsi dengan isi PDF sumber. "none" mematikan embedding dan hanya pakai BM25 + n-gram leksikal — paling ringan, paling lemah pada paraphrase lintas-bahasa. Model multilingual menangani skripsi Indonesia yang merujuk sumber Inggris. Mengganti model menghitung ulang embedding tiap PDF sumber saat berikutnya diakses.',
}

export const CONFIG_WARNINGS: Partial<Record<ConfigKey, string>> = {
  'autofetch.concurrency':
    'Makin banyak unduhan paralel, makin berat beban jaringan dan CPU server. Di mesin kecil, angka yang terlalu tinggi malah memperlambat pencarian dan bikin situs sumber lebih cepat membatasi kamu (rate-limit).',
  'upload.max_file_size_bytes':
    'Berkas yang lebih besar lebih lama diekstrak dan makan lebih banyak memori. Kalau batasnya kamu naikkan jauh, unggahan dan pemeriksaan bisa terasa lambat, apalagi di server ber-RAM kecil.',
  'purge.retention_days':
    'Makin lama riwayat disimpan, makin banyak PDF yang menumpuk di disk. Kalau ruang server terbatas, angka tinggi bisa cepat memenuhi penyimpanan.',
  'kbbi.disable_local_dump':
    'Tanpa kamus lokal, semua kata harus dicek lewat internet. Evaluasi jadi jauh lebih lama dan lebih gampang kena rate-limit. Nyalakan hanya kalau dump lokalnya memang bermasalah.',
  'kbbi.external_lookup_budget':
    'Jatah yang lebih besar berarti lebih banyak kata dicek lewat internet, jadi evaluasi makan waktu lebih lama. Pada skripsi panjang, angka tinggi atau 0 (tanpa batas) gampang kena rate-limit, dan sebagian kata bisa gagal diverifikasi.',
  'kbbi.external_lookup_timeout_ms':
    'Batas waktu yang lebih panjang bikin tiap kata menunggu lebih lama saat sumber lemot, dan total evaluasi ikut molor. Nilai 0 berarti menunggu tanpa henti: satu sumber yang macet bisa menggantung seluruh pekerjaan.',
  'passage.embedding_model':
    'Model yang lebih besar mencocokkan lebih akurat, tapi makan lebih banyak RAM dan lebih lama menghitung embedding tiap PDF sumber. multilingual-e5-base butuh sekitar 4 GB RAM; di server kecil bisa lambat atau gagal. Ganti model juga memicu penghitungan ulang embedding semua sumber.',
}

export const CONFIG_LABELS: Record<ConfigKey, string> = {
  'autofetch.staleness_timeout_ms': 'Batas diam pencarian otomatis',
  'autofetch.download_timeout_ms': 'Batas waktu unduh per PDF',
  'autofetch.concurrency': 'Jumlah unduhan paralel',
  'upload.max_file_size_bytes': 'Ukuran unggahan maksimum',
  'purge.retention_days': 'Lama penyimpanan riwayat',
  'purge.orphan_grace_hours': 'Masa tenggang berkas tertinggal',
  'kbbi.use_tor_proxy': 'Rute KBBI Kemendikdasmen via Tor',
  'kbbi.disable_local_dump': 'Lewati kamus KBBI lokal',
  'kbbi.external_lookup_budget': 'Batas verifikasi KBBI eksternal per pekerjaan',
  'kbbi.external_lookup_timeout_ms': 'Batas waktu verifikasi KBBI per kata',
  'kbbi.source.kemendikdasmen': 'Sumber: KBBI Kemendikdasmen (resmi)',
  'kbbi.source.web_id': 'Sumber: KBBI Web ID',
  'kbbi.source.typoonline': 'Sumber: Typo Online',
  'kbbi.source.co_id': 'Sumber: KBBI.co.id',
  'kbbi.source.raf555': 'Sumber: raf555 API (KBBI VI)',
  'passage.embedding_model': 'Model pencocokan kutipan',
}

export const CONFIG_KEYS = Object.keys(CONFIG_SCHEMAS) as ConfigKey[]

export type DisplayKind = 'ms-as-seconds' | 'bytes-as-mb' | 'integer' | 'boolean' | 'enum'

export const CONFIG_DISPLAY: Record<ConfigKey, DisplayKind> = {
  'autofetch.staleness_timeout_ms': 'ms-as-seconds',
  'autofetch.download_timeout_ms': 'ms-as-seconds',
  'autofetch.concurrency': 'integer',
  'upload.max_file_size_bytes': 'bytes-as-mb',
  'purge.retention_days': 'integer',
  'purge.orphan_grace_hours': 'integer',
  'kbbi.use_tor_proxy': 'boolean',
  'kbbi.disable_local_dump': 'boolean',
  'kbbi.external_lookup_budget': 'integer',
  'kbbi.external_lookup_timeout_ms': 'ms-as-seconds',
  'kbbi.source.kemendikdasmen': 'boolean',
  'kbbi.source.web_id': 'boolean',
  'kbbi.source.typoonline': 'boolean',
  'kbbi.source.co_id': 'boolean',
  'kbbi.source.raf555': 'boolean',
  'passage.embedding_model': 'enum',
}

export const CONFIG_UNIT_LABEL: Record<ConfigKey, string> = {
  'autofetch.staleness_timeout_ms': 'seconds',
  'autofetch.download_timeout_ms': 'seconds',
  'autofetch.concurrency': '',
  'upload.max_file_size_bytes': 'MB',
  'purge.retention_days': 'days',
  'purge.orphan_grace_hours': 'hours',
  'kbbi.use_tor_proxy': '',
  'kbbi.disable_local_dump': '',
  'kbbi.external_lookup_budget': 'lookups',
  'kbbi.external_lookup_timeout_ms': 'seconds',
  'kbbi.source.kemendikdasmen': '',
  'kbbi.source.web_id': '',
  'kbbi.source.typoonline': '',
  'kbbi.source.co_id': '',
  'kbbi.source.raf555': '',
  'passage.embedding_model': '',
}

export interface EnumOption {
  value: string
  label: string
  hint: string
}

export const CONFIG_ENUM_OPTIONS: Partial<Record<ConfigKey, readonly EnumOption[]>> = {
  'passage.embedding_model': [
    {
      value: 'none',
      label: 'Tanpa embedding (leksikal saja)',
      hint: 'Paling ringan. Hanya BM25 + n-gram. Cocok kalau RAM ketat. Skripsi Indonesia × sumber Inggris hampir selalu gagal cocok.',
    },
    {
      value: 'paraphrase-minilm-l12-v2',
      label: 'MiniLM-L12-v2 multilingual (~120 MB)',
      hint: 'Model lama tapi solid. 384 dimensi. Aman di VPS 2 CPU / 2 GB.',
    },
    {
      value: 'multilingual-e5-small',
      label: 'multilingual-e5-small (~120 MB) · bawaan',
      hint: 'Terbaik untuk ukuran. 384 dimensi. Lintas-bahasa lebih kuat dari MiniLM. Aman di 2 GB.',
    },
    {
      value: 'multilingual-e5-base',
      label: 'multilingual-e5-base (~280 MB)',
      hint: 'Kualitas paraphrase tertinggi. 768 dimensi. Butuh ≥ 4 GB RAM, embed PDF besar lebih lama.',
    },
  ],
}

const BYTES_PER_MB = 1024 * 1024

export function formatConfigForDisplay(
  code: ConfigKey,
  value: AnyConfigValue,
): string {
  const kind = CONFIG_DISPLAY[code]
  if (kind === 'enum') {
    return String(value)
  }
  if (typeof value !== 'number') return String(value)
  if (kind === 'ms-as-seconds') {
    const seconds = value / 1000
    return seconds.toString()
  }
  if (kind === 'bytes-as-mb') {
    const mb = value / BYTES_PER_MB
    return Number.isInteger(mb) ? mb.toString() : mb.toFixed(2)
  }
  if (CONFIG_DISPLAY[code] === 'boolean') {
    return value === 1 ? 'on' : 'off'
  }
  return value.toString()
}

export function parseConfigFromDisplay(
  code: ConfigKey,
  input: string,
): AnyConfigValue | null {
  const kind = CONFIG_DISPLAY[code]
  if (kind === 'enum') {
    const options = CONFIG_ENUM_OPTIONS[code]
    if (!options) return null
    const trimmed = input.trim()
    return options.some((o) => o.value === trimmed) ? trimmed : null
  }

  const trimmed = input
    .trim()
    .replace(/\s*[a-z]+$/i, '')
    .trim()
  if (trimmed.length === 0) return null
  const n = Number.parseFloat(trimmed)
  if (!Number.isFinite(n)) return null
  if (kind === 'ms-as-seconds') {
    const ms = Math.round(n * 1000)
    return ms > 0 ? ms : null
  }
  if (kind === 'bytes-as-mb') {
    const bytes = Math.round(n * BYTES_PER_MB)
    return bytes > 0 ? bytes : null
  }
  if (CONFIG_DISPLAY[code] === 'boolean') {
    return n === 0 || n === 1 ? n : null
  }
  if (!Number.isInteger(n)) return null
  return n
}
