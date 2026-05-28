import type { ConfigKey } from '#/lib/configurations'
import { getConfig } from '#/services/configurations-cache'
import { parseKbbiCoId } from '#/services/evaluation/kbbi/parsers/kbbiCoId'
import { parseKbbiKemendikdasmen } from '#/services/evaluation/kbbi/parsers/kbbiKemendikdasmen'
import { parseKbbiRaf555 } from '#/services/evaluation/kbbi/parsers/kbbiRaf555'
import { parseKbbiWebId } from '#/services/evaluation/kbbi/parsers/kbbiWebId'
import { parseTypoOnline } from '#/services/evaluation/kbbi/parsers/typoOnline'
import type { KbbiParser } from '#/services/evaluation/kbbi/parsers/types'
import { fetchKbbiWebIdEntry } from '#/services/evaluation/kbbi/sources/kbbi-web-id-fetch'
import { headersFor } from '#/services/evaluation/kbbi/utils/browser-headers'

export const KBBI_SOURCE_NAMES = [
  'kbbi.kemendikdasmen.go.id',
  'kbbi.web.id',
  'typoonline.com',
  'kbbi.co.id',
  'kbbi.raf555.dev',
] as const

export type KbbiSourceName = (typeof KBBI_SOURCE_NAMES)[number]

// Result of a custom per-source request flow (web.id AJAX, typoonline impit).
export type KbbiFetchOutcome = {
  // Raw payload to hand to parse(): JSON string (web.id) or HTML fragment (typoonline).
  raw: string | null
  // The source responded conclusively, so a null parse means a real "not found".
  attempted: boolean
  // The source was rate-limited / unreachable, so a null parse is inconclusive.
  rateLimited: boolean
}

export type KbbiSource = {
  parse: KbbiParser
  // Default path (loggedFetch(buildUrl) → res.text() → parse):
  buildUrl?: (keyword: string) => string
  requestInit?: RequestInit
  // Custom path. When present, cari.ts calls this instead of the default flow.
  fetchEntry?: (
    keyword: string,
    signal?: AbortSignal,
  ) => Promise<KbbiFetchOutcome>
}

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
    parse: parseKbbiWebId,
    fetchEntry: fetchKbbiWebIdEntry,
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

// Map a KBBI source name to its `kbbi.source.*` toggle key in configurations.
// Keeping this on the same module so adding a source is a one-stop change.
const SOURCE_TOGGLE_KEY: Record<KbbiSourceName, ConfigKey> = {
  'kbbi.kemendikdasmen.go.id': 'kbbi.source.kemendikdasmen',
  'kbbi.web.id': 'kbbi.source.web_id',
  'typoonline.com': 'kbbi.source.typoonline',
  'kbbi.co.id': 'kbbi.source.co_id',
  'kbbi.raf555.dev': 'kbbi.source.raf555',
}

// Hard floor used when the user has disabled every source. Returning [] would
// silently skip all external verification, which is almost certainly a config
// mistake rather than intent — so we keep one always-on safety source.
const FALLBACK_SOURCE: KbbiSourceName = 'kbbi.web.id'

export async function getEnabledKbbiSources(): Promise<KbbiSourceName[]> {
  const enabled: KbbiSourceName[] = []
  for (const name of KBBI_SOURCE_NAMES) {
    const toggle = SOURCE_TOGGLE_KEY[name]
    const on = await getConfig(toggle)
    if (on === 1) enabled.push(name)
  }
  return enabled.length ? enabled : [FALLBACK_SOURCE]
}
