# Evaluation Comparison Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a student compare two finished evaluations (an old draft vs. a revised one) and see a scoreboard of deltas plus which findings were resolved, are still present, or are newly introduced.

**Architecture:** A pure `compareEvaluations()` function does all the diff/aggregation logic (fully unit-tested, no I/O). A thin `getEvaluationComparison` server function loads both jobs' data and calls it. A new route `/evaluation/compare/$beforeId/$afterId` renders the result as stacked pastel `<Section>` bands. The history page gains multi-select checkboxes (state in URL search params) and a sticky "compare" pill.

**Tech Stack:** TanStack Start (server functions + file routes), Drizzle ORM (PostgreSQL), Zod v4, Vitest, Tailwind v4, React 19.

**Spec:** `docs/superpowers/specs/2026-05-27-evaluation-comparison-design.md`

---

## File Structure

```
src/lib/evaluation/compare.ts              CREATE  pure compareEvaluations() + helpers + types
tests/unit/lib/evaluation/compare.test.ts  CREATE  Vitest unit tests for the pure function
src/schemas/evaluation.ts                  MODIFY  add evaluationCompareSchema
src/services/evaluation/compare.ts         CREATE  getEvaluationComparison server function
src/schemas/history.ts                     MODIFY  add optional `selected` to historySearchSchema
src/routes/evaluation/compare/$beforeId/$afterId/index.tsx          CREATE  route + loader + canonical redirect
src/routes/evaluation/compare/$beforeId/$afterId/-sections/compare-header.tsx       CREATE
src/routes/evaluation/compare/$beforeId/$afterId/-sections/compare-scoreboard.tsx   CREATE
src/routes/evaluation/compare/$beforeId/$afterId/-sections/finding-delta-list.tsx   CREATE  shared list for the 3 buckets
src/routes/evaluation/compare/$beforeId/$afterId/-sections/rule-deltas.tsx          CREATE
src/routes/history/index.tsx               MODIFY  read `selected`, render sticky compare bar
src/routes/history/-sections/history-row.tsx                        MODIFY  checkbox for done eval rows
src/routes/history/-sections/compare-bar.tsx                        CREATE  sticky selection bar
```

Key existing facts the implementer must rely on:
- Global types in `src/types/evaluation.d.ts`: `EvaluationCategory = 'kbbi' | 'eyd'`, `EvaluationFinding`, `EvaluationJob`. No import needed — they're `declare global`.
- `EvaluationReport` type is exported from `src/services/evaluation/report.ts`: `{ job, summary, findings }`.
- `computeEvaluationScore(kbbiCount, eydCount, totalPages)` lives in `src/lib/evaluation/score.ts`.
- Findings carry: `id, evalJobId, category, severity, pageNumber, offset, length, excerpt, token, message, suggestion, ruleId, resolvedAt, createdAt`.
- Tests live under `tests/unit/...` mirroring `src/`. Run with `bun run test:unit`.
- Routes are local-only gated via `beforeLoad: () => { if (!isLocalEnv) throw notFound() }` (import `isLocalEnv` from `#/env`).
- The report page accepts `?highlights=p.<n>;<text>` (see `buildHighlightsParam` in `src/schemas/evaluation.ts`).

---

## Task 1: Pure `compareEvaluations` function + tests (TDD)

**Files:**
- Create: `src/lib/evaluation/compare.ts`
- Test: `tests/unit/lib/evaluation/compare.test.ts`

- [ ] **Step 1: Write the failing test file**

Create `tests/unit/lib/evaluation/compare.test.ts`:

```ts
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
    const before = report([
      ...Array.from({ length: 5 }, () =>
        finding({ category: 'eyd', ruleId: 'eyd.double-space', message: 'x', token: 'x' }),
      ),
    ])
    const after = report([
      ...Array.from({ length: 3 }, () =>
        finding({ category: 'eyd', ruleId: 'eyd.acronym-undeclared', message: 'y', token: 'y' }),
      ),
    ])
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run test:unit -- compare`
Expected: FAIL — `compareEvaluations` is not defined / module not found.

- [ ] **Step 3: Implement `src/lib/evaluation/compare.ts`**

```ts
import type { EvaluationReport } from '#/services/evaluation/report'
import { computeEvaluationScore } from '#/lib/evaluation/score'

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
  let curr = new Array<number>(n + 1)
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
    const sampleBefore = bg ? [...bg.findings].sort(bySampleOrder)[0]! : null
    const sampleAfter = ag ? [...ag.findings].sort(bySampleOrder)[0]! : null
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

  resolved.sort((a, b) => b.beforeCount - a.beforeCount)
  stillPresent.sort((a, b) => b.afterCount - a.afterCount)
  introduced.sort((a, b) => b.afterCount - a.afterCount)

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
    .sort((a, b) => a.delta - b.delta || a.ruleId.localeCompare(b.ruleId))
    .slice(0, 5)
  const topRuleRegressions = ruleDeltas
    .filter((r) => r.delta > 0)
    .sort((a, b) => b.delta - a.delta || a.ruleId.localeCompare(b.ruleId))
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
    resolved,
    stillPresent,
    introduced,
    topRuleReductions,
    topRuleRegressions,
    filenameSimilarity,
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun run test:unit -- compare`
Expected: PASS — all `compareEvaluations` tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/evaluation/compare.ts tests/unit/lib/evaluation/compare.test.ts
git commit -m "$(cat <<'EOF'
feat(evaluation): add compareEvaluations pure function

