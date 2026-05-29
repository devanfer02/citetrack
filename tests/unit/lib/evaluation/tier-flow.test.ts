import { describe, expect, it } from 'vitest'
import {
  buildTierSegments,
  TIER_STEPS,
  toTierPercentages,
} from '#/lib/evaluation/tier-flow'
import type { EvaluationTierStats } from '#/schemas/evaluation-tier-stats'

const stats = (
  local: number,
  daring: number,
  unverified: number,
): EvaluationTierStats => ({
  local,
  daring,
  unverified,
  total: local + daring + unverified,
  localOnly: false,
})

describe('toTierPercentages', () => {
  it('returns zeros when nothing has been checked', () => {
    expect(toTierPercentages(stats(0, 0, 0))).toEqual({
      local: 0,
      daring: 0,
      unverified: 0,
    })
  })

  it('always sums to exactly 100 for non-empty data', () => {
    const cases: Array<[number, number, number]> = [
      [90, 7, 3],
      [1, 1, 1],
      [9980, 15, 5],
      [333, 333, 334],
      [7, 11, 13],
    ]
    for (const [l, d, u] of cases) {
      const pct = toTierPercentages(stats(l, d, u))
      expect(pct.local + pct.daring + pct.unverified).toBe(100)
    }
  })

  it('gives the dominant local bucket the largest share', () => {
    const pct = toTierPercentages(stats(900, 70, 30))
    expect(pct.local).toBeGreaterThan(pct.daring)
    expect(pct.local).toBeGreaterThan(pct.unverified)
    expect(pct.local).toBe(90)
  })

  it('distributes rounding remainder by largest fractional part', () => {
    const pct = toTierPercentages(stats(1, 1, 1))
    expect(pct.local + pct.daring + pct.unverified).toBe(100)
    expect([pct.local, pct.daring, pct.unverified].toSorted()).toEqual([
      33, 33, 34,
    ])
  })
})

describe('buildTierSegments', () => {
  it('omits empty buckets so the bar has no zero-width slivers', () => {
    const segments = buildTierSegments(stats(100, 0, 0))
    expect(segments).toHaveLength(1)
    expect(segments[0]?.key).toBe('local')
    expect(segments[0]?.percent).toBe(100)
  })

  it('keeps every non-empty bucket with its real count', () => {
    const segments = buildTierSegments(stats(90, 7, 3))
    expect(segments.map((s) => s.key)).toEqual(['local', 'daring', 'unverified'])
    expect(segments.find((s) => s.key === 'daring')?.count).toBe(7)
  })

  it('returns nothing when there is no data', () => {
    expect(buildTierSegments(stats(0, 0, 0))).toEqual([])
  })
})

describe('TIER_STEPS', () => {
  it('describes the five resolution tiers in order', () => {
    expect(TIER_STEPS).toHaveLength(5)
    expect(TIER_STEPS.map((s) => s.n)).toEqual([1, 2, 3, 4, 5])
    expect(TIER_STEPS.at(-1)?.title).toBe('KBBI daring')
  })
})
