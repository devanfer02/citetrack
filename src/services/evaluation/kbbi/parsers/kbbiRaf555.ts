import { normalizeText } from '#/services/evaluation/kbbi/utils/normalize'
import type {
  KbbiParser,
  KbbiParseResult,
} from '#/services/evaluation/kbbi/parsers/types'

type Raf555Definition = {
  definition?: string
}

type Raf555Entry = {
  definitions?: Raf555Definition[]
}

type Raf555Response = {
  lemma?: string
  entries?: Raf555Entry[]
  message?: string
}

const isResponse = (value: unknown): value is Raf555Response =>
  typeof value === 'object' && value !== null

export const parseKbbiRaf555: KbbiParser = (body) => {
  const empty: KbbiParseResult = { lema: null, arti: null }
  if (!body) return empty

  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    return empty
  }

  if (!isResponse(parsed)) return empty
  if (typeof parsed.lemma !== 'string' || !parsed.lemma.trim()) return empty

  const lema = normalizeText(parsed.lemma)
  const definitions: string[] = []
  for (const entry of parsed.entries ?? []) {
    for (const def of entry.definitions ?? []) {
      if (typeof def.definition !== 'string') continue
      const text = normalizeText(def.definition)
      if (text.length) definitions.push(text)
    }
  }

  return {
    lema: lema.length ? lema : null,
    arti: definitions.length ? definitions : null,
  }
}
