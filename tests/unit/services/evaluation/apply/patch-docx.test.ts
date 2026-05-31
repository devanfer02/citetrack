import { describe, expect, it } from 'vitest'
import { emptyChangeLog } from '#/services/evaluation/apply/change-log'
import {
  parseParts,
  patchDocumentXml,
  serializeParts,
} from '#/services/evaluation/apply/patch-docx'
import { makeFinding } from './helpers'

function textOf(xml: string): string {
  return [...xml.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)]
    .map((m) => m[1])
    .join('')
}

describe('parseParts / serializeParts', () => {
  it('round-trips xml with entities unchanged when no edits apply', () => {
    const xml = `<w:p><w:r><w:t xml:space="preserve">a &lt;b&gt; &amp; c</w:t></w:r></w:p>`
    expect(serializeParts(parseParts(xml))).toBe(xml)
  })
})

describe('patchDocumentXml', () => {
  it('replaces a token contained in a single run', () => {
    const xml = `<w:t>Saya pergi kemana saja</w:t>`
    const log = emptyChangeLog()
    const out = patchDocumentXml(
      xml,
      [makeFinding({ token: 'kemana', suggestion: 'ke mana', excerpt: 'pergi kemana saja' })],
      log,
    )
    expect(textOf(out)).toBe('Saya pergi ke mana saja')
    expect(log.applied).toHaveLength(1)
  })

  it('replaces a token split across two runs', () => {
    const xml = `<w:r><w:t>pergi keman</w:t></w:r><w:r><w:t>a saja</w:t></w:r>`
    const log = emptyChangeLog()
    const out = patchDocumentXml(
      xml,
      [makeFinding({ token: 'kemana', suggestion: 'ke mana', excerpt: 'pergi kemana saja' })],
      log,
    )
    expect(textOf(out)).toBe('pergi ke mana saja')
    expect(log.applied).toHaveLength(1)
  })

  it('uses the excerpt to choose between repeated tokens', () => {
    const xml = `<w:t>di rumah dan di rumah sakit</w:t>`
    const log = emptyChangeLog()
    const out = patchDocumentXml(
      xml,
      [makeFinding({ token: 'rumah', suggestion: 'RUMAH', excerpt: 'dan di rumah sakit' })],
      log,
    )
    expect(textOf(out)).toBe('di rumah dan di RUMAH sakit')
  })

  it('records a token absent from the document as unlocated', () => {
    const log = emptyChangeLog()
    const out = patchDocumentXml(
      `<w:t>halo dunia</w:t>`,
      [makeFinding({ token: 'kucing', suggestion: 'anjing' })],
      log,
    )
    expect(textOf(out)).toBe('halo dunia')
    expect(log.applied).toHaveLength(0)
    expect(log.unlocated[0]?.reason).toBe('tidak ditemukan di dokumen')
  })

  it('preserves xml entities outside the edited span', () => {
    const xml = `<w:t>nilai a&lt;b dan dua  spasi</w:t>`
    const log = emptyChangeLog()
    const out = patchDocumentXml(
      xml,
      [makeFinding({ token: 'dua  spasi', suggestion: 'dua spasi', excerpt: 'b dan dua spasi' })],
      log,
    )
    expect(out).toContain('a&lt;b')
    // textOf reads raw xml without decoding, so the < entity stays encoded.
    expect(textOf(out)).toBe('nilai a&lt;b dan dua spasi')
  })
})
