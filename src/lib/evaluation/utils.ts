import { KBBI_PROGRESS_SCALE } from '#/lib/evaluation/constants'

export function severityVariant(
  severity: EvaluationFinding['severity'],
): 'default' | 'destructive' | 'secondary' | 'outline' {
  if (severity === 'error') return 'destructive'
  if (severity === 'warning') return 'secondary'
  return 'outline'
}

export function stageState(
  job: EvaluationJob,
  stage: EvaluationStage['id'],
): 'waiting' | 'running' | 'done' {
  if (stage === 'extract') {
    if (job.status === 'pending') return 'waiting'
    if (job.status === 'extracting') return 'running'
    return 'done'
  }
  if (stage === 'filkom') {
    if (job.filkomDone) return 'done'
    if (job.currentStep === 'filkom') return 'running'
    return 'waiting'
  }
  if (stage === 'kbbi') {
    if (
      job.kbbiTotal > 0 &&
      job.kbbiProgress >= job.kbbiTotal &&
      job.currentStep !== 'kbbi'
    ) {
      return 'done'
    }
    if (job.currentStep === 'kbbi') return 'running'
    if (job.currentStep === 'eyd' || job.status === 'done') return 'done'
    return 'waiting'
  }
  if (job.currentStep === 'eyd') return 'running'
  if (job.status === 'done') return 'done'
  return 'waiting'
}

export function stageProgress(
  job: EvaluationJob,
  stage: EvaluationStage['id'],
): { processed: number; total: number; pct: number } | null {
  if (stage === 'extract' && job.totalPages && job.totalPages > 0) {
    return {
      processed: job.extractedPages,
      total: job.totalPages,
      pct: Math.round((job.extractedPages / Math.max(job.totalPages, 1)) * 100),
    }
  }
  if (stage === 'kbbi' && job.kbbiTotal > 0) {
    const pageTotal = Math.max(
      1,
      Math.round(job.kbbiTotal / KBBI_PROGRESS_SCALE),
    )
    const pageDone = Math.min(
      pageTotal,
      Math.ceil(job.kbbiProgress / KBBI_PROGRESS_SCALE),
    )
    return {
      processed: pageDone,
      total: pageTotal,
      pct: Math.min(100, Math.round((job.kbbiProgress / job.kbbiTotal) * 100)),
    }
  }
  if (stage === 'eyd' && job.eydTotal > 0) {
    return {
      processed: job.eydProgress,
      total: job.eydTotal,
      pct: Math.round((job.eydProgress / Math.max(job.eydTotal, 1)) * 100),
    }
  }
  return null
}

function csvEscape(value: string | number | null | undefined): string {
  const s = value === null || value === undefined ? '' : String(value)
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

export function downloadCsv(findings: EvaluationFinding[], filename: string) {
  const header = [
    'category',
    'severity',
    'page',
    'rule_id',
    'message',
    'excerpt',
    'suggestion',
  ]
  const rows = findings.map((f) =>
    [
      f.category,
      f.severity,
      f.pageNumber,
      f.ruleId,
      f.message,
      f.excerpt,
      f.suggestion,
    ]
      .map(csvEscape)
      .join(','),
  )
  const csv = [header.join(','), ...rows].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
