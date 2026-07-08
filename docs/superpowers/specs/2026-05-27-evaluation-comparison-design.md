# Evaluation Comparison — Design

**Date:** 2026-05-27
**Status:** Approved (pending user spec review)
**Author:** brainstorming session

## Motivation

A student uploads a draft to CiteTrack, gets an evaluation report (KBBI + EYD
findings), revises the document based on the suggestions, exports a new PDF, and
uploads it for a second evaluation. They now want to see — in one view — how
much better the second draft is than the first:

- Did the overall score go up?
- Which specific issues did they fix?
- Which issues are still present?
- Did the revision introduce new issues?
- By what percentage did total errors drop?

Today there is no way to answer those questions without manually scrolling two
report pages side-by-side. This spec defines a comparison view that does it for
them.

## Non-goals

- **No new persistence.** Comparisons are derived views; they are recomputed on
  request. No `evaluation_comparisons` table.
- **No share/export of comparisons.** A comparison is reachable by URL
  (`/evaluation/compare/<beforeId>/<afterId>`) and that is share enough for
  local-mode use; no PDF export of the comparison itself in v1.
- **No multi-evaluation comparison.** Exactly two jobs at a time. N-way
  comparison can come later if asked for.
- **No automatic "best revision" suggestion.** The UI surfaces deltas; the
  student decides what to revise next.
- **No LLM.** Matching is deterministic (heuristic key, see below). The project
  does not assume LLM availability.

## Architecture

Three new files plus a small extension to the history page:

```
src/lib/evaluation/
  compare.ts            ← pure function compareEvaluations(beforeReport, afterReport)
  compare.test.ts       ← Vitest unit tests

src/services/evaluation/
  compare.ts            ← server function getEvaluationComparison({ beforeId, afterId })

src/routes/evaluation/compare/$beforeId/$afterId/
  index.tsx             ← compare route
  -sections/            ← compare-header, scoreboard, resolved, still-present, introduced, rule-deltas

src/schemas/
  evaluation.ts         ← add evaluationCompareSchema { beforeId: uuid, afterId: uuid }
  history.ts            ← add optional `selected: string[]` (comma-separated in URL)

src/routes/history/-sections/
  history-row.tsx       ← add checkbox column (gated to done evaluation rows)
  history-tabs.tsx      ← no change
src/routes/history/
  index.tsx             ← reads `selected` from search params, renders sticky compare pill
```

### Server boundary

`getEvaluationComparison` is the only new server function. It:

1. Validates input via Zod (`beforeId` and `afterId` are UUIDs; they must
   differ).
2. Loads both jobs, both summaries, and all findings for both — three queries
   in parallel for each job, run in a single `Promise.all`.
3. Rejects if either job is missing (`'Evaluation tidak ditemukan'`).
4. Rejects if either job is not `status === 'done'`
   (`'Evaluation belum selesai'`). Pending/extracting/analyzing/failed all
   reject; comparison only makes sense for finished work.
5. Re-derives `overallScore` from current counts via `computeEvaluationScore`,
   matching the pattern in `getEvaluationReport` (which already does this to
   shield against old rows stored under a broken formula).
6. Calls `compareEvaluations(before, after)` and returns the result.

The wire payload is the `ComparisonReport` shape (delta-sized), not two full
findings lists. For a 200-page draft with ~1500 findings each, this matters.

### Pure compare function