Diffs two evaluation reports by a deterministic
(category, ruleId, token, excerpt-window) key into resolved /
still-present / introduced buckets, plus per-category, per-severity,
and per-rule delta aggregation and a filename-similarity hint.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `getEvaluationComparison` server function + schema

**Files:**
- Modify: `src/schemas/evaluation.ts`
- Create: `src/services/evaluation/compare.ts`

- [ ] **Step 1: Add the input schema**

Append to `src/schemas/evaluation.ts`:

```ts
export const evaluationCompareSchema = z
  .object({
    beforeId: z.string().uuid(),
    afterId: z.string().uuid(),
  })
  .refine((v) => v.beforeId !== v.afterId, {
    message: 'Pilih dua evaluation yang berbeda',
  })

export type EvaluationCompareInput = z.infer<typeof evaluationCompareSchema>
```

- [ ] **Step 2: Create the server function**

Create `src/services/evaluation/compare.ts`:

```ts
import { asc, eq, inArray } from 'drizzle-orm'
import { createServerFn } from '@tanstack/react-start'
import { db } from '#/db'
import {
  evaluationFindings,
  evaluationJobs,
  evaluationSummary,
} from '#/db/schema'
import { assertLocalOnly } from '#/env'
import { compareEvaluations, type ComparisonReport } from '#/lib/evaluation/compare'
import { evaluationCompareSchema } from '#/schemas/evaluation'
import type { EvaluationReport } from '#/services/evaluation/report'

async function loadReport(evalJobId: string): Promise<EvaluationReport> {
  const [job] = await db
    .select()
    .from(evaluationJobs)
    .where(eq(evaluationJobs.id, evalJobId))
    .limit(1)
  if (!job) throw new Error('Evaluation tidak ditemukan')
  if (job.status !== 'done') {
    throw new Error(`Evaluation "${job.filename}" belum selesai`)
  }

  const [summary] = await db
    .select()
    .from(evaluationSummary)
    .where(eq(evaluationSummary.evalJobId, evalJobId))
    .limit(1)

  const findings = await db
    .select()
    .from(evaluationFindings)
    .where(eq(evaluationFindings.evalJobId, evalJobId))
    .orderBy(
      asc(evaluationFindings.category),
      asc(evaluationFindings.pageNumber),
      asc(evaluationFindings.offset),
    )

  return { job, summary: summary ?? null, findings }
}

export const getEvaluationComparison = createServerFn({ method: 'GET' })
  .inputValidator(evaluationCompareSchema)
  .handler(async ({ data: { beforeId, afterId } }): Promise<ComparisonReport> => {
    assertLocalOnly()
    const [a, b] = await Promise.all([loadReport(beforeId), loadReport(afterId)])
    // Canonical orientation: older createdAt is "before".
    const [before, after] =
      a.job.createdAt.getTime() <= b.job.createdAt.getTime() ? [a, b] : [b, a]
    return compareEvaluations(before, after)
  })
```

Note: `inArray` import is unused — remove it if oxlint flags `no-unused-vars`. (Kept here only as a reminder that batching is possible; the two-query path is fine.) **Action: do not import `inArray`.** Final import line:
```ts
import { asc, eq } from 'drizzle-orm'
```

- [ ] **Step 3: Typecheck + lint**

Run: `bun run lint`
Expected: no errors in the two changed files.

- [ ] **Step 4: Commit**

```bash
git add src/schemas/evaluation.ts src/services/evaluation/compare.ts
git commit -m "$(cat <<'EOF'
feat(evaluation): add getEvaluationComparison server function

Loads both evaluation jobs (rejecting unfinished or missing ones),
orients older->newer by createdAt, and returns the comparison report.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Compare route shell + header + scoreboard

**Files:**
- Create: `src/routes/evaluation/compare/$beforeId/$afterId/index.tsx`
- Create: `src/routes/evaluation/compare/$beforeId/$afterId/-sections/compare-header.tsx`
- Create: `src/routes/evaluation/compare/$beforeId/$afterId/-sections/compare-scoreboard.tsx`

- [ ] **Step 1: Create the route**

Create `src/routes/evaluation/compare/$beforeId/$afterId/index.tsx`:

```tsx
import { createFileRoute, notFound, redirect } from '@tanstack/react-router'
import { queryOptions, useQuery } from '@tanstack/react-query'
import { isLocalEnv } from '#/env'
import { getEvaluationComparison } from '#/services/evaluation/compare'
import { CompareHeader } from './-sections/compare-header'
import { CompareScoreboard } from './-sections/compare-scoreboard'
import { FindingDeltaList } from './-sections/finding-delta-list'
import { RuleDeltas } from './-sections/rule-deltas'

