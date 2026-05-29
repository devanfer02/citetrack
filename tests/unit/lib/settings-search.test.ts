import { describe, expect, it } from 'vitest'
import {
  meaningfulTokens,
  rankByQuery,
  scoreMatch,
  tokenizeQuery,
} from '#/lib/settings-search'

describe('tokenizeQuery', () => {
  it('lowercases, splits on punctuation, drops 1-char tokens', () => {
    const t = tokenizeQuery('Ubah Ukuran-Unggah (MB)! a')
    expect(t).toEqual(['ubah', 'ukuran', 'unggah', 'mb'])
  })

  it('keeps alphanumeric tokens like e5 and 429', () => {
    expect(tokenizeQuery('model e5 error 429')).toEqual([
      'model',
      'e5',
      'error',
      '429',
    ])
  })
})

describe('meaningfulTokens', () => {
  it('drops bilingual filler words', () => {
    expect(meaningfulTokens('bagaimana cara ubah ukuran unggah')).toEqual([
      'ubah',
      'ukuran',
      'unggah',
    ])
    expect(meaningfulTokens('how do i change upload size')).toEqual([
      'change',
      'upload',
      'size',
    ])
  })

  it('falls back to raw tokens when the query is only filler', () => {
    expect(meaningfulTokens('bagaimana cara')).toEqual(['bagaimana', 'cara'])
  })
})

describe('scoreMatch', () => {
  it('counts how many tokens appear in the haystack', () => {
    const hay = 'upload.max_file_size_bytes ukuran unggah maksimum mb upload size'
    expect(scoreMatch('ukuran unggah', hay)).toBe(2)
    expect(scoreMatch('upload size', hay)).toBe(2)
    expect(scoreMatch('lama simpan riwayat', hay)).toBe(0)
  })
})

const rows = [
  { code: 'upload', hay: 'upload ukuran unggah file size mb maksimum' },
  { code: 'purge', hay: 'purge lama simpan riwayat retensi retention days' },
  { code: 'autofetch', hay: 'autofetch unduh paralel concurrency download' },
]
const getHay = (r: { hay: string }) => r.hay

describe('rankByQuery', () => {
  it('returns only matching rows, highest score first', () => {
    const ranked = rankByQuery('ukuran unggah file', rows, getHay)
    expect(ranked.map((r) => r.code)).toEqual(['upload'])
  })

  it('finds the right card for a natural-language question', () => {
    const ranked = rankByQuery(
      'bagaimana cara mengatur lama simpan riwayat',
      rows,
      getHay,
    )
    expect(ranked[0]?.code).toBe('purge')
  })

  it('returns an empty list when nothing matches', () => {
    expect(rankByQuery('warna tema gelap', rows, getHay)).toEqual([])
  })

  it('returns an empty list for an empty query', () => {
    expect(rankByQuery('', rows, getHay)).toEqual([])
  })
})