```ts
type FindingKey = string  // see "Matching key" below

type Bucket = {
  key: FindingKey
  category: 'kbbi' | 'eyd'
  ruleId: string | null
  token: string | null
  beforeCount: number
  afterCount: number
  delta: number              // afterCount - beforeCount
  sampleBefore: EvaluationFinding | null
  sampleAfter: EvaluationFinding | null
}

type DeltaStat = {
  before: number
  after: number
  delta: number
  pctChange: number | null   // null when before === 0 (no baseline)
}

type ComparisonScoreboard = {
  overallScore: { before: number; after: number; delta: number }
  totalFindings: DeltaStat
  byCategory: Record<'kbbi' | 'eyd', DeltaStat>
  bySeverity: Record<'error' | 'warning' | 'info', DeltaStat>
  durationMs: { before: number | null; after: number | null }
  totalPages: { before: number | null; after: number | null }
}

type RuleDelta = {
  ruleId: string
  category: 'kbbi' | 'eyd'
  before: number
  after: number
  delta: number
}

type ComparisonReport = {
  before: { job: EvaluationJob; summary: EvaluationSummary | null }
  after: { job: EvaluationJob; summary: EvaluationSummary | null }
  scoreboard: ComparisonScoreboard
  resolved: Bucket[]         // beforeCount > 0, afterCount === 0
  stillPresent: Bucket[]     // beforeCount > 0, afterCount > 0
  introduced: Bucket[]       // beforeCount === 0, afterCount > 0
  topRuleReductions: RuleDelta[]   // top 5 by |delta| where delta < 0
  topRuleRegressions: RuleDelta[]  // top 5 by |delta| where delta > 0
  filenameSimilarity: number | null  // 0..1; null when either filename empty
}

export function compareEvaluations(
  before: EvaluationReport,
  after: EvaluationReport,
): ComparisonReport
```

### Matching key

The key is what makes a finding identifiable across two PDFs with different
text offsets and (often) different page numbers:

```
key = `${category}|${ruleId ?? '_'}|${normToken}|${normExcerpt}`

normToken   = (token ?? '').toLowerCase().trim().replace(/[^\p{L}\p{N}-]/gu, '')
normExcerpt = (excerpt ?? '').toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 40)
```

Rationale:
- `category` is mandatory and stable.
- `ruleId` distinguishes EYD rules that fire on the same token (e.g.
  `eyd.di-locative-one-word` vs `eyd.acronym-undeclared`).
- `normToken` is the primary identity for KBBI findings.
- `normExcerpt` window protects against false-collapses in long documents
  where the same token appears in multiple unrelated contexts; 40 chars is
  long enough to disambiguate normal prose, short enough that minor edits
  outside the window do not break the match.

Edge cases — covered by tests:
- `ruleId` null → key uses literal `'_'` (KBBI findings).
- `token` null and `excerpt` null → key is `category|_||`, all such findings
  in a job collapse into one bucket. Counts are still correct.
- A finding repeated 3× in `before` and 1× in `after` with the same key → one
  `Bucket` in `stillPresent` with `beforeCount: 3, afterCount: 1, delta: -2`.

### Bucket sorting and sample selection

- `resolved` — `beforeCount DESC` (biggest wins first).
- `stillPresent` — `afterCount DESC` (most outstanding work surfaced first).
- `introduced` — `afterCount DESC`.
- `sampleBefore` / `sampleAfter` — first finding for that key by
  `(pageNumber ASC, offset ASC)`. Stable across re-renders. UI uses
  `sampleAfter.pageNumber` for the still-present deep-link target.

### Percentage formula

`pctChange = (after - before) / before * 100`, rounded to one decimal.
If `before === 0`, `pctChange = null` and the UI renders `—` with a tooltip
explaining there was no baseline to compare against.

### Filename similarity

