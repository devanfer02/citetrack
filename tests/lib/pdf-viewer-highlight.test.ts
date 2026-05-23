// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest'
import {
  applyHighlight,
  applySearchHighlights,
  collectSpanIndex,
  findTarget,
} from '#/lib/pdf-viewer/utils'

// Fabricate a text-layer container shaped like what pdf.js produces:
// a <div class="pdf-text-layer"> with one <span> per text item.
function makeTextLayer(items: string[]): HTMLDivElement {
  const container = document.createElement('div')
  container.className = 'pdf-text-layer'
  for (const text of items) {
    const span = document.createElement('span')
    span.textContent = text
    container.appendChild(span)
  }
  document.body.replaceChildren(container)
  return container
}

function highlighted(container: HTMLElement): string[] {
  return [...container.querySelectorAll('.citetrack-highlight')].map(
    (el) => el.textContent ?? '',
  )
}

function activeHighlight(container: HTMLElement): string[] {
  return [...container.querySelectorAll('.citetrack-highlight-active')].map(
    (el) => el.textContent ?? '',
  )
}

describe('findTarget', () => {
  it('finds an exact phrase verbatim', () => {
    const concat = 'untuk memperjelas ruang lingkup penelitian '
    const m = findTarget(concat, 'memperjelas ruang lingkup')
    expect(m).toEqual({ start: 6, end: 31 })
  })

  it('finds a single word when no phrase context is provided', () => {
    const concat = 'kata pembalajaran tidak ditemukan '
    const m = findTarget(concat, 'pembalajaran')
    expect(m?.start).toBe(5)
    expect(m?.end).toBe(17)
  })

  it('peels words off the ends when the full excerpt drifted', () => {
    // Excerpt is wider than what survived in the text layer.
    const concat = 'media pembalajaran yang efektif untuk '
    const m = findTarget(concat, 'lebih media pembalajaran yang efektif untuk siswa')
    expect(m).not.toBeNull()
    // Should find at least "media pembalajaran yang efektif".
    expect(m && concat.slice(m.start, m.end)).toContain('pembalajaran')
  })

  it('falls back to the longest unique word when the phrase fails', () => {
    const concat = 'tas media pembalajaran dilakukan '
    // Query phrase doesn't appear, but "pembalajaran" does.
    const m = findTarget(concat, 'metode pembalajaran sistematis berbasis Android')
    expect(m).not.toBeNull()
    expect(m && concat.slice(m.start, m.end)).toBe('pembalajaran')
  })

  // Ligature and soft-hyphen handling lives in collectSpanIndex's
  // normalize() step rather than findTarget itself — exercised by the
  // collectSpanIndex + applyHighlight integration tests below.

  it('returns null when the query has nothing in common with the page', () => {
    const concat = 'untuk memperjelas ruang lingkup penelitian '
    const m = findTarget(concat, 'xylophone marsupial constitutionality')
    expect(m).toBeNull()
  })

  it('finds a word split across spans via whitespace-collapsed fallback', () => {
    // pdf.js sometimes emits separate spans per syllable when text is
    // justified. After collectSpanIndex joins them with SEPARATOR ' ',
    // the concatenated string has the word broken: "pem balajaran ".
    const concat = 'kata pem balajaran tidak '
    const m = findTarget(concat, 'pembalajaran')
    expect(m).not.toBeNull()
    expect(m && concat.slice(m.start, m.end)).toContain('pem')
  })
})

describe('collectSpanIndex', () => {
  it('skips empty / whitespace-only spans and tracks span ranges', () => {
    const container = makeTextLayer(['kata', ' ', '', 'pembalajaran'])
    const { spans, concatenated } = collectSpanIndex(container)
    expect(spans).toHaveLength(2)
    expect(concatenated).toBe('kata pembalajaran ')
    expect(spans[0]?.start).toBe(0)
    expect(spans[0]?.end).toBe(4)
    expect(spans[1]?.start).toBe(5)
    expect(spans[1]?.end).toBe(17)
  })

  it('lowercases and NFKC-normalizes span text', () => {
    const container = makeTextLayer(['Klasiﬁkasi', 'Dokumen'])
    const { concatenated } = collectSpanIndex(container)
    expect(concatenated).toBe('klasifikasi dokumen ')
  })

  it('strips soft hyphens and zero-width joiners', () => {
    const container = makeTextLayer(['pem­ba‍lajaran'])
    const { concatenated } = collectSpanIndex(container)
    expect(concatenated).toBe('pembalajaran ')
  })
})

