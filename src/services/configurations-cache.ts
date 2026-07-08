import { eq } from 'drizzle-orm'
import { db } from '#/db'
import { configurations } from '#/db/schema'
import {
  CONFIG_DEFAULTS,
  CONFIG_KEYS,
  CONFIG_SCHEMAS,
  type ConfigKey,
  type ConfigValue,
} from '#/lib/configurations'
import {
  PUBLIC_MODE_OVERRIDES,
  isOverridden,
  isPublicMode,
} from '#/lib/public-mode'

const CACHE_TTL_MS = 30_000
type CacheEntries = { [K in ConfigKey]?: { value: ConfigValue<K>; expiresAt: number } }
const cache: CacheEntries = {}

export async function getConfig<K extends ConfigKey>(
  code: K,
): Promise<ConfigValue<K>> {
  if (isPublicMode && isOverridden(code)) {
    return PUBLIC_MODE_OVERRIDES[code] as ConfigValue<K>
  }

  const now = Date.now()
  const cached = cache[code]
  if (cached && cached.expiresAt > now) return cached.value

  const [row] = await db
    .select({ value: configurations.value })
    .from(configurations)
    .where(eq(configurations.code, code))
    .limit(1)

  const schema = CONFIG_SCHEMAS[code]
  const parsed = row ? schema.safeParse(row.value) : null
  const value = parsed?.success
    ? (parsed.data as ConfigValue<K>)
    : CONFIG_DEFAULTS[code]

  cache[code] = { value, expiresAt: now + CACHE_TTL_MS }
  return value
}

export function clearConfigCache(): void {
  for (const key of CONFIG_KEYS) delete cache[key]
}
