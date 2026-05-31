import type { ConfigKey } from '#/lib/configurations'
import { listConfigurations } from '#/services/configurations'

export const configurationsQueryOptions = {
  queryKey: ['configurations'] as const,
  queryFn: () => listConfigurations(),
}

export type CardTone = 'mint' | 'butter' | 'sky' | 'blush' | 'cream'

export function toneForCode(code: ConfigKey): CardTone {
  if (code.startsWith('autofetch.')) return 'mint'
  if (code.startsWith('upload.')) return 'sky'
  if (code.startsWith('purge.')) return 'butter'
  if (code.startsWith('kbbi.')) return 'blush'
  if (code.startsWith('passage.')) return 'blush'
  return 'cream'
}

export function groupLabelForCode(code: ConfigKey): string {
  if (code.startsWith('autofetch.')) return 'pencarian otomatis'
  if (code.startsWith('upload.')) return 'unggah'
  if (code.startsWith('purge.')) return 'pembersihan'
  if (code.startsWith('kbbi.')) return 'evaluasi · kbbi'
  if (code.startsWith('passage.')) return 'pencocokan kutipan'
  return 'lainnya'
}
