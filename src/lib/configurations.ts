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
    'Saat aktif, kamus KBBI lokal (dump PostgreSQL hasil seed) dilewati sepenuhnya. Setiap kata yang tidak ada di cache akan langsung dicek ke sumber KBBI eksternal (kbbi.web.id, kbbi.kemendikdasmen.go.id, dst.) tanpa batas 150 lookup per pekerjaan. Pakai ini kalau dump lokal kelihatannya kedaluwarsa atau kamu mau tegas memakai sumber resmi. Konsekuensi: evaluasi jadi jauh lebih lama dan rentan rate-limit; aktifkan hanya bila perlu.',
  'passage.embedding_model':
    'Model embedding untuk mencocokkan kutipan skripsi dengan isi PDF sumber. "none" mematikan embedding dan hanya pakai BM25 + n-gram leksikal — paling ringan, paling lemah pada paraphrase lintas-bahasa. Model multilingual menangani skripsi Indonesia yang merujuk sumber Inggris. Mengganti model menghitung ulang embedding tiap PDF sumber saat berikutnya diakses.',
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
