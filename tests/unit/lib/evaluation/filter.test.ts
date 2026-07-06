import { describe, expect, it } from 'vitest'
import {
  filterFindings,
  parseExcludedPages,
  type ParsedFilter,
} from '#/lib/evaluation/filter'

let nextId = 1

function finding(
  over: Partial<EvaluationFinding> & {
    category: EvaluationCategory
    message: string
  },
): EvaluationFinding {
  return {
    id: nextId++,
    evalJobId: 'job',
    category: over.category,
    severity: over.severity ?? 'warning',
    pageNumber: over.pageNumber ?? 1,
    offset: over.offset ?? 0,
    length: over.length ?? null,
    excerpt: over.excerpt ?? null,
    token: over.token ?? null,
    message: over.message,
    suggestion: over.suggestion ?? null,
    ruleId: over.ruleId ?? null,
    resolvedAt: over.resolvedAt ?? null,
    createdAt: over.createdAt ?? new Date('2026-01-01'),
  }
}

function baseFilter(over: Partial<ParsedFilter> = {}): ParsedFilter {
  return {
    categories: over.categories ?? new Set<EvaluationCategory>(),
    severities: over.severities ?? new Set<EvaluationFinding['severity']>(),
    query: over.query ?? '',
    includeResolved: over.includeResolved ?? true,
    excludedPages: over.excludedPages ?? new Set<number>(),
  }
}

describe('parseExcludedPages', () => {
  it('parses single pages and ranges', () => {
    expect([...parseExcludedPages('7, 10-12, 45')].toSorted((a, b) => a - b)).toEqual(
      [7, 10, 11, 12, 45],
    )
  })

  it('tolerates whitespace around numbers and dashes', () => {
    expect([...parseExcludedPages(' 7 ,10 - 12 ')].toSorted((a, b) => a - b)).toEqual(
      [7, 10, 11, 12],
    )
  })

  it('handles reversed ranges', () => {
    expect([...parseExcludedPages('12-10')].toSorted((a, b) => a - b)).toEqual([
      10, 11, 12,
    ])
  })

  it('ignores malformed and non-numeric tokens', () => {
    expect([...parseExcludedPages('7, abc, -, 3-')].toSorted((a, b) => a - b)).toEqual(
      [7],
    )
  })

  it('ignores zero and empty input', () => {
    expect(parseExcludedPages('').size).toBe(0)
    expect(parseExcludedPages('   ').size).toBe(0)
    expect(parseExcludedPages('0').size).toBe(0)
  })

  it('parses a single page', () => {
    expect([...parseExcludedPages('5')]).toEqual([5])
  })
})

describe('filterFindings excludedPages', () => {
  const findings = [
    finding({ category: 'eyd', message: 'a', pageNumber: 7 }),
    finding({ category: 'eyd', message: 'b', pageNumber: 8 }),
    finding({ category: 'kbbi', message: 'c', pageNumber: 11 }),
    finding({ category: 'kbbi', message: 'd', pageNumber: 20 }),
  ]

  it('drops findings on excluded pages', () => {
    const result = filterFindings(
      findings,
      baseFilter({ excludedPages: new Set([7, 10, 11, 12]) }),
    )
    expect(result.map((f) => f.pageNumber).toSorted((a, b) => a - b)).toEqual([8, 20])
  })

  it('is a no-op when excludedPages is empty', () => {
    const result = filterFindings(findings, baseFilter())
    expect(result).toHaveLength(4)
  })
})
