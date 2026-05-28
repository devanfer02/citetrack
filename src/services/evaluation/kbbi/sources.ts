import { parseKbbiCoId } from '#/services/evaluation/kbbi/parsers/kbbiCoId'
import { parseKbbiKemendikdasmen } from '#/services/evaluation/kbbi/parsers/kbbiKemendikdasmen'
import { parseKbbiRaf555 } from '#/services/evaluation/kbbi/parsers/kbbiRaf555'
import { parseKbbiWebId } from '#/services/evaluation/kbbi/parsers/kbbiWebId'
import { parseTypoOnline } from '#/services/evaluation/kbbi/parsers/typoOnline'
import type { KbbiParser } from '#/services/evaluation/kbbi/parsers/types'

export const KBBI_SOURCE_NAMES = [
  'kbbi.kemendikdasmen.go.id',
  'kbbi.web.id',
  'typoonline.com',
  'kbbi.co.id',
  'kbbi.raf555.dev',
] as const

export type KbbiSourceName = (typeof KBBI_SOURCE_NAMES)[number]

export type KbbiSource = {
  buildUrl: (keyword: string) => string
  parse: KbbiParser
  requestInit: RequestInit
}

const BROWSER_HEADERS: Record<string, string> = {
  'user-agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'accept-language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
  'accept-encoding': 'gzip, deflate, br',
  'cache-control': 'no-cache',
  pragma: 'no-cache',
  'sec-fetch-dest': 'document',
  'sec-fetch-mode': 'navigate',
  'sec-fetch-site': 'none',
  'sec-fetch-user': '?1',
  'upgrade-insecure-requests': '1',
}

const headersFor = (referer: string): Record<string, string> => ({
  ...BROWSER_HEADERS,
  referer,
})

export const KBBI_SOURCES: Record<KbbiSourceName, KbbiSource> = {
  'kbbi.kemendikdasmen.go.id': {
    buildUrl: (keyword) =>
      `https://kbbi.kemendikdasmen.go.id/entri/${encodeURIComponent(keyword)}`,
    parse: parseKbbiKemendikdasmen,
    requestInit: {
      headers: headersFor('https://kbbi.kemendikdasmen.go.id/'),
    },
  },
  'kbbi.web.id': {
    buildUrl: (keyword) => `https://kbbi.web.id/${encodeURIComponent(keyword)}`,
    parse: parseKbbiWebId,
    requestInit: {
      headers: headersFor('https://kbbi.web.id/'),
    },
  },
  'typoonline.com': {
    buildUrl: (keyword) =>
      `https://typoonline.com/kbbi/${encodeURIComponent(keyword)}`,
    parse: parseTypoOnline,
    requestInit: {
      headers: headersFor('https://typoonline.com/'),
    },
  },
  'kbbi.co.id': {
    buildUrl: (keyword) =>
      `https://kbbi.co.id/arti-kata/${encodeURIComponent(keyword)}`,
    parse: parseKbbiCoId,
    requestInit: {
      headers: headersFor('https://kbbi.co.id/'),
    },
  },
  'kbbi.raf555.dev': {
    buildUrl: (keyword) =>
      `https://kbbi.raf555.dev/api/v1/entry/${encodeURIComponent(keyword)}`,
    parse: parseKbbiRaf555,
    requestInit: {
      headers: {
        accept: 'application/json',
        'user-agent': 'citetrack/1.0 (+https://github.com/devanfer/citetrack)',
      },
    },
  },
}
