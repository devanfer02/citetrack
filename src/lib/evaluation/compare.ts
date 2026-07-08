import { computeEvaluationScore } from '#/lib/evaluation/score'
import type { EvaluationReport } from '#/services/evaluation/report'

export type DeltaStat = {
  before: number
  after: number
  delta: number
  pctChange: number | null
}

export type FindingBucket = {
  key: string
  category: EvaluationCategory
  ruleId: string | null
  token: string | null
  beforeCount: number
  afterCount: number
  delta: number
  sampleBefore: EvaluationFinding | null
  sampleAfter: EvaluationFinding | null
}

export type RuleDelta = {
  ruleId: string
  category: EvaluationCategory
  before: number
  after: number
  delta: number
}

export type ComparisonScoreboard = {
  overallScore: { before: number; after: number; delta: number }
  totalFindings: DeltaStat
  byCategory: Record<EvaluationCategory, DeltaStat>
  bySeverity: Record<'error' | 'warning' | 'info', DeltaStat>
  durationMs: { before: number | null; after: number | null }
  totalPages: { before: number | null; after: number | null }
}

export type ComparisonReport = {
  before: { job: EvaluationJob; summary: EvaluationReport['summary'] }
  after: { job: EvaluationJob; summary: EvaluationReport['summary'] }
  scoreboard: ComparisonScoreboard
  resolved: FindingBucket[]
  stillPresent: FindingBucket[]
  introduced: FindingBucket[]
  topRuleReductions: RuleDelta[]
  topRuleRegressions: RuleDelta[]
  filenameSimilarity: number | null
}

function normToken(token: string | null): string {
  return (token ?? '')
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}-]/gu, '')
}

function normExcerpt(excerpt: string | null): string {
  return (excerpt ?? '').toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 40)
}

function findingKey(f: EvaluationFinding): string {
  return `${f.category}|${f.ruleId ?? '_'}|${normToken(f.token)}|${normExcerpt(f.excerpt)}`
}

function bySampleOrder(a: EvaluationFinding, b: EvaluationFinding): number {
  const pa = a.pageNumber ?? Number.MAX_SAFE_INTEGER
  const pb = b.pageNumber ?? Number.MAX_SAFE_INTEGER
  if (pa !== pb) return pa - pb
  return (a.offset ?? 0) - (b.offset ?? 0)
}

type Group = {
  category: EvaluationCategory
  ruleId: string | null
  token: string | null
  findings: EvaluationFinding[]
}

function groupByKey(findings: EvaluationFinding[]): Map<string, Group> {
  const map = new Map<string, Group>()
  for (const f of findings) {
    const key = findingKey(f)
    const existing = map.get(key)
    if (existing) {
      existing.findings.push(f)
    } else {
      map.set(key, {
        category: f.category,
        ruleId: f.ruleId,
        token: f.token,
        findings: [f],
      })
    }
  }
  return map
}

function pctChange(before: number, after: number): number | null {
  if (before === 0) return null
  return Math.round(((after - before) / before) * 1000) / 10
}

function deltaStat(before: number, after: number): DeltaStat {
  return { before, after, delta: after - before, pctChange: pctChange(before, after) }
}

function countBy<T extends string>(
  findings: EvaluationFinding[],
  pick: (f: EvaluationFinding) => T,
): Record<T, number> {
  const out = {} as Record<T, number>
  for (const f of findings) {
    const k = pick(f)
    out[k] = (out[k] ?? 0) + 1
  }
  return out
}

// Normalized Levenshtein similarity in [0, 1]. Used only for a soft
// "are these the same document?" hint; never gates the comparison.
function similarity(a: string, b: string): number {
  const s = stripName(a)
  const t = stripName(b)
  if (s.length === 0 && t.length === 0) return 1
  const dist = levenshtein(s, t)
  return 1 - dist / Math.max(s.length, t.length)
}

function stripName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[-_ ]?(v|rev|revisi|final|fix)[-_ ]?\d*$/i, '')
    .trim()
}

function levenshtein(a: string, b: string): number {
  const m = a.length
  const n = b.length
  if (m === 0) return n
  if (n === 0) return m
  let prev = Array.from({ length: n + 1 }, (_, i) => i)
  let curr = Array.from<number>({ length: n + 1 })
  for (let i = 1; i <= m; i++) {
    curr[0] = i
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min(prev[j]! + 1, curr[j - 1]! + 1, prev[j - 1]! + cost)
    }
    ;[prev, curr] = [curr, prev]
  }
  return prev[n]!
}

