import { parse } from 'node-html-parser'
import { normalizeText } from '#/services/evaluation/kbbi/utils/normalize'
import type { KbbiParser } from '#/services/evaluation/kbbi/parsers/types'

export const parseKbbiKemendikdasmen: KbbiParser = (html) => {
  const document = parse(html)
  const head = document.querySelector('.body-content h2')
  const list = document.querySelector('.body-content ol')

  if (!head || !list) return { lema: null, arti: null }

  const lema = normalizeText(head.textContent)
  const arti = list
    .querySelectorAll('li')
    .map((item) => normalizeText(item.textContent))
    .filter((definisi) => definisi.length)

  return { lema: lema || null, arti: arti.length ? arti : null }
}
