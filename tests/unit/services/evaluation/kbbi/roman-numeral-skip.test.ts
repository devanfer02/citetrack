import { describe, expect, it } from 'vitest'
import { isStructuralNonTokenForTest } from '#/services/evaluation/kbbi/analyzer'

describe('isStructuralNonToken — Roman numerals (front-matter page numbers)', () => {
  it('skips lowercase roman numerals i-xxxix', () => {
    const cases = [
      'ii',
      'iii',
      'iv',
      'v',
      'vi',
      'vii',
      'viii',
      'ix',
      'x',
      'xi',
      'xii',
      'xiii',
      'xiv',
      'xv',
      'xvi',
      'xvii',
      'xviii',
      'xix',
      'xx',
      'xxx',
      'xxxix',
    ]
    for (const token of cases) {
      expect(
        isStructuralNonTokenForTest(token, 5),
        `expected "${token}" to be treated as a Roman numeral`,
      ).toBe(true)
    }
  })

  it('skips capitalized roman numerals (Vi, Ix, Xi)', () => {
    expect(isStructuralNonTokenForTest('Vi', 0)).toBe(true)
    expect(isStructuralNonTokenForTest('Ix', 0)).toBe(true)
    expect(isStructuralNonTokenForTest('Xi', 0)).toBe(true)
  })

  it('does NOT match common Indonesian short words that contain i/v/x letters', () => {
    expect(isStructuralNonTokenForTest('di', 5)).toBe(false)
    expect(isStructuralNonTokenForTest('ke', 5)).toBe(false)
    expect(isStructuralNonTokenForTest('itu', 5)).toBe(false)
    expect(isStructuralNonTokenForTest('ini', 5)).toBe(false)
    expect(isStructuralNonTokenForTest('vivi', 5)).toBe(false)
    expect(isStructuralNonTokenForTest('via', 5)).toBe(false)
    expect(isStructuralNonTokenForTest('xie', 5)).toBe(false)
  })

  it('does NOT match abbreviations using c/d/l/m letters', () => {
    // These would match a full Roman regex (cd=400, cm=900, mm=2000, dl=550)
    // but our restricted regex deliberately skips them so common abbreviations
    // still go through KBBI lookup.
    expect(isStructuralNonTokenForTest('cd', 5)).toBe(false)
    expect(isStructuralNonTokenForTest('cm', 5)).toBe(false)
    expect(isStructuralNonTokenForTest('mm', 5)).toBe(false)
    expect(isStructuralNonTokenForTest('dl', 5)).toBe(false)
  })
})
