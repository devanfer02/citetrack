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
} as const satisfies Partial<{ [K in ConfigKey]: ConfigValue<K> }>

export type PublicModeOverrideKey = keyof typeof PUBLIC_MODE_OVERRIDES

export function isOverridden(key: ConfigKey): key is PublicModeOverrideKey {
  return key in PUBLIC_MODE_OVERRIDES
}

// Surfaced in the public-mode privacy callout. Update once the repo
// goes live on GitHub.
export const CITETRACK_REPO_URL = 'https://github.com/TODO/citetrack'
