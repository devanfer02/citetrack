import { normalizeText } from '#/services/evaluation/kbbi/utils/normalize'
import type {
  KbbiParser,
  KbbiParseResult,
} from '#/services/evaluation/kbbi/parsers/types'

export type KbbiWebIdEntry = { w: string; d: string; x: number }

const extractSupNumber = (item: KbbiWebIdEntry): number => {
  const supMatch = item.w.match(/<sup>(.*?)<\/sup>/)
  if (supMatch) return Number.parseInt(supMatch[1], 10)
  return 0
}

// Core entry-array handling, shared by the AJAX fetch path. kbbi.web.id used to
// embed this same `{x,w,d}` array in a `textarea#jsdata` element; the live site
// now serves an empty shell and returns the array over AJAX instead, so the
// fetch path JSON-parses the response body and calls this directly.
export const parseKbbiWebIdEntries = (
  entries: readonly KbbiWebIdEntry[],
): KbbiParseResult => {
  const data = entries.filter((d) => d.x === 1)
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

// `raw` is the JSON body returned by `…/ajax_submitxvs7k` — an array of
// `{x,w,d}` entries (or `{ x:0 }` / empty for "not found"). Tolerant of a
// bare array or malformed/empty bodies.
export const parseKbbiWebId: KbbiParser = (raw) => {
  if (!raw.trim().length) return { lema: null, arti: null }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { lema: null, arti: null }
  }
  if (!Array.isArray(parsed)) return { lema: null, arti: null }
  return parseKbbiWebIdEntries(parsed as KbbiWebIdEntry[])
}
