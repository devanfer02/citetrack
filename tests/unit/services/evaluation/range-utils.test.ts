import { describe, expect, it } from 'vitest'
import { isInRanges, overlapsRanges } from '#/services/evaluation/range-utils'

// These two utilities decide whether a character offset (or a substring
// starting at one) falls inside a structural range — code blocks, italic
// runs, etc. Every EYD/KBBI rule reads these to decide whether to suppress
// a finding, so the half-open `[s, e)` invariant has to be exact.

describe('isInRanges — half-open [s, e) inclusivity', () => {
  it('treats the start offset as inside the range (inclusive)', () => {
    expect(isInRanges(5, [[5, 10]])).toBe(true)
  })

  it('treats the end offset as outside the range (exclusive)', () => {
    expect(isInRanges(10, [[5, 10]])).toBe(false)
  })

  it('treats end-1 as inside (last character of the range)', () => {
    expect(isInRanges(9, [[5, 10]])).toBe(true)
  })

  it('returns false for offsets before any range', () => {
    expect(isInRanges(2, [[5, 10]])).toBe(false)
  })

  it('returns false for offsets past every range', () => {
    expect(isInRanges(99, [[5, 10], [20, 30]])).toBe(false)
  })

  it('returns true when any of several ranges contains the offset', () => {
    expect(isInRanges(25, [[5, 10], [20, 30]])).toBe(true)
  })

  it('returns false on empty ranges', () => {
    expect(isInRanges(5, [])).toBe(false)
  })

  it('handles a zero-length range correctly (s === e, never inside)', () => {
    expect(isInRanges(5, [[5, 5]])).toBe(false)
  })
})

describe('overlapsRanges — does [offset, offset+length) overlap any range?', () => {
  it('overlaps when the span starts inside the range', () => {
    expect(overlapsRanges(6, 2, [[5, 10]])).toBe(true)
  })

  it('overlaps when the span ends inside the range', () => {
    expect(overlapsRanges(3, 4, [[5, 10]])).toBe(true) // [3, 7) ∩ [5, 10)
  })

  it('overlaps when the span fully contains the range', () => {
    expect(overlapsRanges(3, 10, [[5, 8]])).toBe(true) // [3, 13) ⊇ [5, 8)
  })

  it('overlaps when the range fully contains the span', () => {
    expect(overlapsRanges(6, 2, [[5, 20]])).toBe(true) // [6, 8) ⊂ [5, 20)
  })

  it('does NOT overlap when the span ends exactly at the range start', () => {
    expect(overlapsRanges(3, 2, [[5, 10]])).toBe(false) // [3, 5) ∩ [5, 10) = ∅
  })

  it('does NOT overlap when the span starts exactly at the range end', () => {
    expect(overlapsRanges(10, 2, [[5, 10]])).toBe(false) // [10, 12) ∩ [5, 10) = ∅
  })

  it('handles a zero-length span — equivalent to point lookup', () => {
    // overlapsRanges(5, 0, [[5, 10]]) is [5, 5) which is empty, so no overlap
    // even though isInRanges(5, [[5,10]]) is true. Document the asymmetry.
    expect(overlapsRanges(5, 0, [[5, 10]])).toBe(false)
  })

  it('returns false on empty ranges', () => {
    expect(overlapsRanges(0, 100, [])).toBe(false)
  })

  it('returns true when any of several ranges overlaps', () => {
    expect(overlapsRanges(22, 3, [[5, 10], [20, 30]])).toBe(true)
  })

  it('returns false when the span sits between two ranges', () => {
    expect(overlapsRanges(12, 5, [[5, 10], [20, 30]])).toBe(false) // [12, 17)
  })
})
