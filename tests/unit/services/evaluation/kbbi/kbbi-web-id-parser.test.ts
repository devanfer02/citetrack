import { describe, expect, it } from 'vitest'
import {
  parseKbbiWebId,
  parseKbbiWebIdEntries,
} from '#/services/evaluation/kbbi/parsers/kbbiWebId'

// Shape of the `…/ajax_submitxvs7k` JSON body: an array of {x,w,d} entries,
// the same shape kbbi.web.id used to embed in `textarea#jsdata`.
const foundBody = JSON.stringify([
  {
    x: 1,
    w: 'abadi',
    d: '<b>abadi</b> <em>a</em> kekal; tidak berkesudahan',
  },
])

describe('parseKbbiWebId (AJAX JSON body)', () => {
  it('extracts lemma and definition from a found entry', () => {
    const result = parseKbbiWebId(foundBody)
    expect(result.lema).toBe('abadi')
    expect(result.arti).toEqual(['kekal; tidak berkesudahan'])
  })

  it('returns null/null for an empty array (not found)', () => {
    expect(parseKbbiWebId('[]')).toEqual({ lema: null, arti: null })
  })

  it('filters out entries that are not the primary (x !== 1)', () => {
    const body = JSON.stringify([{ x: 0, w: 'x', d: '<b>x</b> def' }])
    expect(parseKbbiWebId(body)).toEqual({ lema: null, arti: null })
  })

  it('returns null/null on an empty body', () => {
    expect(parseKbbiWebId('')).toEqual({ lema: null, arti: null })
  })

  it('returns null/null on malformed JSON', () => {
    expect(parseKbbiWebId('not-json')).toEqual({ lema: null, arti: null })
  })

  it('returns null/null when the body is a JSON object, not an array', () => {
    expect(parseKbbiWebId('{"error":"x"}')).toEqual({ lema: null, arti: null })
  })
})

describe('parseKbbiWebIdEntries (array core)', () => {
  it('sorts homonyms by <sup> number and uses the first', () => {
    const result = parseKbbiWebIdEntries([
      { x: 1, w: 'bisa<sup>2</sup>', d: '<b>bisa</b> <em>a</em> dapat' },
      { x: 1, w: 'bisa<sup>1</sup>', d: '<b>bisa</b> <em>n</em> zat racun' },
    ])
    expect(result.lema).toBe('bisa')
    expect(result.arti).toEqual(['zat racun'])
  })
})
