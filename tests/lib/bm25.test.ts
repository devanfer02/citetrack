import { describe, expect, it } from 'vitest'
import { buildIndex, rank, tokenize } from '#/lib/bm25'

describe('tokenize', () => {
  it('lowercases, strips punctuation, drops short tokens', () => {
    const t = tokenize('The TCP/IP, model! has 7 layers.')
    expect(t).toContain('tcp')
    expect(t).toContain('ip')
    expect(t).toContain('model')
    expect(t).not.toContain('the')
  })

  it('drops Indonesian stopwords', () => {
    const t = tokenize('Ini adalah model TCP yang dan atau')
    expect(t).not.toContain('ini')
    expect(t).not.toContain('adalah')
    expect(t).not.toContain('yang')
    expect(t).toContain('model')
    expect(t).toContain('tcp')
  })
})

describe('buildIndex + rank', () => {
  const docs = [
    'The TCP/IP model has four layers for networking',
    'OSI reference model has seven layers for networking',
    'Quantum computing uses qubits and superposition',
  ]

  it('ranks the TCP/IP document first for TCP query', () => {
    const index = buildIndex(docs)
    const r = rank(index, 'TCP IP four layers')
    expect(r[0].docIdx).toBe(0)
  })

  it('ranks the OSI document first for OSI query', () => {
    const index = buildIndex(docs)
    const r = rank(index, 'OSI seven reference layers')
    expect(r[0].docIdx).toBe(1)
  })

  it('returns empty ranks when no query term overlaps the corpus', () => {
    const index = buildIndex(docs)
    const r = rank(index, 'banana smoothie recipe')
    expect(r.length).toBe(0)
  })

  it('handles empty corpus without throwing', () => {
    const index = buildIndex([])
    expect(rank(index, 'anything').length).toBe(0)
  })
})
