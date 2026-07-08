import type { EvaluationTierStats } from '#/schemas/evaluation-tier-stats'

export type StepTone = 'mint' | 'sky' | 'blush'

export type TierStep = {
  n: number
  title: string
  desc: string
  detail: string
  tone: StepTone
  // The only tier that reaches the internet. Dimmed in the explainer when
  // `kbbi.local_only` is on, since it never runs in that mode.
  online?: boolean
}

export const TIER_STEPS: TierStep[] = [
  {
    n: 1,
    title: 'Kosakata khusus',
    desc: 'istilah & nama yang sudah ditandai tim',
    detail:
      'Daftar kecil berisi istilah teknis, nama, singkatan, atau kata yang sengaja ditandai pengelola CiteTrack. Daftar ini dimuat ke memori server begitu pemeriksaan dimulai, jadi kata yang ada di sini langsung dikenali tanpa membuka kamus apa pun atau menyentuh internet.',
    tone: 'mint',
  },
  {
    n: 2,
    title: 'Basis data lokal',
    desc: 'salinan kamus KBBI di server',
    detail:
      'Salinan kamus KBBI (sekitar 85 ribu kata) yang sudah disimpan di database server. Inilah langkah yang menyelesaikan sebagian besar kata: cepat, dan tetap jalan meski server sedang tanpa internet.',
    tone: 'mint',
  },
  {
    n: 3,
    title: 'Cache hasil',
    desc: 'jawaban daring yang pernah disimpan',
    detail:
      'Kata yang dulu pernah dicek ke KBBI daring lalu hasilnya disimpan — baik yang ketemu maupun yang tidak. Kalau kata yang sama muncul lagi, jawabannya diambil dari sini supaya tidak perlu mengetuk internet untuk kedua kalinya.',
    tone: 'sky',
  },
  {
    n: 4,
    title: 'Daftar asing',
    desc: 'istilah Inggris/teknis yang umum',
    detail:
      'Daftar kata Inggris atau teknis yang lazim dipakai di skripsi, misalnya "software" atau "output". Kata yang cocok di sini dianggap istilah asing yang wajar, bukan salah ketik bahasa Indonesia.',
    tone: 'sky',
  },
  {
    n: 5,
    title: 'KBBI daring',
    desc: 'cek langsung ke kbbi.web.id',
    detail:
      'Kalau sampai langkah ini kata masih belum dikenali, CiteTrack baru menghubungi KBBI online (kbbi.web.id beserta beberapa sumber cadangan). Ini langkah paling lambat dan butuh internet, jadi hanya sedikit kata yang benar-benar sampai ke sini.',
    tone: 'blush',
    online: true,
  },
]

export type TierBucketKey = 'local' | 'daring' | 'unverified'

export type SegmentTone = 'mint' | 'blush' | 'butter'

export type TierSegment = {
  key: TierBucketKey
  label: string
  count: number
  percent: number
  tone: SegmentTone
}

const BUCKET_ORDER: TierBucketKey[] = ['local', 'daring', 'unverified']

const SEGMENT_META: Record<
  TierBucketKey,
  { label: string; tone: SegmentTone }
> = {
  local: { label: 'Basis data lokal', tone: 'mint' },
  daring: { label: 'KBBI daring', tone: 'blush' },
  unverified: { label: 'Belum terverifikasi', tone: 'butter' },
}

// Integer percentages summing to exactly 100 (largest-remainder method), so the
// proportion bar never shows e.g. 99% or 101% from naive rounding.
export function toTierPercentages(
  stats: EvaluationTierStats,
): Record<TierBucketKey, number> {
  const { total } = stats
  if (total <= 0) return { local: 0, daring: 0, unverified: 0 }

  const raw: Record<TierBucketKey, number> = {
    local: (stats.local / total) * 100,
    daring: (stats.daring / total) * 100,
    unverified: (stats.unverified / total) * 100,
  }

  const floored: Record<TierBucketKey, number> = {
    local: Math.floor(raw.local),
    daring: Math.floor(raw.daring),
    unverified: Math.floor(raw.unverified),
  }

  let remainder = 100 - (floored.local + floored.daring + floored.unverified)
  const byFraction = BUCKET_ORDER.toSorted(
    (a, b) => raw[b] - floored[b] - (raw[a] - floored[a]),
  )
  for (const key of byFraction) {
    if (remainder <= 0) break
    floored[key] += 1
    remainder -= 1
  }

  return floored
}

export function buildTierSegments(stats: EvaluationTierStats): TierSegment[] {
  const percentages = toTierPercentages(stats)
  return BUCKET_ORDER.map((key) => ({
    key,
    label: SEGMENT_META[key].label,
    tone: SEGMENT_META[key].tone,
    count: stats[key],
    percent: percentages[key],
  })).filter((segment) => segment.count > 0)
}
