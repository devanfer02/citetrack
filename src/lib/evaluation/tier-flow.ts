import type { EvaluationTierStats } from '#/schemas/evaluation-tier-stats'

export type StepTone = 'mint' | 'sky' | 'blush'

export type TierStep = {
  n: number
  title: string
  desc: string
  tone: StepTone
}

export const TIER_STEPS: TierStep[] = [
  { n: 1, title: 'Memori', desc: 'cache sesi ini', tone: 'mint' },
  { n: 2, title: 'Basis data lokal', desc: 'kamus KBBI tersimpan', tone: 'mint' },
  { n: 3, title: 'Cache hasil', desc: 'cek daring sebelumnya', tone: 'sky' },
  { n: 4, title: 'Daftar asing', desc: 'istilah Inggris umum', tone: 'sky' },
  { n: 5, title: 'KBBI daring', desc: 'cek ke kbbi.web.id', tone: 'blush' },
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
