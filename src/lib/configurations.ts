import { z } from 'zod'

export const CONFIG_SCHEMAS = {
  'autofetch.staleness_timeout_ms': z.number().int().positive(),
  'autofetch.download_timeout_ms': z.number().int().positive(),
  'autofetch.concurrency': z.number().int().positive(),
  'upload.max_file_size_bytes': z.number().int().positive(),
} as const

export const CONFIG_DEFAULTS = {
  'autofetch.staleness_timeout_ms': 5 * 60 * 1000,
  'autofetch.download_timeout_ms': 30 * 1000,
  'autofetch.concurrency': 4,
  'upload.max_file_size_bytes': 50 * 1024 * 1024,
} as const

export type ConfigKey = keyof typeof CONFIG_SCHEMAS
export type ConfigValue<K extends ConfigKey> = z.infer<(typeof CONFIG_SCHEMAS)[K]>

export const CONFIG_DESCRIPTIONS: Record<ConfigKey, string> = {
  'autofetch.staleness_timeout_ms':
    'Milliseconds without progress before an in-flight source PDF auto-detect row is marked failed on the next status poll.',
  'autofetch.download_timeout_ms':
    'Milliseconds to wait for a single source PDF HTTP download before aborting.',
  'autofetch.concurrency':
    'Maximum number of source PDFs fetched in parallel by the auto-detect pipeline.',
  'upload.max_file_size_bytes':
    'Maximum allowed size in bytes for any user-uploaded PDF (thesis or source).',
}

export const CONFIG_LABELS: Record<ConfigKey, string> = {
  'autofetch.staleness_timeout_ms': 'Auto-detect staleness timeout',
  'autofetch.download_timeout_ms': 'Per-PDF download timeout',
  'autofetch.concurrency': 'Auto-detect concurrency',
  'upload.max_file_size_bytes': 'Max upload size',
}

export const CONFIG_KEYS = Object.keys(CONFIG_SCHEMAS) as ConfigKey[]

export type DisplayKind = 'ms-as-seconds' | 'integer'

export const CONFIG_DISPLAY: Record<ConfigKey, DisplayKind> = {
  'autofetch.staleness_timeout_ms': 'ms-as-seconds',
  'autofetch.download_timeout_ms': 'ms-as-seconds',
  'autofetch.concurrency': 'integer',
  'upload.max_file_size_bytes': 'integer',
}

export const CONFIG_UNIT_LABEL: Record<ConfigKey, string> = {
  'autofetch.staleness_timeout_ms': 'seconds',
  'autofetch.download_timeout_ms': 'seconds',
  'autofetch.concurrency': '',
  'upload.max_file_size_bytes': 'bytes',
}

export function formatConfigForDisplay(code: ConfigKey, value: number): string {
  if (CONFIG_DISPLAY[code] === 'ms-as-seconds') {
    const seconds = value / 1000
    return Number.isInteger(seconds) ? seconds.toString() : seconds.toString()
  }
  return value.toString()
}

export function parseConfigFromDisplay(
  code: ConfigKey,
  input: string,
): number | null {
  const trimmed = input.trim().replace(/s$/i, '').trim()
  if (trimmed.length === 0) return null
  const n = Number.parseFloat(trimmed)
  if (!Number.isFinite(n)) return null
  if (CONFIG_DISPLAY[code] === 'ms-as-seconds') {
    const ms = Math.round(n * 1000)
    return ms > 0 ? ms : null
  }
  if (!Number.isInteger(n)) return null
  return n
}
