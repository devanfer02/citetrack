import { parse } from 'node-html-parser'
import { normalizeText } from '#/services/evaluation/kbbi/utils/normalize'
import type {
  KbbiParser,
  KbbiParseResult,
} from '#/services/evaluation/kbbi/parsers/types'

type KbbiWebIdEntry = { w: string; d: string; x: number }

const extractSupNumber = (item: KbbiWebIdEntry): number => {
  const supMatch = item.w.match(/<sup>(.*?)<\/sup>/)
  if (supMatch) return Number.parseInt(supMatch[1], 10)
  return 0
}

export const parseKbbiWebId: KbbiParser = (html) => {
  const document = parse(html)
  const jsonData =
    document.querySelector('textarea#jsdata')?.textContent || ''

  if (!jsonData.length) return { lema: null, arti: null }

  const data = (JSON.parse(jsonData) as KbbiWebIdEntry[]).filter(
    (d) => d.x === 1,
  )
  data.sort((a, b) => extractSupNumber(a) - extractSupNumber(b))

  const result: KbbiParseResult = { lema: null, arti: null }

  data.forEach((item, index) => {
    const text = item.d
      .replace(/&#183;/g, '.')
      .split('<br/>')
      .filter((x) => x.length)

    text.forEach((t, i) => {
      const bold = t.match(/<b>(.*?)<\/b>/g)
      if (bold && bold[0] && !index && !i) {
        const mainHighlight = bold[0]
          .replace(/<sup>(.*?)<\/sup>/g, '')
          .replace(/<b>|<\/b>/g, '')
        result.lema = normalizeText(mainHighlight)

        const allArti = t
          .replace(bold[0], '')
          .replace(/<em>(n|v|a)<\/em>/g, '')
          .trim()
        const arti = allArti
          .split(/<b>(.*?)<\/b>/g)
          .filter((_, splitIdx) => splitIdx % 2 === 0)
          .map((definisi) =>
            normalizeText(
              definisi
                .replace(/<em>(.*?)<\/em>/g, '$1')
                .replace(/<b>(.*?)<\/b>/g, '$1'),
            ),
          )
          .filter((definisi) => definisi.length)

        result.arti = arti.length ? arti : null
      }
    })
  })

  return result
}
