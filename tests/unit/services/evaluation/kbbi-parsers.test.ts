import { describe, expect, it } from 'vitest'
import { parseKbbiRaf555 } from '#/services/evaluation/kbbi/parsers/kbbiRaf555'

describe('parseKbbiRaf555', () => {
  it('extracts lemma and flattened definitions from a real response', () => {
    const body = JSON.stringify({
      lemma: 'abadi',
      entries: [
        {
          entry: 'a.ba.di',
          definitions: [
            {
              definition: 'kekal; tidak berkesudahan',
              labels: [{ code: 'a' }],
              usageExamples: [],
            },
          ],
        },
      ],
    })
    const result = parseKbbiRaf555(body)
    expect(result.lema).toBe('abadi')
    expect(result.arti).toEqual(['kekal; tidak berkesudahan'])
  })

  it('flattens multiple entries and definitions in order', () => {
    const body = JSON.stringify({
      lemma: 'abad',
      entries: [
        {
          definitions: [
            { definition: 'masa seratus tahun' },
            { definition: 'zaman' },
          ],
        },
        {
          definitions: [{ definition: 'masa yang kekal' }],
        },
      ],
    })
    const result = parseKbbiRaf555(body)
    expect(result.lema).toBe('abad')
    expect(result.arti).toEqual([
      'masa seratus tahun',
      'zaman',
      'masa yang kekal',
    ])
  })

  it('returns null/null on the 404 error shape', () => {
    const body = JSON.stringify({ message: 'lemma not found' })
    expect(parseKbbiRaf555(body)).toEqual({ lema: null, arti: null })
  })

  it('returns null/null on malformed JSON', () => {
    expect(parseKbbiRaf555('not-json')).toEqual({ lema: null, arti: null })
  })

  it('returns null/null on empty body', () => {
    expect(parseKbbiRaf555('')).toEqual({ lema: null, arti: null })
  })

  it('drops empty definition strings', () => {
    const body = JSON.stringify({
      lemma: 'foo',
      entries: [
        {
          definitions: [
            { definition: '   ' },
            { definition: 'valid def' },
            { definition: '' },
          ],
        },
      ],
    })
    const result = parseKbbiRaf555(body)
    expect(result.lema).toBe('foo')
    expect(result.arti).toEqual(['valid def'])
  })
})
