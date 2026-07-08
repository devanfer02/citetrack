import { describe, expect, it } from 'vitest'
import { compareEvaluations } from '#/lib/evaluation/compare'
import type { EvaluationReport } from '#/services/evaluation/report'

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

function report(
  findings: EvaluationFinding[],
  over: Partial<EvaluationJob> = {},
): EvaluationReport {
  const job = {
    id: over.id ?? 'job',
    status: 'done',
    filename: over.filename ?? 'skripsi.pdf',
    fileSize: 1000,
    totalPages: over.totalPages ?? 10,
    extractedPages: over.totalPages ?? 10,
    currentStep: null,
    kbbiProgress: 0,
    kbbiTotal: 0,
    eydProgress: 0,
    eydTotal: 0,
    durationMs: over.durationMs ?? 5000,
    error: null,
    createdAt: over.createdAt ?? new Date('2026-01-01'),
    updatedAt: over.updatedAt ?? new Date('2026-01-01'),
  } as EvaluationJob
  const kbbi = findings.filter((f) => f.category === 'kbbi').length
  const eyd = findings.filter((f) => f.category === 'eyd').length
  return {
    job,
    summary: {
      evalJobId: job.id,
      kbbiErrorCount: kbbi,
      eydErrorCount: eyd,
      overallScore: 0,
      rawReport: null,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
    },
    findings,
  }
}

describe('compareEvaluations', () => {
  it('empty vs empty produces empty buckets and zero deltas', () => {
    const r = compareEvaluations(report([]), report([]))
    expect(r.resolved).toEqual([])
    expect(r.stillPresent).toEqual([])
    expect(r.introduced).toEqual([])
    expect(r.scoreboard.totalFindings.delta).toBe(0)
    expect(r.scoreboard.totalFindings.pctChange).toBeNull()
  })

  it('all findings resolved when after is empty', () => {
    const before = report([
      finding({ category: 'kbbi', token: 'pemroses', message: 'Kata "pemroses"' }),
      finding({ category: 'eyd', ruleId: 'eyd.double-space', message: 'spasi ganda' }),
    ])
    const r = compareEvaluations(before, report([]))
    expect(r.resolved).toHaveLength(2)
    expect(r.stillPresent).toHaveLength(0)
    expect(r.introduced).toHaveLength(0)
    expect(r.scoreboard.totalFindings.delta).toBe(-2)
    expect(r.scoreboard.totalFindings.pctChange).toBe(-100)
  })

  it('identical findings are all still-present with zero delta', () => {
    const mk = () => [
      finding({ category: 'kbbi', token: 'pemroses', message: 'Kata "pemroses"' }),
    ]
    const r = compareEvaluations(report(mk()), report(mk()))
    expect(r.resolved).toHaveLength(0)
    expect(r.stillPresent).toHaveLength(1)
    expect(r.stillPresent[0]!.delta).toBe(0)
    expect(r.scoreboard.totalFindings.pctChange).toBe(0)
  })

  it('new findings with no baseline give null pctChange', () => {
    const after = report([
      finding({ category: 'eyd', ruleId: 'eyd.di-locative-one-word', message: 'di rumah' }),
    ])
    const r = compareEvaluations(report([]), after)
    expect(r.introduced).toHaveLength(1)
    expect(r.scoreboard.totalFindings.delta).toBe(1)
    expect(r.scoreboard.totalFindings.pctChange).toBeNull()
  })

  it('count-based delta: 3 before, 1 after is still-present delta -2', () => {
    const mk = (n: number) =>
      Array.from({ length: n }, (_, i) =>
        finding({
          category: 'kbbi',
          token: 'pemroses',
          message: 'Kata "pemroses"',
          pageNumber: i + 1,
        }),
      )
    const r = compareEvaluations(report(mk(3)), report(mk(1)))
    expect(r.stillPresent).toHaveLength(1)
    expect(r.stillPresent[0]!.beforeCount).toBe(3)
    expect(r.stillPresent[0]!.afterCount).toBe(1)
    expect(r.stillPresent[0]!.delta).toBe(-2)
  })

  it('normalizes token case so Pemroses and pemroses match', () => {
    const before = report([
      finding({ category: 'kbbi', token: 'Pemroses', message: 'Kata "Pemroses"' }),
    ])
    const after = report([
      finding({ category: 'kbbi', token: 'pemroses', message: 'Kata "pemroses"' }),
    ])
    const r = compareEvaluations(before, after)
    expect(r.stillPresent).toHaveLength(1)
    expect(r.resolved).toHaveLength(0)
  })

  it('tolerates null ruleId, token, and excerpt without throwing', () => {
    const before = report([
      finding({ category: 'eyd', message: 'sesuatu', ruleId: null, token: null, excerpt: null }),
    ])
    const r = compareEvaluations(before, report([]))
    expect(r.resolved).toHaveLength(1)
    expect(r.resolved[0]!.key).toContain('eyd|')
  })

  it('per-category and per-severity deltas are correct', () => {
    const before = report([
      finding({ category: 'kbbi', severity: 'error', token: 'a', message: 'Kata "a"' }),
      finding({ category: 'eyd', severity: 'warning', token: 'b', message: 'b', ruleId: 'r' }),
    ])
    const after = report([
      finding({ category: 'eyd', severity: 'warning', token: 'b', message: 'b', ruleId: 'r' }),
    ])
    const r = compareEvaluations(before, after)
    expect(r.scoreboard.byCategory.kbbi.delta).toBe(-1)
    expect(r.scoreboard.byCategory.eyd.delta).toBe(0)
    expect(r.scoreboard.bySeverity.error.delta).toBe(-1)
    expect(r.scoreboard.bySeverity.warning.delta).toBe(0)
  })

  it('top rule reductions and regressions are sorted by absolute delta', () => {
    const before = report(
      Array.from({ length: 5 }, () =>
        finding({ category: 'eyd', ruleId: 'eyd.double-space', message: 'x', token: 'x' }),
      ),
    )
    const after = report(
      Array.from({ length: 3 }, () =>
        finding({ category: 'eyd', ruleId: 'eyd.acronym-undeclared', message: 'y', token: 'y' }),
      ),
    )
    const r = compareEvaluations(before, after)
    expect(r.topRuleReductions[0]!.ruleId).toBe('eyd.double-space')
    expect(r.topRuleReductions[0]!.delta).toBe(-5)
    expect(r.topRuleRegressions[0]!.ruleId).toBe('eyd.acronym-undeclared')
    expect(r.topRuleRegressions[0]!.delta).toBe(3)
  })

  it('computes filename similarity: identical is 1, unrelated is low', () => {
    const same = compareEvaluations(
      report([], { filename: 'skripsi.pdf' }),
      report([], { filename: 'skripsi.pdf', id: 'b' }),
    )
    expect(same.filenameSimilarity).toBe(1)
    const diff = compareEvaluations(
      report([], { filename: 'skripsi.pdf' }),
      report([], { filename: 'laporan-akhir-xyz.pdf', id: 'b' }),
    )
    expect(diff.filenameSimilarity).not.toBeNull()
    expect(diff.filenameSimilarity!).toBeLessThan(0.5)
  })
})