const comparisonQuery = (beforeId: string, afterId: string) =>
  queryOptions({
    queryKey: ['evaluation-comparison', beforeId, afterId] as const,
    queryFn: () => getEvaluationComparison({ data: { beforeId, afterId } }),
    staleTime: 5 * 60_000,
  })

export const Route = createFileRoute('/evaluation/compare/$beforeId/$afterId/')({
  beforeLoad: () => {
    if (!isLocalEnv) throw notFound()
  },
  component: ComparePage,
  head: () => ({
    meta: [
      { title: 'Perbandingan evaluation · CiteTrack' },
      {
        name: 'description',
        content:
          'Bandingkan dua hasil evaluation untuk melihat temuan yang sudah dibereskan dan yang masih perlu disentuh.',
      },
    ],
  }),
  loader: async ({ context: { queryClient }, params: { beforeId, afterId } }) => {
    const report = await queryClient.ensureQueryData(
      comparisonQuery(beforeId, afterId),
    )
    // Canonicalize URL order so refresh + share land on older->newer.
    if (
      report.before.job.id !== beforeId ||
      report.after.job.id !== afterId
    ) {
      throw redirect({
        to: '/evaluation/compare/$beforeId/$afterId',
        params: { beforeId: report.before.job.id, afterId: report.after.job.id },
        replace: true,
      })
    }
  },
})

function ComparePage() {
  const { beforeId, afterId } = Route.useParams()
  const { data } = useQuery(comparisonQuery(beforeId, afterId))
  if (!data) return null

  return (
    <main className="flex-1">
      <CompareHeader report={data} />
      <CompareScoreboard scoreboard={data.scoreboard} />
      <FindingDeltaList
        tone="mint"
        kind="resolved"
        buckets={data.resolved}
        afterId={afterId}
      />
      <FindingDeltaList
        tone="butter"
        kind="stillPresent"
        buckets={data.stillPresent}
        afterId={afterId}
      />
      <FindingDeltaList
        tone="blush"
        kind="introduced"
        buckets={data.introduced}
        afterId={afterId}
      />
      <RuleDeltas
        reductions={data.topRuleReductions}
        regressions={data.topRuleRegressions}
      />
    </main>
  )
}
```

- [ ] **Step 2: Create the header section**

Create `src/routes/evaluation/compare/$beforeId/$afterId/-sections/compare-header.tsx`. Render kicker "Perbandingan", headline `Sebelum dan <Marker tone="green">sesudah</Marker>.`, two filename/date/score pills with an `Arrow` doodle between them, and — when `report.filenameSimilarity !== null && report.filenameSimilarity < 0.5` — an inline info banner using the info severity tokens.

```tsx
import { Link } from '@tanstack/react-router'
import { AccentInk, Marker } from '#/components/AccentWord'
import { Section } from '#/components/Section'
import { Arrow, Sparkles } from '#/components/doodles'
import { relativeTime } from '#/lib/history/utils'
import type { ComparisonReport } from '#/lib/evaluation/compare'

export function CompareHeader({ report }: { report: ComparisonReport }) {
  const { before, after, filenameSimilarity, scoreboard } = report
  const mismatched = filenameSimilarity !== null && filenameSimilarity < 0.5
  return (
    <Section tone="sky" grid innerClassName="relative pb-10 pt-14">
      <Sparkles tone="indigo" size={40} className="absolute right-[8%] top-10 hidden md:block" />
      <span className="inline-flex items-center gap-2 rounded-full bg-white/70 px-3 py-1 text-xs font-bold uppercase tracking-wider text-[var(--accent-indigo-deep)]">
        Perbandingan
      </span>
      <h1 className="display-title mt-4 text-[clamp(2.25rem,3.6vw,2.75rem)] font-extrabold leading-[1.05] tracking-tight text-[var(--ink)]">
        Sebelum dan <Marker tone="green">sesudah</Marker>.
      </h1>
      <p className="mt-4 max-w-prose text-[0.9375rem] leading-relaxed text-[var(--ink-soft)]">
        Lihat apa yang berubah antara dua evaluation —{' '}
        <AccentInk tone="indigo">yang lama di kiri, yang baru di kanan</AccentInk>.
      </p>

      <div className="mt-8 grid grid-cols-1 items-stretch gap-4 sm:grid-cols-[1fr_auto_1fr]">
        <EvalPill label="Sebelum" filename={before.job.filename} createdAt={before.job.createdAt} score={scoreboard.overallScore.before} />
        <div aria-hidden className="hidden items-center justify-center sm:flex">
          <Arrow tone="coral" size={40} />
        </div>
        <EvalPill label="Sesudah" filename={after.job.filename} createdAt={after.job.createdAt} score={scoreboard.overallScore.after} />
      </div>

      {mismatched && (
        <div
          className="mt-5 flex items-start gap-2 rounded-xl border border-[var(--ink)]/15 bg-[var(--bg-sky)] px-4 py-3 text-[0.875rem] leading-relaxed text-[var(--ink)]"
          data-severity="info"
        >
          Nama file berbeda — pastikan ini revisi dari dokumen yang sama.
        </div>
      )}
    </Section>
  )
}

