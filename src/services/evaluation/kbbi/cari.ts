import {
  KBBI_SOURCE_NAMES,
  KBBI_SOURCES,
  type KbbiSourceName,
} from '#/services/evaluation/kbbi/sources'
import type { KbbiParseResult } from '#/services/evaluation/kbbi/parsers/types'

export type CariResult = KbbiParseResult & { source: KbbiSourceName | null }

export type CariOptions = {
  sources?: KbbiSourceName[]
  signal?: AbortSignal
}

export async function cari(
  keyword: string,
  options: CariOptions = {},
): Promise<CariResult> {
  if (!keyword) throw new Error('Provide the keyword/kata kunci!')

  const order = options.sources?.length
    ? options.sources
    : [...KBBI_SOURCE_NAMES]

  for (const source of order) {
    if (options.signal?.aborted) throw options.signal.reason
    const handler = KBBI_SOURCES[source]
    if (!handler) continue

    try {
      const res = await fetch(handler.buildUrl(keyword), {
        ...handler.requestInit,
        signal: options.signal,
      })
      if (!res.ok) continue

      const html = await res.text()
      const parsed = handler.parse(html)
      if (parsed.lema || (parsed.arti && parsed.arti.length)) {
        return { ...parsed, source }
      }
    } catch (err) {
      if (options.signal?.aborted) throw err
      continue
    }
  }

  return { lema: null, arti: null, source: null }
}
