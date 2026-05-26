import { describe, expect, it } from 'vitest'
import {
  detectHeuristicItalicFontsForTest,
  type ItemMetaForTest,
} from '#/services/pdf/extractor'

const makeMeta = (
  start: number,
  end: number,
  fontName: string,
  size: number,
  opts: { nameIsItalic?: boolean; isMono?: boolean } = {},
): ItemMetaForTest => ({
  start,
  end,
  fontName,
  size,
  nameIsItalic: opts.nameIsItalic ?? false,
  isMono: opts.isMono ?? false,
})

describe('detectHeuristicItalicFonts — same-size minority fonts', () => {
  it('flags a same-size font with substantially fewer chars as italic', () => {
    // Body font: 2000 chars at 11.26pt
    // Alt font:    50 chars at 11.26pt  (italic emphasis)
    // Heading:    100 chars at 16pt    (NOT italic — wrong size)
    const metas: ItemMetaForTest[] = [
      makeMeta(0, 2000, 'body', 11.26),
      makeMeta(2000, 2050, 'alt', 11.26),
      makeMeta(2050, 2150, 'heading', 16),
    ]
    const italic = detectHeuristicItalicFontsForTest(metas)
    expect(italic.has('alt')).toBe(true)
    expect(italic.has('heading')).toBe(false)
    expect(italic.has('body')).toBe(false)
  })

  it('does not flag a font that has the same char count as body (ambiguous)', () => {
    // Two fonts at same size with similar usage — can't tell which is italic.
    const metas: ItemMetaForTest[] = [
      makeMeta(0, 1000, 'fontA', 11.26),
      makeMeta(1000, 1900, 'fontB', 11.26),
    ]
    const italic = detectHeuristicItalicFontsForTest(metas)
    // fontB has 900/1000 = 0.9 ratio; above the 0.5 italic cap → not italic
    expect(italic.has('fontA')).toBe(false)
    expect(italic.has('fontB')).toBe(false)
  })

  it('skips heuristic for pages under the minimum chars threshold', () => {
    // 100 chars total < MIN_CHARS_FOR_HEURISTIC (200) — heuristic should bail.
    const metas: ItemMetaForTest[] = [
      makeMeta(0, 80, 'body', 11.26),
      makeMeta(80, 100, 'alt', 11.26),
    ]
    const italic = detectHeuristicItalicFontsForTest(metas)
    expect(italic.size).toBe(0)
  })

  it('ignores monospace fonts when computing body / italic', () => {
    const metas: ItemMetaForTest[] = [
      makeMeta(0, 2000, 'body', 11.26),
      makeMeta(2000, 2300, 'mono', 11.26, { isMono: true }),
      makeMeta(2300, 2350, 'alt', 11.26),
    ]
    const italic = detectHeuristicItalicFontsForTest(metas)
    expect(italic.has('alt')).toBe(true)
    expect(italic.has('mono')).toBe(false)
  })

  it('matches sizes within 5% tolerance', () => {
    // Body at 11.26pt, italic at 11.50pt (~2% larger) — still considered same size.
    const metas: ItemMetaForTest[] = [
      makeMeta(0, 2000, 'body', 11.26),
      makeMeta(2000, 2050, 'alt', 11.5),
      makeMeta(2050, 2150, 'heading', 14),
    ]
    const italic = detectHeuristicItalicFontsForTest(metas)
    expect(italic.has('alt')).toBe(true)
    expect(italic.has('heading')).toBe(false)
  })
})