function EvalPill({
  label,
  filename,
  createdAt,
  score,
}: {
  label: string
  filename: string
  createdAt: Date
  score: number
}) {
  return (
    <div className="soft-card flex flex-col gap-1 px-5 py-4" data-tone="cream">
      <span className="text-xs font-bold uppercase tracking-wider text-[var(--ink-soft)]">
        {label}
      </span>
      <span className="display-title break-words text-[1.0625rem] font-extrabold leading-snug text-[var(--ink)]">
        {filename}
      </span>
      <span className="text-[0.8125rem] text-[var(--ink-soft)]">
        {relativeTime(createdAt)} · skor {score}
      </span>
    </div>
  )
}
```

- [ ] **Step 3: Create the scoreboard section**

Create `src/routes/evaluation/compare/$beforeId/$afterId/-sections/compare-scoreboard.tsx`. Render a `.soft-card` grid (overall score, total findings, KBBI, EYD) plus a severity strip. Each card shows before → after and the delta; improvements use `var(--marker-green)` accents, regressions use `var(--bg-blush)`. Show `pctChange` as `—` when null. The severity strip bars are scaled to `max(before, after)` within each severity row.

```tsx
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'
import { Section } from '#/components/Section'
import type { ComparisonScoreboard, DeltaStat } from '#/lib/evaluation/compare'

export function CompareScoreboard({ scoreboard }: { scoreboard: ComparisonScoreboard }) {
  const { overallScore, totalFindings, byCategory, bySeverity } = scoreboard
  return (
    <Section tone="cream" innerClassName="py-12">
      <h2 className="display-title text-2xl font-extrabold text-[var(--ink)]">
        Ringkasan perubahan
      </h2>
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <ScoreCard
          title="Skor keseluruhan"
          before={overallScore.before}
          after={overallScore.after}
          delta={overallScore.delta}
          higherIsBetter
        />
        <StatCard title="Total temuan" stat={totalFindings} />
        <StatCard title="Temuan KBBI" stat={byCategory.kbbi} />
        <StatCard title="Temuan EYD" stat={byCategory.eyd} />
      </div>

      <div className="mt-8 flex flex-col gap-3">
        <SeverityBar label="Error" stat={bySeverity.error} severity="error" />
        <SeverityBar label="Warning" stat={bySeverity.warning} severity="warning" />
        <SeverityBar label="Info" stat={bySeverity.info} severity="info" />
      </div>
    </Section>
  )
}

function trend(delta: number, higherIsBetter: boolean) {
  const improving = higherIsBetter ? delta > 0 : delta < 0
  const worsening = higherIsBetter ? delta < 0 : delta > 0
  return { improving, worsening }
}

function DeltaBadge({ delta, higherIsBetter }: { delta: number; higherIsBetter: boolean }) {
  const { improving, worsening } = trend(delta, higherIsBetter)
  const Icon = delta === 0 ? Minus : delta > 0 ? ArrowUpRight : ArrowDownRight
  const color = improving
    ? 'text-[var(--marker-green)]'
    : worsening
      ? 'text-[var(--accent-coral-deep)]'
      : 'text-[var(--ink-soft)]'
  return (
    <span className={`inline-flex items-center gap-1 text-sm font-semibold ${color}`}>
      <Icon className="h-4 w-4" strokeWidth={2} />
      {delta > 0 ? `+${delta}` : delta}
    </span>
  )
}

function ScoreCard({
  title,
  before,
  after,
  delta,
  higherIsBetter,
}: {
  title: string
  before: number
  after: number
  delta: number
  higherIsBetter: boolean
}) {
  return (
    <div className="soft-card flex flex-col gap-2 px-5 py-4" data-tone="cream">
      <span className="text-xs font-bold uppercase tracking-wider text-[var(--ink-soft)]">{title}</span>
      <span className="display-title text-2xl font-extrabold tabular-nums text-[var(--ink)]">
        {before} <span className="text-[var(--ink-faint)]">→</span> {after}
      </span>
      <DeltaBadge delta={delta} higherIsBetter={higherIsBetter} />
    </div>
  )
}