export function compareEvaluations(
  before: EvaluationReport,
  after: EvaluationReport,
): ComparisonReport {
  const beforeGroups = groupByKey(before.findings)
  const afterGroups = groupByKey(after.findings)

  const resolved: FindingBucket[] = []
  const stillPresent: FindingBucket[] = []
  const introduced: FindingBucket[] = []

  const allKeys = new Set([...beforeGroups.keys(), ...afterGroups.keys()])
  for (const key of allKeys) {
    const bg = beforeGroups.get(key)
    const ag = afterGroups.get(key)
    const beforeCount = bg?.findings.length ?? 0
    const afterCount = ag?.findings.length ?? 0
    const meta = bg ?? ag!
    const sampleBefore = bg ? bg.findings.toSorted(bySampleOrder)[0]! : null
    const sampleAfter = ag ? ag.findings.toSorted(bySampleOrder)[0]! : null
    const bucket: FindingBucket = {
      key,
      category: meta.category,
      ruleId: meta.ruleId,
      token: meta.token,
      beforeCount,
      afterCount,
      delta: afterCount - beforeCount,
      sampleBefore,
      sampleAfter,
    }
    if (afterCount === 0) resolved.push(bucket)
    else if (beforeCount === 0) introduced.push(bucket)
    else stillPresent.push(bucket)
  }

  const beforeCat = countBy(before.findings, (f) => f.category)
  const afterCat = countBy(after.findings, (f) => f.category)
  const beforeSev = countBy(before.findings, (f) => f.severity)
  const afterSev = countBy(after.findings, (f) => f.severity)

  const ruleDeltaMap = new Map<string, RuleDelta>()
  const addRule = (f: EvaluationFinding, side: 'before' | 'after') => {
    if (!f.ruleId) return
    const r = ruleDeltaMap.get(f.ruleId) ?? {
      ruleId: f.ruleId,
      category: f.category,
      before: 0,
      after: 0,
      delta: 0,
    }
    r[side] += 1
    r.delta = r.after - r.before
    ruleDeltaMap.set(f.ruleId, r)
  }
  for (const f of before.findings) addRule(f, 'before')
  for (const f of after.findings) addRule(f, 'after')
  const ruleDeltas = [...ruleDeltaMap.values()]
  const topRuleReductions = ruleDeltas
    .filter((r) => r.delta < 0)
    .toSorted((a, b) => a.delta - b.delta || a.ruleId.localeCompare(b.ruleId))
    .slice(0, 5)
  const topRuleRegressions = ruleDeltas
    .filter((r) => r.delta > 0)
    .toSorted((a, b) => b.delta - a.delta || a.ruleId.localeCompare(b.ruleId))
    .slice(0, 5)

  const beforeScore = computeEvaluationScore(
    beforeCat.kbbi ?? 0,
    beforeCat.eyd ?? 0,
    before.job.totalPages,
  )
  const afterScore = computeEvaluationScore(
    afterCat.kbbi ?? 0,
    afterCat.eyd ?? 0,
    after.job.totalPages,
  )

  const scoreboard: ComparisonScoreboard = {
    overallScore: {
      before: beforeScore,
      after: afterScore,
      delta: afterScore - beforeScore,
    },
    totalFindings: deltaStat(before.findings.length, after.findings.length),
    byCategory: {
      kbbi: deltaStat(beforeCat.kbbi ?? 0, afterCat.kbbi ?? 0),
      eyd: deltaStat(beforeCat.eyd ?? 0, afterCat.eyd ?? 0),
    },
    bySeverity: {
      error: deltaStat(beforeSev.error ?? 0, afterSev.error ?? 0),
      warning: deltaStat(beforeSev.warning ?? 0, afterSev.warning ?? 0),
      info: deltaStat(beforeSev.info ?? 0, afterSev.info ?? 0),
    },
    durationMs: { before: before.job.durationMs, after: after.job.durationMs },
    totalPages: { before: before.job.totalPages, after: after.job.totalPages },
  }

  const filenameSimilarity =
    before.job.filename && after.job.filename
      ? Math.round(similarity(before.job.filename, after.job.filename) * 100) / 100
      : null

  return {
    before: { job: before.job, summary: before.summary },
    after: { job: after.job, summary: after.summary },
    scoreboard,
    resolved: resolved.toSorted((a, b) => b.beforeCount - a.beforeCount),
    stillPresent: stillPresent.toSorted((a, b) => b.afterCount - a.afterCount),
    introduced: introduced.toSorted((a, b) => b.afterCount - a.afterCount),
    topRuleReductions,
    topRuleRegressions,
    filenameSimilarity,
  }
}
