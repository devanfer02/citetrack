import { parse } from 'node-html-parser'
import { normalizeText } from '#/services/evaluation/kbbi/utils/normalize'
import type { KbbiParser } from '#/services/evaluation/kbbi/parsers/types'

export const parseKbbiCoId: KbbiParser = (html) => {
  const document = parse(html)
  const head = document.querySelector('.xwell h2.arti')
  const definition = document.querySelector('.xwell .arti > p')

  if (!head || !definition) return { lema: null, arti: null }

  let lema = normalizeText(head.textContent.replace('🔊', ''))
  const firstBold = definition.querySelector('b')
  if (firstBold?.textContent) {
    lema = normalizeText(firstBold.textContent)
  }

  const raw = definition.innerHTML
  const parts = raw
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .split('\n')
    .map((part) => part.trim())
    .filter(Boolean)

  const arti = parts
    .map((part) => normalizeText(parse(`<div>${part}</div>`).textContent))
    .filter((definisi) => definisi.length)

  return { lema, arti: arti.length ? arti : null }
}