function StatCard({ title, stat }: { title: string; stat: DeltaStat }) {
  return (
    <div className="soft-card flex flex-col gap-2 px-5 py-4" data-tone="cream">
      <span className="text-xs font-bold uppercase tracking-wider text-[var(--ink-soft)]">{title}</span>
      <span className="display-title text-2xl font-extrabold tabular-nums text-[var(--ink)]">
        {stat.before} <span className="text-[var(--ink-faint)]">→</span> {stat.after}
      </span>
      <span className="inline-flex items-center gap-2">
        <DeltaBadge delta={stat.delta} higherIsBetter={false} />
        <span className="text-[0.8125rem] text-[var(--ink-soft)]">
          {stat.pctChange === null ? '—' : `${stat.pctChange > 0 ? '+' : ''}${stat.pctChange}%`}
        </span>
      </span>
    </div>
  )
}

function SeverityBar({
  label,
  stat,
  severity,
}: {
  label: string
  stat: DeltaStat
  severity: 'error' | 'warning' | 'info'
}) {
  const max = Math.max(stat.before, stat.after, 1)
  const pct = (n: number) => `${Math.round((n / max) * 100)}%`
  return (
    <div className="grid grid-cols-[5rem_1fr_4rem] items-center gap-3">
      <span className="text-[0.8125rem] font-medium text-[var(--ink-soft)]">{label}</span>
      <div className="flex flex-col gap-1">
        <div className="h-2 rounded-full bg-[var(--ink)]/10">
          <div className="severity-fill h-2 rounded-full" data-severity={severity} style={{ width: pct(stat.before) }} />
        </div>
        <div className="h-2 rounded-full bg-[var(--ink)]/10">
          <div className="severity-fill h-2 rounded-full" data-severity={severity} style={{ width: pct(stat.after) }} />
        </div>
      </div>
      <span className="text-right text-[0.8125rem] tabular-nums text-[var(--ink-soft)]">
        {stat.before}→{stat.after}
      </span>
    </div>
  )
}
```

If `.severity-fill` does not exist in `src/styles.css`, add it next to `.severity-dot`:
```css
.severity-fill[data-severity='error'] { background: var(--bg-blush); }
.severity-fill[data-severity='warning'] { background: var(--bg-butter); }
.severity-fill[data-severity='info'] { background: var(--bg-sky); }
```
Verify first with: `grep -n "severity-dot\|severity-fill" src/styles.css`. Reuse an existing class if one already fits.

- [ ] **Step 4: Verify it compiles (sections referenced but not yet created will fail import)**

The route imports `FindingDeltaList` and `RuleDeltas` which are created in Task 4. To keep Task 3 independently runnable, create temporary stub files OR implement Task 4 before running the dev server. Simplest: proceed to Task 4 before the first dev-server run. Run `bun run lint` on the three new files now.
Expected: no lint errors (unused-import warnings for the not-yet-used `FindingDeltaList`/`RuleDeltas` will resolve once Task 4 lands).

- [ ] **Step 5: Commit**

```bash
git add src/routes/evaluation/compare src/styles.css
git commit -m "$(cat <<'EOF'
feat(evaluation): scaffold compare route with header and scoreboard

Local-only route at /evaluation/compare/$beforeId/$afterId that
canonicalizes URL order older->newer and renders the comparison
header and delta scoreboard.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Finding bucket lists + rule deltas

**Files:**
- Create: `src/routes/evaluation/compare/$beforeId/$afterId/-sections/finding-delta-list.tsx`
- Create: `src/routes/evaluation/compare/$beforeId/$afterId/-sections/rule-deltas.tsx`

- [ ] **Step 1: Create the shared bucket list**

Create `finding-delta-list.tsx`. One component renders all three buckets; `kind` selects the heading, tone, and whether rows deep-link into the *after* eval. **Show every row — no "… and N more" truncation** (CLAUDE.md hard rule). Empty buckets render a calm island message.

