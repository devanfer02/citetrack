import { describe, expect, it } from 'vitest'
import { runEydRules } from '#/services/evaluation/eyd/rules'

// Per-rule unit coverage for runEydRules. Each rule gets at least one
// positive trigger and one FP guard. These run on raw strings without
// codeRanges/italicRanges — that interaction is exercised in the
// integration suite.

const ids = (text: string): string[] =>
  runEydRules(text).map((f) => f.ruleId)

const fired = (text: string, ruleId: string): boolean =>
  ids(text).includes(ruleId)

describe('eyd.double-space', () => {
  it('flags two spaces between words', () => {
    expect(fired('kata  berikutnya tertulis di sini.', 'eyd.double-space')).toBe(true)
  })
  it('does not flag a single space', () => {
    expect(fired('kata berikutnya tertulis di sini.', 'eyd.double-space')).toBe(false)
  })
})

describe('eyd.space-before-punct', () => {
  it('flags a 2+ space gap before a comma', () => {
    expect(fired('kalimat ini   , aneh sekali.', 'eyd.space-before-punct')).toBe(true)
  })
  // A single space before punctuation is a pdfjs extraction artifact (glyph
  // advance), not a typed error — "Sumber :" / "sendiri ." in captions. We
  // can't tell it from a real single-space typo on extracted text, so we don't
  // flag it. Document-agnostic guard; see KNOWLEDGE_BASE.md §2.0.
  it('does not flag a single space before punctuation (extraction artifact)', () => {
    expect(fired('Sumber : Anggraini', 'eyd.space-before-punct')).toBe(false)
    expect(fired('tertutup sendiri .', 'eyd.space-before-punct')).toBe(false)
  })
  it('skips TOC-style leader dots ("Bab 1 ............. 12")', () => {
    expect(
      fired('Bab 1 ............. 12', 'eyd.space-before-punct'),
    ).toBe(false)
  })
})

describe('eyd.missing-space-after-punct', () => {
  it('flags letters glued to a comma with no space', () => {
    expect(
      fired('penelitian,sehingga hasilnya valid.', 'eyd.missing-space-after-punct'),
    ).toBe(true)
  })
  it('does not flag a normal "word, word"', () => {
    expect(
      fired('penelitian, sehingga hasilnya valid.', 'eyd.missing-space-after-punct'),
    ).toBe(false)
  })
})

describe('eyd.repeated-punct', () => {
  it('flags repeated commas', () => {
    expect(fired('hasilnya jelas,, terlihat di tabel.', 'eyd.repeated-punct')).toBe(true)
  })
  it('does not flag a single comma', () => {
    expect(fired('hasilnya jelas, terlihat di tabel.', 'eyd.repeated-punct')).toBe(false)
  })
})

describe('eyd.repeated-period', () => {
  it('flags 2 dots', () => {
    expect(fired('selesai.. ', 'eyd.repeated-period')).toBe(true)
  })
  it('does not flag a single period', () => {
    expect(fired('selesai. ', 'eyd.repeated-period')).toBe(false)
  })
  it('does not flag exactly 3 dots (ellipsis)', () => {
    expect(fired('selesai... ', 'eyd.repeated-period')).toBe(false)
  })
})

describe('eyd.english-number-format', () => {
  it('flags English-style thousands separators', () => {
    expect(fired('biayanya 1,250 juta rupiah.', 'eyd.english-number-format')).toBe(true)
  })
  it('does not flag Indonesian-style 1.250', () => {
    expect(fired('biayanya 1.250 juta rupiah.', 'eyd.english-number-format')).toBe(false)
  })
})

describe('eyd.di-locative-one-word', () => {
  it('flags "dimana" as one word', () => {
    expect(fired('Tempat dimana semuanya terjadi.', 'eyd.di-locative-one-word')).toBe(true)
  })
  it('flags "diatas" as one word', () => {
    expect(fired('Letaknya diatas meja.', 'eyd.di-locative-one-word')).toBe(true)
  })
  it('does not flag correctly-separated "di atas"', () => {
    expect(fired('Letaknya di atas meja.', 'eyd.di-locative-one-word')).toBe(false)
  })
})

