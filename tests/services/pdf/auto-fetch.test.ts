import { describe, expect, it } from 'vitest'
import { looksLikePdfBuffer } from '#/services/pdf/auto-fetch'

const bytes = (...values: number[]): Uint8Array => new Uint8Array(values)

describe('looksLikePdfBuffer', () => {
  it('accepts a real PDF magic header (%PDF)', () => {
    expect(looksLikePdfBuffer(bytes(0x25, 0x50, 0x44, 0x46, 0x2d, 0x31))).toBe(true)
  })

  it('rejects an HTML payload (<!DO...)', () => {
    expect(looksLikePdfBuffer(bytes(0x3c, 0x21, 0x44, 0x4f, 0x43))).toBe(false)
  })

  it('rejects a plain-text payload', () => {
    expect(looksLikePdfBuffer(bytes(0x48, 0x65, 0x6c, 0x6c, 0x6f))).toBe(false) // "Hello"
  })

  it('rejects buffers shorter than 4 bytes', () => {
    expect(looksLikePdfBuffer(bytes(0x25, 0x50, 0x44))).toBe(false)
    expect(looksLikePdfBuffer(bytes())).toBe(false)
  })

  it('rejects a near-miss (right length, wrong bytes)', () => {
    expect(looksLikePdfBuffer(bytes(0x25, 0x50, 0x44, 0x47))).toBe(false) // %PDG
    expect(looksLikePdfBuffer(bytes(0x26, 0x50, 0x44, 0x46))).toBe(false) // &PDF
  })
})
