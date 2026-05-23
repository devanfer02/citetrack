import { z } from 'zod'

export const CONFIG_SCHEMAS = {
  'autofetch.staleness_timeout_ms': z.number().int().positive(),
  'autofetch.download_timeout_ms': z.number().int().positive(),
  'autofetch.concurrency': z.number().int().positive(),
  'upload.max_file_size_bytes': z.number().int().positive(),
  'purge.retention_days': z.number().int().positive(),
  'purge.orphan_grace_hours': z.number().int().positive(),
} as const

export const CONFIG_DEFAULTS = {
  'autofetch.staleness_timeout_ms': 5 * 60 * 1000,
  'autofetch.download_timeout_ms': 30 * 1000,
  'autofetch.concurrency': 4,
  'upload.max_file_size_bytes': 50 * 1024 * 1024,
  'purge.retention_days': 30,
  'purge.orphan_grace_hours': 24,
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
    'Maximum allowed size for any user-uploaded PDF (thesis or source). Entered in MB, stored as bytes.',
  'purge.retention_days':
    'Finished jobs (status done or failed) older than this many days are removed when you run "Purge history". In-flight jobs are never touched.',
  'purge.orphan_grace_hours':
    'When purging, also delete files on disk with no matching DB row — but only if the file is older than this many hours. Acts as a safety window for in-flight uploads.',
}

export const CONFIG_LABELS: Record<ConfigKey, string> = {
  'autofetch.staleness_timeout_ms': 'Auto-detect staleness timeout',
  'autofetch.download_timeout_ms': 'Per-PDF download timeout',
  'autofetch.concurrency': 'Auto-detect concurrency',
  'upload.max_file_size_bytes': 'Max upload size',
  'purge.retention_days': 'History retention',
  'purge.orphan_grace_hours': 'Orphan file grace period',
}

export const CONFIG_KEYS = Object.keys(CONFIG_SCHEMAS) as ConfigKey[]

export type DisplayKind = 'ms-as-seconds' | 'bytes-as-mb' | 'integer'

export const CONFIG_DISPLAY: Record<ConfigKey, DisplayKind> = {
  'autofetch.staleness_timeout_ms': 'ms-as-seconds',
  'autofetch.download_timeout_ms': 'ms-as-seconds',
  'autofetch.concurrency': 'integer',
  'upload.max_file_size_bytes': 'bytes-as-mb',
  'purge.retention_days': 'integer',
  'purge.orphan_grace_hours': 'integer',
}

export const CONFIG_UNIT_LABEL: Record<ConfigKey, string> = {
  'autofetch.staleness_timeout_ms': 'seconds',
  'autofetch.download_timeout_ms': 'seconds',
  'autofetch.concurrency': '',
  'upload.max_file_size_bytes': 'MB',
  'purge.retention_days': 'days',
  'purge.orphan_grace_hours': 'hours',
}

const BYTES_PER_MB = 1024 * 1024

export function formatConfigForDisplay(code: ConfigKey, value: number): string {
  if (CONFIG_DISPLAY[code] === 'ms-as-seconds') {
    const seconds = value / 1000
    return seconds.toString()
  }
  if (CONFIG_DISPLAY[code] === 'bytes-as-mb') {
    const mb = value / BYTES_PER_MB
    return Number.isInteger(mb) ? mb.toString() : mb.toFixed(2)
  }
  return value.toString()
}

export function parseConfigFromDisplay(
  code: ConfigKey,
  input: string,
): number | null {
  const trimmed = input
    .trim()
    .replace(/\s*[a-z]+$/i, '')
    .trim()
  if (trimmed.length === 0) return null
  const n = Number.parseFloat(trimmed)
  if (!Number.isFinite(n)) return null
  if (CONFIG_DISPLAY[code] === 'ms-as-seconds') {
    const ms = Math.round(n * 1000)
    return ms > 0 ? ms : null
  }
  if (CONFIG_DISPLAY[code] === 'bytes-as-mb') {
    const bytes = Math.round(n * BYTES_PER_MB)
    return bytes > 0 ? bytes : null
  }
  if (!Number.isInteger(n)) return null
  return n
}