A best-effort sanity check, **never blocking**. The function computes a
normalized Levenshtein similarity of the two filenames (after stripping the
extension and trailing version markers like `-v2`, `_rev3`). If similarity is
below 0.5, the UI shows an inline info banner ("Nama file berbeda — pastikan
ini revisi dari dokumen yang sama."). Computed in the pure function, exposed
on `ComparisonReport.filenameSimilarity`.

## Route and URL canonicalization

`/evaluation/compare/$beforeId/$afterId` is the comparison route. The route:

- Local-only: `beforeLoad: () => { if (!isLocalEnv) throw notFound() }`.
- Loader prefetches `getEvaluationComparison`.
- Canonical order: older job by `createdAt` becomes `before`. If the loader
  receives the IDs in the wrong order, it redirects to the canonical order
  with `throw redirect({ to: '/evaluation/compare/$beforeId/$afterId', params: { beforeId: olderId, afterId: newerId }, replace: true })`.
- Validates that both UUIDs are well-formed via the route params schema; an
  invalid UUID falls through to the error component.

## UI

Visual style follows the project rules: stacked `<Section tone="...">` bands,
the Learny pastel palette, doodles as seasoning (max 1–2 per band), Manrope
ExtraBold display, body in Inter, copy in Indonesian, no emoji, no
exclamations, no truncation.

### Section stack

1. **Header** — `tone="sky"`. Kicker "Perbandingan". Headline
   `Sebelum dan <Marker tone="green">sesudah</Marker>.` Two filename pills
   (filename, date, overall score) laid out side-by-side with a small arrow
   doodle between them pointing left→right. Inline filename-mismatch banner
   when `filenameSimilarity < 0.5`.
2. **Scoreboard** — `tone="cream"`. A 1-column-on-mobile, 2-column-on-md,
   4-column-on-lg `.soft-card` grid:
   - Overall score card — large before → after with a delta value and a
     directional arrow (improving = coral; regressing = soft red).
   - Total findings card — counts + `pctChange` (when defined).
   - KBBI card — counts + delta.
   - EYD card — counts + delta.
   Below the grid: a severity strip with three short horizontal bars (error /
   warning / info), each showing before/after side-by-side. Each row's two
   bars are scaled to `max(before, after)` within that severity (so the longer
   bar fills the track and the shorter is proportional). Bars use the severity
   tokens already in `src/styles.css` (`bg-blush` / `bg-butter` / `bg-sky`);
   no raw hex.
3. **Resolved** — `tone="mint"`. Headline `Yang sudah <Marker>beres</Marker>.`
   A vertical list of every resolved bucket. Each row shows:
   - The token (or excerpt if token is null), monospace.
   - The `ruleId` as a small chip.
   - `beforeCount` ("muncul 3× sebelumnya") plus a one-line sample excerpt.
   - No action link — these are gone from the new draft, nowhere to navigate
     to in the new eval.
   - **Every** row shown; no "… and N more". For very long lists, the UI may
     render a `bun`-built virtualized list, but never silently drop rows.
4. **Still present** — `tone="butter"`. Headline
   `Yang masih <Marker>perlu disentuh</Marker>.` Same row shape as Resolved,
   plus:
   - `beforeCount → afterCount` (with delta value when negative — partial
     fixes).
   - A "Buka di evaluation baru" link that deep-links to the new eval with
     the finding highlighted: `/evaluation/<afterId>?highlights=p.<page>;<token>`.
5. **Newly introduced** — `tone="blush"`. Headline
   `Yang baru <Marker>muncul</Marker>.` Same row shape, deep-link to new
   eval.
6. **Rule deltas** — `tone="cream"`. Two small side-by-side soft cards: top-5
   improved rule IDs and top-5 regressed rule IDs. Each row: ruleId chip,
   before count, after count, delta.

### Empty states

- All three lists empty (identical findings) → render a small island
  "Tidak ada perubahan terdeteksi" with a Squiggle doodle and a soft hint
  that the user may have uploaded the same file twice.
- Resolved list empty but others populated → render an island "Belum ada
  yang berhasil dibereskan di evaluation baru."
- Still-present list empty (all old findings resolved) → render a celebratory
  island "Semua temuan dari evaluation sebelumnya sudah tidak muncul lagi."
  No badges, streaks, or exclamations — the project voice is calm.

### History multi-select

On `/history?kind=evaluation`:

- `historySearchSchema` gains an optional `selected: string[]` field
  (comma-separated UUIDs in the URL).
- `HistoryRow` for `kind === 'evaluation'` rows with `status === 'done'`
  renders a checkbox at the left edge. Other rows render a placeholder
  spacer of the same width (the row layout stays aligned).
- Clicking a checkbox toggles the ID in the URL search param `selected`.
  Selection survives pagination.
- A sticky bar at the bottom of the viewport appears when `selected.length >= 1`:
  - `length === 1`: "Pilih satu lagi untuk membandingkan" + a `Batal` button.
  - `length === 2`: "Bandingkan dipilih" primary button → navigates to
    `/evaluation/compare/<older>/<newer>` (canonical order computed
    client-side from each row's `createdAt`).
  - `length > 2`: "Pilih tepat 2 — kamu memilih X" + a `Reset` button.
    Primary button disabled.
- The sticky bar uses the `Section`/pastel idiom (cream surface, coral
  primary button, indigo secondary).

State lives in URL search params, not `useState` (per project rules).

## Error handling

| Case | UX |
|---|---|
| Either ID malformed | TanStack Router validation error → route error component, "ID evaluation tidak valid" + link back to `/history`. |
| Either job not found | `Error('Evaluation tidak ditemukan')` thrown server-side → route error component. |
| Either job not `done` | `Error('Evaluation belum selesai')` thrown server-side → route error component with the offending job's filename and current status. |
| `beforeId === afterId` | Rejected by `evaluationCompareSchema.refine` at the server boundary; the history sticky bar should prevent this client-side, but the server is the source of truth. |
| Either summary row missing (legacy) | Pure function tolerates `summary: null` — the scoreboard cards using summary-derived counts fall back to counting findings live. |

## Testing

### Unit tests — `src/lib/evaluation/compare.test.ts`

| Case | Expectation |
|---|---|
| `compareEvaluations(empty, empty)` | All bucket arrays empty, all delta stats zero, `pctChange: null`. |
| All resolved (before has 5 findings, after has 0) | `resolved.length === 5`, others empty, `totalFindings.delta === -5`, `pctChange === -100`. |
| All still present (identical findings) | `stillPresent.length === N`, others empty, all deltas zero. |
| All introduced (before empty, after has 3) | `introduced.length === 3`, `pctChange: null` (no baseline). |
| Mixed | Counts add up correctly across the three buckets; total = sum of bucket totals. |
| Count-based delta | Before has 3 of key K, after has 1 → one `stillPresent` bucket with `delta: -2`. |
| Null ruleId / null token | Key well-formed, finding still bucketed; no `undefined` in output. |
| Token case normalization | `Pemroses` and `pemroses` collapse to same key. |
| Excerpt whitespace normalization | `'foo  bar'` and `'foo bar'` collapse. |
| Filename similarity | Identical filenames → 1.0; "skripsi.pdf" vs "thesis-final.pdf" → < 0.5. |
| Top-rule deltas | Top 5 reductions sorted by `|delta|` desc, regressions sorted likewise; ties broken by ruleId. |

### Server-function test

Thin smoke test of `getEvaluationComparison`:
- Both jobs `done` → returns the expected shape; matches result of calling
  `compareEvaluations` directly with the same data.
- One job not found → throws.
- One job not `done` → throws.

If the project uses testcontainers in service tests (per `feedback_no_llm_features`
this codebase favors real integration tests with `.claude/pdf_examples/`
fixtures), use that pattern. Otherwise stub the db calls — the heavy logic is
the pure function.

### Manual smoke

- Start dev server, open `/history?kind=evaluation`.
- Tick two `done` rows. Sticky bar appears. Click "Bandingkan dipilih".
- Compare page renders with scoreboard, three buckets, and rule deltas.
- Click a row in "Still present" → lands on the new eval at the correct page
  with the finding highlighted.

## Implementation order

Each step is one commit (Conventional Commits).

1. `feat(evaluation): add compareEvaluations pure function` — `src/lib/evaluation/compare.ts` + Vitest tests. No UI, no service.
2. `feat(evaluation): add getEvaluationComparison server function` — `src/services/evaluation/compare.ts` + Zod schema in `src/schemas/evaluation.ts`. Thin server-side smoke test.
3. `feat(evaluation): scaffold compare route with header and scoreboard` — `src/routes/evaluation/compare/$beforeId/$afterId/index.tsx` plus header and scoreboard sections. Canonical-order redirect. Local-only gating. Loader/error views.
4. `feat(evaluation): add resolved/still-present/introduced sections to compare view` — three list sections and the rule-deltas card.
5. `feat(history): add multi-select and compare entry point` — extend `historySearchSchema`, add checkbox to `HistoryRow`, sticky compare pill in `/history/index.tsx`.
6. `chore(evaluation): smoke test compare flow and build` — manual browser walk-through, then `bun run build` once at the end of the plan (per project convention).

## Open questions

None. If something surfaces during implementation, surface it as a clarifying
question rather than papering over it.
