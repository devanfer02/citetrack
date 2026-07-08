import { describe, expect, it } from 'vitest'
import { emptyChangeLog } from '#/services/evaluation/apply/change-log'
import {
  applyFindingsToPage,
  buildDocxParagraphs,
  correctPages,
} from '#/services/evaluation/apply/rebuild-docx'
import { makeFinding } from './helpers'

const ITALIC_RULE = 'eyd.foreign-not-italic'

describe('applyFindingsToPage', () => {
  it('splices a single suggestion by offset', () => {
    const content = 'Saya pergi kemana saja.'
    const offset = content.indexOf('kemana')
    const log = emptyChangeLog()
    const out = applyFindingsToPage(
      content,
      [makeFinding({ offset, length: 'kemana'.length, token: 'kemana', suggestion: 'ke mana' })],
      log,
    )
    expect(out.content).toBe('Saya pergi ke mana saja.')
    expect(log.applied).toHaveLength(1)
  })

  it('applies multiple findings on one page without offset drift', () => {
    const content = 'kemana dan kemana lagi'
    const first = content.indexOf('kemana')
    const second = content.indexOf('kemana', first + 1)
    const log = emptyChangeLog()
    const out = applyFindingsToPage(
      content,
      [
        makeFinding({ id: 1, offset: first, length: 6, token: 'kemana', suggestion: 'ke mana' }),
        makeFinding({ id: 2, offset: second, length: 6, token: 'kemana', suggestion: 'ke mana' }),
      ],
      log,
    )
    expect(out.content).toBe('ke mana dan ke mana lagi')
    expect(log.applied).toHaveLength(2)
  })

  it('skips a finding whose token no longer matches the offset', () => {
    const log = emptyChangeLog()
    const out = applyFindingsToPage(
      'teks lain sama sekali',
      [makeFinding({ offset: 0, length: 6, token: 'kemana', suggestion: 'ke mana' })],
      log,
    )
    expect(out.content).toBe('teks lain sama sekali')
    expect(log.applied).toHaveLength(0)
    expect(log.unlocated[0]?.reason).toBe('teks sumber sudah berubah')
  })

  it('records an italic range without changing text', () => {
    const content = 'memakai framework modern'
    const offset = content.indexOf('framework')
    const log = emptyChangeLog()
    const out = applyFindingsToPage(
      content,
      [
        makeFinding({
          ruleId: ITALIC_RULE,
          offset,
          length: 'framework'.length,
          token: 'framework',
          suggestion: null,
        }),
      ],
      log,
    )
    expect(out.content).toBe(content)
    expect(out.italicRanges).toEqual([[offset, offset + 'framework'.length]])
    expect(log.applied[0]?.kind).toBe('italic')
  })

  it('shifts an italic range when a replacement to its left changes length', () => {
    // "kemana" -> "ke mana" (grows by 1) sits left of the italic word.
    const content = 'kemana pakai framework'
    const repOffset = content.indexOf('kemana')
    const italOffset = content.indexOf('framework')
    const log = emptyChangeLog()
    const out = applyFindingsToPage(
      content,
      [
        makeFinding({ id: 1, offset: repOffset, length: 6, token: 'kemana', suggestion: 'ke mana' }),
        makeFinding({
          id: 2,
          ruleId: ITALIC_RULE,
          offset: italOffset,
          length: 'framework'.length,
          token: 'framework',
          suggestion: null,
        }),
      ],
      log,
    )
    expect(out.content).toBe('ke mana pakai framework')
    const [s, e] = out.italicRanges[0]!
    expect(out.content.slice(s, e)).toBe('framework')
  })
})

describe('correctPages', () => {
  it('only edits pages that have selected findings', () => {
    const pages = [
      { pageNumber: 1, content: 'kemana' },
      { pageNumber: 2, content: 'tidak diubah' },
    ]
    const log = emptyChangeLog()
    const out = correctPages(
      pages,
      [makeFinding({ pageNumber: 1, offset: 0, length: 6, token: 'kemana', suggestion: 'ke mana' })],
      log,
    )
    expect(out[0]!.content).toBe('ke mana')
    expect(out[1]!.content).toBe('tidak diubah')
  })

  it('records findings without a page as unlocated', () => {
    const log = emptyChangeLog()
    correctPages(
      [{ pageNumber: 1, content: 'abc' }],
      [makeFinding({ pageNumber: null, offset: 0, length: 1, token: 'a', suggestion: 'A' })],
      log,
    )
    expect(log.unlocated[0]?.reason).toBe('halaman tidak diketahui')
  })
})

describe('buildDocxParagraphs', () => {
  it('emits one paragraph per source line across pages', () => {
    const paragraphs = buildDocxParagraphs([
      { pageNumber: 1, content: 'baris satu\nbaris dua' },
      { pageNumber: 2, content: 'halaman dua' },
    ])
    expect(paragraphs).toHaveLength(3)
  })
})
