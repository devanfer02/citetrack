import { KBBI_PROGRESS_SCALE } from '#/lib/evaluation/constants'

export function stageState(
  job: EvaluationJob,
  stage: EvaluationStage['id'],
): 'waiting' | 'running' | 'done' {
  if (stage === 'extract') {
    if (job.status === 'pending') return 'waiting'
    if (job.status === 'extracting') return 'running'
    return 'done'
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

type SeverityStyle = {
  rowFill: string
  badgeFill: string
  badgeFont: string
  label: string
}

const SEVERITY_STYLE: Record<EvaluationFinding['severity'], SeverityStyle> = {
  error: {
    rowFill: 'FFFDE7E7',
    badgeFill: 'FFF45050',
    badgeFont: 'FFFFFFFF',
    label: 'Error',
  },
  warning: {
    rowFill: 'FFFDFAD9',
    badgeFill: 'FFE6B800',
    badgeFont: 'FF0D3D4F',
    label: 'Warning',
  },
  info: {
    rowFill: 'FFEEF6F8',
    badgeFill: 'FF3DC2EC',
    badgeFont: 'FFFFFFFF',
    label: 'Info',
  },
}

const CATEGORY_LABEL: Record<EvaluationFinding['category'], string> = {
  kbbi: 'KBBI',
  eyd: 'EYD',
}

export async function downloadEvaluationXlsx(
  findings: EvaluationFinding[],
  filename: string,
  meta?: { evalId?: string },
) {
  const ExcelJS = (await import('exceljs')).default

  const wb = new ExcelJS.Workbook()
  wb.creator = 'CiteTrack'
  wb.created = new Date()
  if (meta?.evalId) wb.description = `Evaluation report ${meta.evalId}`

  const ws = wb.addWorksheet('Findings', {
    views: [{ state: 'frozen', ySplit: 1 }],
    properties: { defaultRowHeight: 20 },
  })

  ws.columns = [
    { header: 'Category', key: 'category', width: 12 },
    { header: 'Severity', key: 'severity', width: 12 },
    { header: 'Page', key: 'page', width: 7 },
    { header: 'Rule ID', key: 'ruleId', width: 24 },
    { header: 'Message', key: 'message', width: 56 },
    { header: 'Excerpt', key: 'excerpt', width: 52 },
    { header: 'Suggestion', key: 'suggestion', width: 36 },
  ]

  const header = ws.getRow(1)
  header.height = 28
  header.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 12 }
  header.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF0D3D4F' },
  }
  header.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
  header.eachCell((cell) => {
    cell.border = {
      bottom: { style: 'medium', color: { argb: 'FF3DC2EC' } },
    }
  })

  ws.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: ws.columnCount },
  }

  for (const f of findings) {
    const style = SEVERITY_STYLE[f.severity]
    const row = ws.addRow({
      category: CATEGORY_LABEL[f.category] ?? f.category,
      severity: style.label,
      page: f.pageNumber ?? '',
      ruleId: f.ruleId ?? '',
      message: f.message ?? '',
      excerpt: f.excerpt ?? '',
      suggestion: f.suggestion ?? '',
    })
    row.alignment = { vertical: 'top', wrapText: true }
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: style.rowFill },
      }
      cell.font = { size: 11, color: { argb: 'FF0D3D4F' } }
      cell.border = {
        bottom: { style: 'hair', color: { argb: 'FFE5E7EB' } },
      }
    })

    const catCell = row.getCell('category')
    catCell.font = { size: 11, bold: true, color: { argb: 'FF0D3D4F' } }
    catCell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: false }

    const sevCell = row.getCell('severity')
    sevCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: style.badgeFill },
    }
    sevCell.font = { size: 11, bold: true, color: { argb: style.badgeFont } }
    sevCell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: false }

    const pageCell = row.getCell('page')
    pageCell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: false }
    pageCell.numFmt = '0'

    const ruleCell = row.getCell('ruleId')
    ruleCell.font = {
      name: 'Courier New',
      size: 10,
      color: { argb: 'FF3A6878' },
    }
    ruleCell.alignment = { vertical: 'top', wrapText: false }
  }

  if (findings.length === 0) {
    const empty = ws.addRow({ message: 'No findings to export.' })
    empty.getCell('message').font = {
      italic: true,
      color: { argb: 'FF3A6878' },
    }
  }

  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
