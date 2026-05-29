import { describe, expect, it } from 'vitest'
import { filenameFromContentDisposition } from '#/lib/download'

describe('filenameFromContentDisposition', () => {
  it('returns the fallback when the header is null', () => {
    expect(filenameFromContentDisposition(null, 'fallback.pdf')).toBe(
      'fallback.pdf',
    )
  })

  it('extracts a quoted filename', () => {
    expect(
      filenameFromContentDisposition(
        'attachment; filename="laporan evaluasi.pdf"',
        'fallback.pdf',
      ),
    ).toBe('laporan evaluasi.pdf')
  })

  it('extracts an unquoted filename', () => {
    expect(
      filenameFromContentDisposition(
        'attachment; filename=report.xlsx',
        'fallback.pdf',
      ),
    ).toBe('report.xlsx')
  })

  it('percent-decodes the filename', () => {
    expect(
      filenameFromContentDisposition(
        'attachment; filename="skripsi%20bab%201.pdf"',
        'fallback.pdf',
      ),
    ).toBe('skripsi bab 1.pdf')
  })

  it('falls back when the header has no filename token', () => {
    expect(
      filenameFromContentDisposition('attachment', 'fallback.pdf'),
    ).toBe('fallback.pdf')
  })

  it('stops at the filename when other parameters follow', () => {
    expect(
      filenameFromContentDisposition(
        'attachment; filename=report.xlsx; size=1234',
        'fallback.pdf',
      ),
    ).toBe('report.xlsx')
  })

  it('returns the raw filename when percent-decoding fails', () => {
    expect(
      filenameFromContentDisposition(
        'attachment; filename="bad%E0%A4%A.pdf"',
        'fallback.pdf',
      ),
    ).toBe('bad%E0%A4%A.pdf')
  })
})