describe('applyHighlight', () => {
  let container: HTMLDivElement
  beforeEach(() => {
    container = makeTextLayer([])
  })

  it('marks the span containing the offending word', () => {
    container = makeTextLayer(['kata', 'pembalajaran', 'tidak', 'ditemukan'])
    applyHighlight(container, 'pembalajaran', null)
    expect(highlighted(container)).toEqual(['pembalajaran'])
  })

  it('marks all spans whose text overlaps a multi-span match', () => {
    container = makeTextLayer(['media', 'pembalajaran', 'yang', 'efektif'])
    applyHighlight(container, 'pembalajaran yang efektif', null)
    expect(highlighted(container)).toEqual(['pembalajaran', 'yang', 'efektif'])
  })

  it('clears previous highlight classes before applying new ones', () => {
    container = makeTextLayer(['kata', 'pembalajaran', 'tidak'])
    applyHighlight(container, 'pembalajaran', null)
    applyHighlight(container, 'kata', null)
    expect(highlighted(container)).toEqual(['kata'])
  })

  it('does nothing when the query is blank', () => {
    container = makeTextLayer(['kata', 'pembalajaran'])
    applyHighlight(container, '   ', null)
    expect(highlighted(container)).toEqual([])
  })

  it('handles fragmented spans where pdfjs splits a word across runs', () => {
    container = makeTextLayer(['kata', 'pem', 'balajaran', 'tidak'])
    applyHighlight(container, 'pembalajaran', null)
    // Both fragment spans should be lit.
    expect(highlighted(container)).toEqual(['pem', 'balajaran'])
  })

  it('handles ligature-encoded text in the page', () => {
    container = makeTextLayer(['klasiﬁkasi', 'dokumen'])
    applyHighlight(container, 'klasifikasi', null)
    expect(highlighted(container)).toEqual(['klasiﬁkasi'])
  })

  it('still highlights even when the excerpt context drifted', () => {
    container = makeTextLayer(['tas', 'media', 'pembalajaran', 'dilakukan'])
    applyHighlight(container, 'metode pembalajaran sistematis android', null)
    expect(highlighted(container)).toEqual(['pembalajaran'])
  })

  it('does not highlight anything when no part of the query matches', () => {
    container = makeTextLayer(['kata', 'lain', 'tidak'])
    applyHighlight(container, 'xylophone marsupial', null)
    expect(highlighted(container)).toEqual([])
  })
})

describe('applySearchHighlights', () => {
  it('lights every occurrence and marks the active one distinctly', () => {
    const container = makeTextLayer([
      'media',
      'pembelajaran',
      'untuk',
      'siswa',
      'media',
      'pembelajaran',
      'lain',
    ])
    const result = applySearchHighlights(container, 'pembelajaran', 1, null)
    expect(result.occurrenceCount).toBe(2)
    expect(result.activeFound).toBe(true)
    // Both occurrences are highlighted, but only the second is active.
    expect(highlighted(container)).toEqual(['pembelajaran', 'pembelajaran'])
    expect(activeHighlight(container)).toHaveLength(1)
  })

  it('reports zero when the query has no occurrences on the page', () => {
    const container = makeTextLayer(['kata', 'lain', 'tidak'])
    const result = applySearchHighlights(container, 'pembelajaran', 0, null)
    expect(result.occurrenceCount).toBe(0)
    expect(result.activeFound).toBe(false)
    expect(highlighted(container)).toEqual([])
  })

  it('clamps an out-of-range activeOccurrence to the last match', () => {
    const container = makeTextLayer(['kata', 'pembelajaran', 'lain'])
    const result = applySearchHighlights(container, 'pembelajaran', 99, null)
    expect(result.occurrenceCount).toBe(1)
    expect(result.activeFound).toBe(true)
  })
})
