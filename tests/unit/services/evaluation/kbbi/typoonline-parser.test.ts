import { describe, expect, it } from 'vitest'
import { parseTypoOnline } from '#/services/evaluation/kbbi/parsers/typoOnline'

// Verbatim fragment captured from https://typoonline.com/api-kbbi/rumah (the
// XHR endpoint). Unlike the full page, it has no `#textres` wrapper — the entry
// sits directly in a `head-kata` span + `b.key`.
const foundFragment =
  "<span class='head-kata'><h2>Definisi atau arti kata <b>rumah</b> berdasarkan KBBI Online:</h2> </span><b><b class='key'>rumah</b></b> /<b>ru·mah</b>/ <i>n</i> <b>1</b> bangunan untuk tempat tinggal; <b>2</b> bangunan pd umumnya (spt gedung);<br><br>• rumah gedang"

const notFoundFragment = 'Kata zxqwerty tidak ditemukan'

describe('parseTypoOnline (api-kbbi fragment, no #textres wrapper)', () => {
  it('extracts the lemma and definition from a found fragment', () => {
    const result = parseTypoOnline(foundFragment)
    expect(result.lema).toBe('rumah')
    expect(result.arti).not.toBeNull()
    expect(result.arti?.[0]).toContain('bangunan untuk tempat tinggal')
  })

  it('returns null/null for a "tidak ditemukan" fragment', () => {
    expect(parseTypoOnline(notFoundFragment)).toEqual({
      lema: null,
      arti: null,
    })
  })
})
