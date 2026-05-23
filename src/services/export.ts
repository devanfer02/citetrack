import { createServerFn } from '@tanstack/react-start'
import { jobIdSchema } from '#/schemas/job'
import { getFullResults } from '#/services/results'
import type { CitationTraceRow } from '#/services/results'

function escapeCSV(value: string | null | undefined): string {
  if (value === null || value === undefined) return ''
  const str = String(value)
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

function traceToCSVRow(row: CitationTraceRow): string {
  return [
    escapeCSV(row.citationKey),
    row.thesisPage,
    escapeCSV(row.thesisContext),
    escapeCSV(row.referenceAuthor),
    escapeCSV(row.referenceTitle),
    escapeCSV(row.matchType),
    row.sourcePage ?? '',
    escapeCSV(row.matchedPassage),
    row.passageConfidence !== null
      ? Math.round(row.passageConfidence * 100)
      : '',
    escapeCSV(row.reasoning),
    escapeCSV(row.status),
  ].join(',')
}

const CSV_HEADER = [
  'Citation',
  'Thesis Page',
  'Thesis Context',
  'Reference Author',
  'Reference Title',
  'Match Type',
  'Source Page',
  'Matched Passage',
  'Confidence (%)',
  'Reasoning',
  'Status',
].join(',')

export const exportCsv = createServerFn({ method: 'GET' })
  .inputValidator(jobIdSchema)
  .handler(async ({ data: { jobId } }) => {
    const results = await getFullResults({ data: { jobId } })
    const rows = results.traces.map(traceToCSVRow)
    return {
      content: [CSV_HEADER, ...rows].join('\n'),
      filename: `citetrack-${results.filename.replace(/\.pdf$/i, '')}.csv`,
    }
  })

export const exportJson = createServerFn({ method: 'GET' })
  .inputValidator(jobIdSchema)
  .handler(async ({ data: { jobId } }) => {
    const results = await getFullResults({ data: { jobId } })
    const output = {
      meta: {
        filename: results.filename,
        exportedAt: new Date().toISOString(),
        totalCitations: results.totalCitations,
        uniqueCitations: results.uniqueCitations,
        passagesFound: results.passagesFound,
        avgConfidence: results.avgConfidence,
      },
      traces: results.traces.map((t) => ({
        citationKey: t.citationKey,
        thesisPage: t.thesisPage,
        thesisContext: t.thesisContext,
        reference: {
          author: t.referenceAuthor,
          title: t.referenceTitle,
          matchType: t.matchType,
        },
        passage: {
          sourcePage: t.sourcePage,
          matchedPassage: t.matchedPassage,
          confidence: t.passageConfidence,
          reasoning: t.reasoning,
        },
        status: t.status,
      })),
    }
    return {
      content: JSON.stringify(output, null, 2),
      filename: `citetrack-${results.filename.replace(/\.pdf$/i, '')}.json`,
    }
  })
