import { parseKbbiCoId } from '#/services/evaluation/kbbi/parsers/kbbiCoId'
import { parseKbbiKemendikdasmen } from '#/services/evaluation/kbbi/parsers/kbbiKemendikdasmen'
import { parseKbbiWebId } from '#/services/evaluation/kbbi/parsers/kbbiWebId'
import { parseTypoOnline } from '#/services/evaluation/kbbi/parsers/typoOnline'
import type { KbbiParser } from '#/services/evaluation/kbbi/parsers/types'

export const KBBI_SOURCE_NAMES = [
  'kbbi.kemendikdasmen.go.id',
  'kbbi.web.id',
  'typoonline.com',
  'kbbi.co.id',
] as const

export type KbbiSourceName = (typeof KBBI_SOURCE_NAMES)[number]

export type KbbiSource = {
  buildUrl: (keyword: string) => string
  parse: KbbiParser
  requestInit?: RequestInit
}

export const KBBI_SOURCES: Record<KbbiSourceName, KbbiSource> = {
  'kbbi.kemendikdasmen.go.id': {
    buildUrl: (keyword) =>
      `https://kbbi.kemendikdasmen.go.id/entri/${encodeURIComponent(keyword)}`,
    parse: parseKbbiKemendikdasmen,
  },
  'kbbi.web.id': {
    buildUrl: (keyword) => `https://kbbi.web.id/${encodeURIComponent(keyword)}`,
    parse: parseKbbiWebId,
  },
  'typoonline.com': {
    buildUrl: (keyword) =>
      `https://typoonline.com/kbbi/${encodeURIComponent(keyword)}`,
    parse: parseTypoOnline,
    requestInit: {
      headers: {
        'user-agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'accept-language': 'id-ID,id;q=0.9,en;q=0.8',
      },
    },
  },
  'kbbi.co.id': {
    buildUrl: (keyword) =>
      `https://kbbi.co.id/arti-kata/${encodeURIComponent(keyword)}`,
    parse: parseKbbiCoId,
  },
}
