# Auto-Apply After Evaluation — Design

**Date:** 2026-06-01
**Status:** Approved, executing
**Approach:** A (two application engines, shared selection UI)

## Problem

After a thesis is evaluated, the student gets a list of KBBI/EYD findings, each
carrying a concrete `suggestion` for the mechanical ones. Today they must apply
every fix by hand. Two situations:

1. The student only has the PDF they uploaded.
2. The student also has the original `.docx` and wants the fixes written into it.

We want an "auto-apply" feature that turns accepted findings into an edited
document the student can download.

## Key technical facts (verified against the codebase)

- `evaluationPages.content` holds the exact per-page extracted text. Finding
  offsets index **exactly** into it — `token` is literally
  `content.slice(offset, offset + length)` (see `eyd/checker.ts`). So the
  PDF-only path needs no fuzzy matching: it is an exact offset splice.
- Findings (`evaluation_findings`) carry `category`, `severity`, `pageNumber`,
  `offset`, `length`, `excerpt`, `token`, `suggestion`, `ruleId`, `resolvedAt`.
- The 18 mechanical EYD rules and KBBI spelling findings produce a non-null
  `suggestion`. Findings without a suggestion cannot be auto-applied.
- The uploaded PDF is stored at a path derived from the job id via
  `src/lib/paths.ts` (`paths.evaluationPdf(jobId)`); `evaluationJobs` has no
  path column, so no schema change is needed to locate files.
- No docx library is installed. Editing/generating `.docx` requires new deps.
- A user-provided `.docx` stores text split across `<w:r>` runs with a layout
  different from the extracted text, so it needs context-anchored find/replace
  (`token` near `excerpt`), not offsets.

## Decisions (from brainstorming)

- **PDF-only output:** generate a rebuilt corrected `.docx`.
- **Trust model:** per-finding selection in the UI, then hard-apply (review
  happens before applying, not after). Nothing applied without an explicit
  submit.
- **Fix scope:** every finding with a `suggestion` is eligible; EYD fixes
  pre-checked, KBBI spelling unchecked (opt-in per word).

## Architecture

New module `src/services/evaluation/apply/`:

- `eligibility.ts` — `isEligible(finding)` = non-null `suggestion`; default-check
  state (`category === 'eyd'` checked, `kbbi` unchecked). Excludes resolved.
- `rebuild-docx.ts` — PDF-only path. Loads pages by `pageNumber`; for each page
  takes selected findings, sorts offsets **descending**, splices
  `content.slice(0,offset) + suggestion + content.slice(offset+length)`.
  Descending order keeps earlier offsets valid. Emits one `docx` paragraph per
  source line. Exact, deterministic.
- `patch-docx.ts` — has-docx path. Unzip with `pizzip`, read
  `word/document.xml`. For each selected finding, find `token` in the
  concatenated run text, disambiguated by nearest match to `excerpt`. Replace
  within run(s), merging across `<w:r>` boundaries when a token is split.
  Rezip. Any `token` not found is **not guessed** — recorded in the change log
  as "tidak ditemukan di dokumen".
- `change-log.ts` — shared. Builds a human-readable report: every applied edit
  (page, token → suggestion, rule) and every unlocated fix. Shows **all**
  entries, never truncates (CLAUDE.md content rule).
- `index.ts` — `applyEvaluationFixes` server fn: input
  `{ evalJobId, findingIds[], hasDocx }` + optional docx form-data. Routes to
  the right engine, writes output to `paths.evaluationApplied(jobId)`, marks
  applied findings `resolved`, returns the change-log summary + download info.

## Data flow

1. Results page `/evaluation/$evalId` (findings already computed).
2. "Terapkan perbaikan" panel: eligible findings as a checklist (EYD checked,
   KBBI unchecked; resolved excluded; no-suggestion findings shown disabled).
3. Optional `.docx` upload.
4. Submit → `applyEvaluationFixes`.
5. Server routes to engine, produces `.docx` + change log, marks findings
   resolved (idempotent — resolved findings are excluded from re-runs).
6. Client downloads `.docx`, shows matched-vs-unlocated summary.

## Files

- `src/services/evaluation/apply/{index,rebuild-docx,patch-docx,change-log,eligibility}.ts`
- `src/schemas/evaluation.ts` — apply-input Zod schema
- `src/lib/paths.ts` — `evaluationApplied()`, `evaluationDocxUpload()`
- `src/routes/evaluation/$evalId/-sections/apply-panel.tsx`
- `.claude/scripts/test-apply.ts` — diagnostic
- Tests under the same module / `src/**/*.test.ts`
- New deps: `docx`, `pizzip`. No DB schema change.

## Testing

Vitest unit tests: offset-splice (descending order, multiple findings on one
page), eligibility defaults, change-log generation, and patch-docx against a
fixture `.docx` (token split across runs; token absent → unlocated).

## Commit plan (atomic, revertable)

1. `chore(deps): add docx and pizzip for auto-apply`
2. `feat(apply): eligibility + change-log shared modules`
3. `feat(apply): rebuild corrected docx from page offsets (PDF-only path)`
4. `feat(apply): context-anchored docx patching (has-docx path)`
5. `feat(apply): applyEvaluationFixes server fn + paths + schema`
6. `feat(evaluation): apply-panel UI on results page`
7. `test(apply): unit tests for splice, eligibility, change-log, patch`
8. `chore(scripts): test-apply diagnostic`

Each commit is self-contained. The UI commit (6) depends on the server fn (5);
reverting 6 alone removes only the UI surface.