```tsx
import { Link } from '@tanstack/react-router'
import { AccentInk, Marker } from '#/components/AccentWord'
import { Section } from '#/components/Section'
import { Squiggle } from '#/components/doodles'
import { buildHighlightsParam } from '#/schemas/evaluation'
import type { FindingBucket } from '#/lib/evaluation/compare'

type Kind = 'resolved' | 'stillPresent' | 'introduced'
type Tone = 'mint' | 'butter' | 'blush'

const COPY: Record<Kind, { kicker: string; marker: string; empty: string }> = {
  resolved: {
    kicker: 'Yang sudah',
    marker: 'beres',
    empty: 'Belum ada temuan lama yang hilang di evaluation baru.',
  },
  stillPresent: {
    kicker: 'Yang masih',
    marker: 'perlu disentuh',
    empty: 'Semua temuan dari evaluation sebelumnya sudah tidak muncul lagi.',
  },
  introduced: {
    kicker: 'Yang baru',
    marker: 'muncul',
    empty: 'Tidak ada temuan baru di evaluation ini.',
  },
}

export function FindingDeltaList({
  kind,
  tone,
  buckets,
  afterId,
}: {
  kind: Kind
  tone: Tone
  buckets: FindingBucket[]
  afterId: string
}) {
  const copy = COPY[kind]
  return (
    <Section tone={tone} innerClassName="py-12">
      <h2 className="display-title text-2xl font-extrabold text-[var(--ink)]">
        {copy.kicker} <Marker tone="green">{copy.marker}</Marker>.
        <span className="ml-2 text-[var(--ink-soft)] text-lg font-semibold tabular-nums">
          {buckets.length}
        </span>
      </h2>

      {buckets.length === 0 ? (
        <div className="mt-6 flex items-center gap-3 text-[0.9375rem] text-[var(--ink-soft)]">
          <Squiggle tone="indigo" size={32} />
          {copy.empty}
        </div>
      ) : (
        <ul className="mt-6 flex flex-col gap-3">
          {buckets.map((b) => (
            <li key={b.key}>
              <BucketRow bucket={b} kind={kind} afterId={afterId} />
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}

function BucketRow({
  bucket,
  kind,
  afterId,
}: {
  bucket: FindingBucket
  kind: Kind
  afterId: string
}) {
  const label = bucket.token || bucket.sampleAfter?.excerpt || bucket.sampleBefore?.excerpt || '(tanpa token)'
  const sample = bucket.sampleAfter ?? bucket.sampleBefore
  const canJump = kind !== 'resolved' && bucket.sampleAfter?.pageNumber != null

  const inner = (
    <div className="soft-card flex flex-col gap-1.5 px-5 py-3" data-tone="cream">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="font-mono text-[0.9375rem] font-medium text-[var(--ink)] break-words">
          {label}
        </span>
        {bucket.ruleId && (
          <span className="rounded-full bg-[var(--ink)]/8 px-2 py-0.5 text-[0.6875rem] font-semibold uppercase tracking-wide text-[var(--ink-soft)]">
            {bucket.ruleId}
          </span>
        )}
        <span className="text-[0.8125rem] tabular-nums text-[var(--ink-soft)]">
          {kind === 'resolved'
            ? `muncul ${bucket.beforeCount}× sebelumnya`
            : kind === 'introduced'
              ? `muncul ${bucket.afterCount}×`
              : `${bucket.beforeCount} → ${bucket.afterCount}`}
        </span>
      </div>
      {sample?.message && (
        <p className="text-[0.8125rem] leading-relaxed text-[var(--ink-soft)] break-words">
          {sample.message}
        </p>
      )}
      {canJump && (
        <AccentInk tone="indigo">Buka di evaluation baru →</AccentInk>
      )}
    </div>
  )

  if (canJump) {
    const page = bucket.sampleAfter!.pageNumber!
    const token = bucket.token ?? bucket.sampleAfter!.excerpt ?? ''
    return (
      <Link
        to="/evaluation/$evalId"
        params={{ evalId: afterId }}
        search={{ highlights: buildHighlightsParam(page, token) }}
        className="block no-underline"
      >
        {inner}
      </Link>
    )
  }
  return inner
}
```

- [ ] **Step 2: Create the rule-deltas section**

Create `rule-deltas.tsx`:

```tsx
import { Section } from '#/components/Section'
import type { RuleDelta } from '#/lib/evaluation/compare'

export function RuleDeltas({
  reductions,
  regressions,
}: {
  reductions: RuleDelta[]
  regressions: RuleDelta[]
}) {
  if (reductions.length === 0 && regressions.length === 0) return null
  return (
    <Section tone="cream" innerClassName="py-12">
      <h2 className="display-title text-2xl font-extrabold text-[var(--ink)]">
        Per aturan
      </h2>
      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
        <RuleColumn title="Paling banyak berkurang" rules={reductions} />
        <RuleColumn title="Paling banyak bertambah" rules={regressions} />
      </div>
    </Section>
  )
}

function RuleColumn({ title, rules }: { title: string; rules: RuleDelta[] }) {
  return (
    <div className="soft-card px-5 py-4" data-tone="cream">
      <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--ink-soft)]">{title}</h3>
      {rules.length === 0 ? (
        <p className="mt-3 text-[0.875rem] text-[var(--ink-soft)]">Tidak ada.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {rules.map((r) => (
            <li key={r.ruleId} className="flex items-baseline justify-between gap-3">
              <span className="font-mono text-[0.8125rem] text-[var(--ink)] break-words">{r.ruleId}</span>
              <span className="shrink-0 text-[0.8125rem] tabular-nums text-[var(--ink-soft)]">
                {r.before} → {r.after}{' '}
                <span className="font-semibold text-[var(--ink)]">
                  ({r.delta > 0 ? `+${r.delta}` : r.delta})
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Lint**

Run: `bun run lint`
Expected: no errors across the compare route + sections.

- [ ] **Step 4: Commit**

```bash
git add src/routes/evaluation/compare
git commit -m "$(cat <<'EOF'
feat(evaluation): add finding buckets and rule deltas to compare view

