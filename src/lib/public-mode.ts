import { env } from '#/env'
import type { ConfigKey, ConfigValue } from '#/lib/configurations'

export const isPublicMode = env.PUBLIC_MODE
export const isPublicModeClient = env.VITE_PUBLIC_MODE

// Values that are forced when PUBLIC_MODE=true, regardless of what the
// DB configurations table says. Applied at read time inside getConfig,
// so DB rows stay untouched and flipping the flag back to false
// restores normal behaviour with no migration.
export const PUBLIC_MODE_OVERRIDES = {
  'passage.embedding_model': 'none',
  'upload.max_file_size_bytes': 10 * 1024 * 1024,
  'autofetch.concurrency': 2,
  'purge.retention_days': 1,
  // Demo runs lean on the local KBBI dump + cache only — no scraping out to
  // the external sources, so spell-checking stays fast and never blocks on a
  // rate-limited third party.
  'kbbi.local_only': 1,
} as const satisfies Partial<{ [K in ConfigKey]: ConfigValue<K> }>

export type PublicModeOverrideKey = keyof typeof PUBLIC_MODE_OVERRIDES

export function isOverridden(key: ConfigKey): key is PublicModeOverrideKey {
  return key in PUBLIC_MODE_OVERRIDES
}
