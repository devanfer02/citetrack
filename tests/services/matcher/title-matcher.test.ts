import { describe, expect, it } from 'vitest'
import {
  pickBestReference,
  type TitleCandidate,
} from '#/services/matcher/title-matcher'

const candidates: TitleCandidate[] = [
  {
    referenceId: 1,
    author: 'Tanenbaum',
    year: '2021',
    title: 'Computer Networks',
  },
  {
    referenceId: 2,
    author: 'Silberschatz',
    year: '2019',
    title: 'Operating System Concepts',
  },
  {
    referenceId: 3,
    author: 'Stallings',
    year: '2017',
    title: 'Cryptography and Network Security',
  },
]

describe('pickBestReference', () => {
  it('picks the best match by title when PDF title matches closely', () => {
    const r = pickBestReference(
      'Computer Networks by Andrew S Tanenbaum Sixth Edition',
      '',
      candidates,
    )
    expect(r.referenceId).toBe(1)
    expect(r.confidence).toBeGreaterThan(0.35)
  })

  it('falls back to first-page text when pdf title is empty', () => {
    const r = pickBestReference(
      '',
      'Operating System Concepts Ninth Edition Silberschatz Galvin Gagne Wiley 2019',
      candidates,
    )
    expect(r.referenceId).toBe(2)
  })

  it('returns null when nothing matches confidently', () => {
    const r = pickBestReference(
      'Cooking Recipes for the Home Chef',
      '',
      candidates,
    )
    expect(r.referenceId).toBeNull()
    expect(r.confidence).toBeLessThan(0.35)
  })

  it('returns null on empty candidates', () => {
    const r = pickBestReference('Anything', 'Anything', [])
    expect(r.referenceId).toBeNull()
  })

  it('returns null on empty input', () => {
    const r = pickBestReference('', '', candidates)
    expect(r.referenceId).toBeNull()
  })
})