describe('eyd.kemana-one-word', () => {
  it('flags "kemana"', () => {
    expect(fired('Tidak tahu kemana harus pergi.', 'eyd.kemana-one-word')).toBe(true)
  })
  it('does not flag correctly-separated "ke mana"', () => {
    expect(fired('Tidak tahu ke mana harus pergi.', 'eyd.kemana-one-word')).toBe(false)
  })
})

describe('eyd.daripada-two-words', () => {
  it('flags "dari pada"', () => {
    expect(fired('Lebih besar dari pada yang diperkirakan.', 'eyd.daripada-two-words')).toBe(true)
  })
  it('does not flag correctly-merged "daripada"', () => {
    expect(fired('Lebih besar daripada yang diperkirakan.', 'eyd.daripada-two-words')).toBe(false)
  })
})

describe('eyd.kepada-two-words', () => {
  it('flags "ke pada"', () => {
    expect(fired('Surat ke pada direktur.', 'eyd.kepada-two-words')).toBe(true)
  })
  it('does not flag correctly-merged "kepada"', () => {
    expect(fired('Surat kepada direktur.', 'eyd.kepada-two-words')).toBe(false)
  })
})

describe('eyd.bagaimana-two-words', () => {
  it('flags "bagai mana"', () => {
    expect(fired('Tidak jelas bagai mana hasilnya.', 'eyd.bagaimana-two-words')).toBe(true)
  })
  it('does not flag correctly-merged "bagaimana"', () => {
    expect(fired('Tidak jelas bagaimana hasilnya.', 'eyd.bagaimana-two-words')).toBe(false)
  })
})

describe('eyd.ketika-two-words', () => {
  it('flags "ke tika"', () => {
    expect(fired('Hal itu terjadi ke tika hujan turun.', 'eyd.ketika-two-words')).toBe(true)
  })
  it('does not flag correctly-merged "ketika"', () => {
    expect(fired('Hal itu terjadi ketika hujan turun.', 'eyd.ketika-two-words')).toBe(false)
  })
})

describe('eyd.particle-lah-separated', () => {
  it('flags "kerja lah" with the particle separated', () => {
    expect(fired('Kerja lah dengan giat hari ini.', 'eyd.particle-lah-separated')).toBe(true)
  })
  it('does not flag correctly-attached "kerjalah"', () => {
    expect(fired('Kerjalah dengan giat hari ini.', 'eyd.particle-lah-separated')).toBe(false)
  })
})

describe('eyd.particle-pun-attached', () => {
  it('flags "siapapun" with pun attached', () => {
    expect(fired('Tidak siapapun yang tahu kebenarannya.', 'eyd.particle-pun-attached')).toBe(true)
  })
  it('skips fixed forms: walaupun, meskipun, adapun, maupun', () => {
    for (const word of ['walaupun', 'meskipun', 'adapun', 'maupun']) {
      expect(
        fired(`Itu benar ${word} hasilnya berbeda.`, 'eyd.particle-pun-attached'),
        `expected fixed form "${word}" to be skipped`,
      ).toBe(false)
    }
  })
})

describe('eyd.di-passive-split', () => {
  it('flags split "di gunakan" (di + common passive verb)', () => {
    expect(fired('Metode itu di gunakan luas.', 'eyd.di-passive-split')).toBe(true)
  })
  it('skips locative "di atas" / "di bawah" / "di dalam"', () => {
    for (const phrase of ['di atas', 'di bawah', 'di dalam']) {
      expect(
        fired(`Letaknya ${phrase} meja.`, 'eyd.di-passive-split'),
        `expected locative "${phrase}" to be skipped`,
      ).toBe(false)
    }
  })
})
