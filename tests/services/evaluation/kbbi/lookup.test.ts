import { describe, expect, it } from 'vitest'
import { stripAffixesForTest } from '#/services/evaluation/kbbi/lookup'

describe('stripAffixes — meN- allomorph for vowel-initial bases', () => {
  it('mengeksekusi → eksekusi (meng + vowel)', () => {
    expect(stripAffixesForTest('mengeksekusi')).toContain('eksekusi')
  })

  it('mengambil → ambil (meng + vowel)', () => {
    expect(stripAffixesForTest('mengambil')).toContain('ambil')
  })

  it('menginstalasi → instalasi (meng + vowel)', () => {
    expect(stripAffixesForTest('menginstalasi')).toContain('instalasi')
  })

  it('menyusun → susun (meny + vowel, restore s)', () => {
    expect(stripAffixesForTest('menyusun')).toContain('susun')
  })

  it('menyunting → sunting (meny + vowel, restore s)', () => {
    expect(stripAffixesForTest('menyunting')).toContain('sunting')
  })
})

describe('stripAffixes — existing consonant-base rules unchanged', () => {
  it('mendapat → dapat (men + consonant)', () => {
    expect(stripAffixesForTest('mendapat')).toContain('dapat')
  })

  it('membeli → beli (mem + b)', () => {
    expect(stripAffixesForTest('membeli')).toContain('beli')
  })

  it('berjalan → jalan (ber + consonant)', () => {
    expect(stripAffixesForTest('berjalan')).toContain('jalan')
  })

  it('dipakai → pakai (di + consonant)', () => {
    expect(stripAffixesForTest('dipakai')).toContain('pakai')
  })
})
