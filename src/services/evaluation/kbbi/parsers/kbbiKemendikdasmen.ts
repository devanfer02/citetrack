import { parse } from 'node-html-parser'
import { normalizeText } from '#/services/evaluation/kbbi/utils/normalize'
import type { KbbiParser } from '#/services/evaluation/kbbi/parsers/types'

const REDIRECT_RE = /^[→↦⇨⇒➡]\s*\S/u

export const parseKbbiKemendikdasmen: KbbiParser = (html) => {
  const document = parse(html)
  const head = document.querySelector('.body-content h2')
  const list =
    document.querySelector('.body-content ol') ??
    document.querySelector('.body-content ul.adjusted-par')

  if (!head || !list) return { lema: null, arti: null }

  const lema = normalizeText(head.textContent)
  const definitions = list
    .querySelectorAll('li')
    .map((item) => normalizeText(item.textContent))
    .filter((definisi) => definisi.length && !REDIRECT_RE.test(definisi))

  if (!definitions.length) return { lema: null, arti: null }

  return { lema: lema || null, arti: definitions }
}