Resolved / still-present / newly-introduced lists (every row shown, no
truncation) plus a per-rule reductions/regressions summary. Still-present
and introduced rows deep-link into the newer evaluation with the finding
highlighted.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: History multi-select + compare entry point

**Files:**
- Modify: `src/schemas/history.ts`
- Modify: `src/routes/history/-sections/history-row.tsx`
- Create: `src/routes/history/-sections/compare-bar.tsx`
- Modify: `src/routes/history/index.tsx`

- [ ] **Step 1: Extend the history search schema**

In `src/schemas/history.ts`, add `selected` to `historySearchSchema`:

```ts
export const historySearchSchema = z.object({
  kind: historyKindSchema.optional().default('track'),
  page: z.coerce.number().int().positive().optional().default(1),
  selected: z
    .string()
    .optional()
    .transform((s) => (s ? s.split(',').filter(Boolean) : []))
    .pipe(z.array(z.string().uuid()).max(2)),
})
```

This parses `?selected=id1,id2` into `string[]` and caps it at 2. (TanStack Router serializes the array back; on navigation we set it as a joined string — see Step 4.)

- [ ] **Step 2: Make `HistoryRow` selectable for done eval rows**

Modify `src/routes/history/-sections/history-row.tsx`. The current `EvalRow` wraps the whole row in a `<Link>`. Restructure so that when selection is active a checkbox sits to the left of the link (the checkbox must not be inside the `<Link>`). Add optional props to `HistoryRow` and `EvalRow`:

```tsx
export function HistoryRow({
  item,
  selectable = false,
  selected = false,
  onToggleSelect,
}: {
  item: HistoryItem
  selectable?: boolean
  selected?: boolean
  onToggleSelect?: (id: string) => void
}) {
  return item.kind === 'track' ? (
    <TrackRow item={item} />
  ) : (
    <EvalRow
      item={item}
      selectable={selectable}
      selected={selected}
      onToggleSelect={onToggleSelect}
    />
  )
}
```

Update `EvalRow` to render, when `selectable && item.status === 'done'`, a flex container `[checkbox][link]`:

```tsx
function EvalRow({
  item,
  selectable,
  selected,
  onToggleSelect,
}: {
  item: EvaluationHistoryItem
  selectable?: boolean
  selected?: boolean
  onToggleSelect?: (id: string) => void
}) {
  const link = (
    <Link to="/evaluation/$evalId" params={{ evalId: item.id }} className={rowClass}>
      <RowInner item={item} />
    </Link>
  )
  if (!selectable || item.status !== 'done') {
    return (
      <div className="flex items-stretch gap-3">
        {selectable && <span aria-hidden className="w-6 shrink-0" />}
        <div className="min-w-0 flex-1">{link}</div>
      </div>
    )
  }
  return (
    <div className="flex items-stretch gap-3">
      <label className="flex shrink-0 cursor-pointer items-center">
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggleSelect?.(item.id)}
          className="h-5 w-5 cursor-pointer accent-[var(--accent-coral)]"
          aria-label={`Pilih ${item.filename} untuk dibandingkan`}
        />
      </label>
      <div className="min-w-0 flex-1">{link}</div>
    </div>
  )
}
```

(Leave `TrackRow` unchanged.)

- [ ] **Step 3: Create the sticky compare bar**

Create `src/routes/history/-sections/compare-bar.tsx`:

```tsx
import { Button } from '#/components/ui/button'

export function CompareBar({
  count,
  onReset,
  onCompare,
}: {
  count: number
  onReset: () => void
  onCompare: () => void
}) {
  if (count === 0) return null
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--ink)]/10 bg-[var(--bg-cream)]/95 px-6 py-3 backdrop-blur">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4">
        <span className="text-[0.875rem] text-[var(--ink)]">
          {count === 1
            ? 'Pilih satu lagi untuk membandingkan.'
            : 'Dua evaluation dipilih.'}
        </span>
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={onReset}>
            Batal
          </Button>
          <Button variant="default" disabled={count !== 2} onClick={onCompare}>
            Bandingkan dipilih
          </Button>
        </div>
      </div>
    </div>
  )
}
```

Verify the `Button` import path and available `variant` values: `grep -n "variant" src/components/ui/button.tsx | head`.

- [ ] **Step 4: Wire selection state into the history route**

Modify `src/routes/history/index.tsx`. Selection lives in URL search params (no `useState`). Add a toggle handler that navigates with the updated `selected` list (joined to a comma string), pass `selectable`/`selected`/`onToggleSelect` to `HistoryRow`, and render `<CompareBar>`. Selection only applies when `kind === 'evaluation'`.

