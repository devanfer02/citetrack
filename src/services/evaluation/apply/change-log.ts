import type { AppliedEdit, ChangeLog, UnlocatedEdit } from './types'

const CATEGORY_LABEL: Record<string, string> = {
  kbbi: 'KBBI',
  eyd: 'EYD',
}

export function emptyChangeLog(): ChangeLog {
  return { applied: [], unlocated: [] }
}

export function summarizeChangeLog(log: ChangeLog): {
  appliedCount: number
  unlocatedCount: number
} {
  return {
    appliedCount: log.applied.length,
    unlocatedCount: log.unlocated.length,
  }
}

function describePage(pageNumber: number | null): string {
  return pageNumber == null ? 'Halaman tidak diketahui' : `Halaman ${pageNumber}`
}

function appliedLine(edit: AppliedEdit): string {
  const cat = CATEGORY_LABEL[edit.category] ?? edit.category
  const rule = edit.ruleId ? ` · ${edit.ruleId}` : ''
  const change =
    edit.kind === 'italic'
      ? `"${edit.before}" dijadikan miring`
      : `"${edit.before}" → "${edit.after}"`
  return `- ${describePage(edit.pageNumber)} (${cat}${rule}): ${change}`
}

function unlocatedLine(edit: UnlocatedEdit): string {
  const rule = edit.ruleId ? ` · ${edit.ruleId}` : ''
  return `- ${describePage(edit.pageNumber)}${rule}: "${edit.token}" → "${edit.suggestion}" (${edit.reason})`
}

// A plain-text report the student downloads alongside the corrected document.
// Every edit and every skipped fix is listed in full — no truncation — so the
// student can verify exactly what changed and what still needs a manual look.
export function formatChangeLogText(log: ChangeLog): string {
  const lines: string[] = []
  lines.push('Ringkasan perbaikan otomatis CiteTrack')
  lines.push('')
  lines.push(`Perubahan diterapkan: ${log.applied.length}`)
  lines.push(`Tidak dapat diterapkan: ${log.unlocated.length}`)
  lines.push('')

  lines.push(`Perubahan yang diterapkan (${log.applied.length})`)
  if (log.applied.length === 0) {
    lines.push('- Tidak ada.')
  } else {
    for (const edit of log.applied) lines.push(appliedLine(edit))
  }
  lines.push('')

  lines.push(`Tidak dapat diterapkan (${log.unlocated.length})`)
  if (log.unlocated.length === 0) {
    lines.push('- Tidak ada.')
  } else {
    lines.push(
      'Perbaikan berikut tidak ditemukan di dokumen, jadi tidak diubah. Periksa dan perbaiki secara manual:',
    )
    for (const edit of log.unlocated) lines.push(unlocatedLine(edit))
  }
  lines.push('')

  return lines.join('\n')
}