Key additions:

```tsx
import { useNavigate } from '@tanstack/react-router'
import { CompareBar } from './-sections/compare-bar'

// inside HistoryRoute(), after `const { kind, page } = Route.useSearch()`:
const { selected } = Route.useSearch()
const navigate = useNavigate()
const selectable = kind === 'evaluation'

const setSelected = (ids: string[]) =>
  void navigate({
    to: '/history',
    search: (prev) => ({
      ...prev,
      selected: ids.length > 0 ? ids.join(',') : undefined,
    }),
    replace: true,
    resetScroll: false,
  })

const toggleSelect = (id: string) => {
  const next = selected.includes(id)
    ? selected.filter((s) => s !== id)
    : [...selected, id].slice(-2) // cap at 2, drop oldest
  setSelected(next)
}

const compareSelected = () => {
  if (selected.length !== 2) return
  // Determine canonical order from the rows we have on screen; the server
  // re-canonicalizes anyway, so either order is safe here.
  const [a, b] = selected
  void navigate({
    to: '/evaluation/compare/$beforeId/$afterId',
    params: { beforeId: a, afterId: b },
  })
}
```

Update the row render to pass props:

```tsx
<HistoryRow
  item={item}
  selectable={selectable}
  selected={selected.includes(item.id)}
  onToggleSelect={toggleSelect}
/>
```

And before `</main>`:

```tsx
{selectable && (
  <CompareBar
    count={selected.length}
    onReset={() => setSelected([])}
    onCompare={compareSelected}
  />
)}
```

Note on the search-schema input/output mismatch: `historySearchSchema` parses `selected` from a string into `string[]`, but `navigate({ search })` must provide the *input* shape. Passing `selected: 'id1,id2'` (string) or `undefined` matches the input side; reading `Route.useSearch().selected` gives the parsed `string[]`. If TanStack's types complain, type the navigate search object explicitly as `{ selected?: string }`.

- [ ] **Step 5: Lint**

Run: `bun run lint`
Expected: no errors. (No `useState`/`useEffect` introduced — state is URL-derived.)

- [ ] **Step 6: Commit**

```bash
git add src/schemas/history.ts src/routes/history
git commit -m "$(cat <<'EOF'
feat(history): multi-select evaluations and compare entry point

Done evaluation rows get a checkbox; selection lives in the URL
(?selected=) and a sticky bar launches the comparison once two are
picked.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Smoke test + build

**Files:** none (verification only)

- [ ] **Step 1: Run the full unit suite**

Run: `bun run test:unit`
Expected: PASS, including the new `compare.test.ts`.

- [ ] **Step 2: Start the dev server and walk the flow**

Run: `bun run dev` (port 3000). In the browser:
1. Open `/history?kind=evaluation`. Confirm checkboxes appear only on `done` rows.
2. Tick two rows → sticky bar shows "Dua evaluation dipilih"; "Bandingkan dipilih" enabled.
3. Click it → lands on `/evaluation/compare/<older>/<newer>` (URL canonicalized older→newer even if picked in reverse).
4. Confirm: header pills, scoreboard cards + severity strip, the three bucket lists with correct counts, rule deltas.
5. Click a "still present" row → lands on the newer eval at the right page with the token highlighted.
6. Try `/evaluation/compare/<id>/<id>` (same id twice) → friendly validation error, not a crash.
7. Try an in-progress eval id → "belum selesai" error view.

If the browser cannot be driven in this environment, say so explicitly rather than claiming the UI works.

- [ ] **Step 3: Production build (once, at the end — project convention)**

Run: `bun run build`
Expected: build succeeds with no type errors.

- [ ] **Step 4: Update the knowledge graph**

Run the CRG incremental update per the project workflow, then commit any remaining docs:

```bash
git add -A
git commit -m "$(cat <<'EOF'
chore(evaluation): finalize comparison feature

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```
(Skip the commit if there is nothing left unstaged.)

---

## Self-Review Notes

- **Spec coverage:** scoreboard (Task 3), three buckets + rule deltas (Task 4), heuristic key match (Task 1), history multi-select entry point (Task 5), canonical ordering (Tasks 2+3), error handling for missing/unfinished/same-id (Task 2 schema + server), filename-similarity hint (Tasks 1+3), no-truncation rule (Task 4), local-only gating (Tasks 2+3). All present.
- **Type consistency:** `ComparisonReport`, `FindingBucket`, `DeltaStat`, `RuleDelta`, `ComparisonScoreboard` are defined once in Task 1 and imported everywhere else. `getEvaluationComparison` returns `ComparisonReport`. Route query key `['evaluation-comparison', beforeId, afterId]`.
- **Known follow-ups (not in scope):** virtualization for very large bucket lists (only needed if a single rule fires thousands of times); PDF export of the comparison; N-way comparison.
