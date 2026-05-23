# KBBI Evaluation FP-Reduction Loop — Design Spec

**Date:** 2026-05-23
**Owner:** devanfer (with Claude as automation driver)
**Status:** Draft, pending user review

## Goal

Drive the CiteTrack `/evaluation` feature against a real FILKOM skripsi draft (`~/Downloads/Draft_Skripsi_DevanFerrel_FILKOM_UB_v2.pdf`) in a tune-and-rerun loop until KBBI false-positive rate drops to ≤ 15% on the unique-word metric, modifying real source code under `src/services/evaluation/kbbi/` at each iteration.

## Scope

**In scope**
- Iterating on KBBI flagging logic only (not EYD, not FILKOM template).
- Source changes in `src/services/evaluation/kbbi/**` and a new `kbbi/proper-nouns.ts` / `kbbi/abbreviations.ts` data files.
- Every iteration runs end-to-end through Chrome via Browser MCP — upload → poll → results page → snapshot.
- Atomic commits per iteration following Conventional Commits.
- Vitest tests added/updated per iteration to lock in each FP fix.

**Out of scope**
- EYD or FILKOM template tuning (separate features, separate loops).
- Changes to PDF text extraction, parser, or matcher modules — only KBBI checking logic.
- New LLM-based classification (per user memory: no LLM API keys available; heuristics only).
- Modifying the PDF, vitest fixtures, or any other golden files.
- Hardcoded per-token suppressions (e.g. `if (word === "DevanFerrel") return ok`). All rules must generalize; per-PDF tokens go in *data* files only.

## Architecture

```
Driver: my turn-loop in this Claude Code session.

for iter in 1..N (N_max = 10):
  1. Browser MCP → /evaluation, upload PDF, poll until job status = done
  2. Browser MCP → /evaluation/$evalId, snapshot findings (paginate as needed)
  3. Persist iter-NN/findings.json (raw scrape, structured)
  4. Apply classification heuristic → label each unique flagged token TP|FP + reason
  5. Persist iter-NN/classified.json + iter-NN/fp_summary.md (FP-class breakdown)
  6. Diff vs iter-(NN-1) → iter-NN/diff.md (rate delta, new FPs, lost TPs)
  7. If FP_rate ≤ 0.15 → STOP (success path → final verification)
  8. If iter == 10 → STOP (hard cap, report best iter)
  9. If 3 consecutive iters with Δ < 0.02 → STOP (plateau)
 10. Otherwise: pick dominant FP class → apply single Tier-0/1/2/3 change
 11. Add focused vitest covering that class (fail → pass)
 12. Commit (conventional), save iter-NN/change.patch
 13. Dev server HMR picks change up; loop continues
```

### Source-change surface (priority order, smallest blast radius first)

| Tier | Files | Examples |
|------|-------|----------|
| 0 — data only | new `kbbi/proper-nouns.ts`, append `kbbi/english.ts`, new `kbbi/abbreviations.ts` | "TanStack", "FILKOM", "skripsi", "et al" |
| 1 — small logic | `kbbi/checker.ts`, `kbbi/utils/normalize.ts`, `kbbi/cari.ts`, `kbbi/lookup.ts` | skip-conditions, morphology stripping, parser fixes |
| 2 — analyzer/token-stream | `kbbi/analyzer.ts` | context-aware filters (skip token after "oleh", "menurut", "Prof.") |
| 3 — last resort | `evaluation/orchestrator.ts`, `kbbi/suggester.ts` | only if Tiers 0–2 plateau |

### Pre-edit safety (mandatory per CLAUDE.md global rules)

For every iteration's code change:
1. `find_referencing_symbols` (Serena) on the target symbol
2. `get_impact_radius_tool` (CRG) on the target file
3. Save both to `iter-NN/preedit.md`

### Post-edit follow-up

1. `build_or_update_graph_tool(mode=incremental)`
2. `list_graph_stats_tool`
3. Atomic commit, then save the patch to `iter-NN/change.patch`

## FP Classification Heuristic

Applied per unique flagged token; first matching rule wins.

| # | Rule | Reason class | Verdict |
|---|------|--------------|---------|
| 1 | Token in `kbbi/english.ts` list, or matches a common English word (≥80% letter overlap), or contains letter patterns rare in Indonesian (`wh-`, `-tion`, `-ing`, `qu-`) | English loanword | **FP** |
| 2 | Capitalized mid-sentence matching PascalCase, or preceded in source text by a name-suggesting word (`oleh`, `menurut`, `Universitas`, `Prof.`, `Dr.`) | Proper noun | **FP** |
| 3 | Contains digits, underscores, or is all-uppercase ≥ 3 chars | Identifier / acronym | **FP** |
| 4 | Matches academic abbreviation list (`dkk`, `dsb`, `dll`, `dst`, `yth`, `tsb`, `et`, `al`, `pp`, `vol`, `no`, `ed`) after lowercasing and stripping punctuation | Abbreviation | **FP** |
| 5 | After re-normalization (strip suffixes `-nya`/`-lah`/`-kah`/`-pun`, strip prefixes `me-`/`di-`/`ter-`/`ber-`/`ke-`/`pe-`), matches a KBBI entry via `kbbi/lookup.ts` | Missed by morphology | **FP** |
| 6 | 1-character token, or whitespace/hyphenation artifact (`-`, `‑`, `−`) | Tokenization noise | **FP** |
| 7 | Length ≤ 2 and not in KBBI | Likely particle / noise | **FP** |
| 8 | None of the above match | Genuine misspelling | **TP** |

**Bias rule:** when rule 2 or rule 5 only weakly applies, default to TP — better to under-claim FPs than to mask a real spelling error.

### Metric

```
FP_rate = unique_FP_tokens / unique_flagged_tokens
```

Per-unique-word, so a single noisy token (e.g. "TanStack" appearing 200×) doesn't dominate. Per-finding rate is tracked alongside for UX context only — **stop condition is per-unique-word ≤ 0.15.**

## Failure Modes & Termination

| Condition | Action |
|-----------|--------|
| `FP_rate ≤ 0.15` | **Success.** Final browser verification → `iter-FINAL/`, write `SUMMARY.md`. |
| `iter == 10` | **Hard cap.** Report best-iter; do not claim convergence. |
| 3 consecutive iters with `Δ < 0.02` | **Plateau.** Stop, report sticky FP classes. |
| `iter-N FP_rate > iter-(N-1) FP_rate` | **Regression.** `git revert` that commit; try a different change next iter (does *not* increment toward hard cap). |
| TP from iter-(N-1) missing in iter-N | **Real-error masking.** Treat same as regression. |
| Browser MCP times out twice on same iter (poll every 10s, 5 min cap per upload) | **Bail.** Save partial state in `iter-NN/error.md`, surface to user. |

### Resumability

Each `iter-NN/` folder is self-contained. Before any iteration starts, find the highest existing `iter-NN/` and resume:
- Folder present with `change.patch` → iter complete, move to NN+1.
- Folder present without `change.patch` → iter in-flight, redo from scrape.

### Preconditions verified before iter-01

- `bun run dev` is up on port 3000 (curl `http://localhost:3000` returns 200).
- Working tree is clean (no uncommitted changes outside `docs/train/`).
- `~/Downloads/Draft_Skripsi_DevanFerrel_FILKOM_UB_v2.pdf` exists and is < 50 MB.
- Vite HMR confirmed by editing a no-op comment in a KBBI file and watching the dev-server log reload (rolled back before iter-01 starts).

### Starting state pinned

`iter-01/start.md` records:
- git SHA at loop start
- list of modified files (must be clean tree)
- dev-server PID and port

Lets the user `git reset --hard <SHA>` to undo everything.

## Artifacts

```
docs/train/iterations/
  iter-01/
    start.md           # git SHA, clean-tree check, dev server status
    preedit.md         # find_referencing_symbols + impact_radius output
    findings.json      # raw scrape from /evaluation/$evalId
    classified.json    # [{token, label: TP|FP, reason}]
    fp_summary.md      # FP rate, breakdown by reason class
    diff.md            # (empty for iter-01) vs iter-(NN-1)
    change.patch       # source diff applied this iter
  iter-02/
    ...
  iter-FINAL/
    browser-snapshot.txt   # accessibility snapshot of converged UI
  SUMMARY.md           # per-iter FP rate, changes, regressions
```

## What I Will Not Do

- Hardcode the specific PDF's tokens into code (allowlist data files only).
- Skip ahead by tuning multiple FP classes in one iter.
- Use `--no-verify` to bypass pre-commit hooks.
- Add `// oxlint-disable-next-line` to make lint pass.
- Modify the PDF, vitest fixtures, or any other golden files between iters.
- Use `any`, `unknown`, `useState`, `useEffect`, or raw `process.env` (per project CLAUDE.md).
- Bundle the loop driver script into production — driver code, if any, lives under `scripts/` and is not deployed.

## Open Questions for the User

None — all four design sections approved during brainstorming. Spec is ready for review.

## Assumptions

- The CiteTrack dev server is running locally on port 3000 throughout the loop (the user is currently in a browser session against it).
- Vite HMR correctly picks up `src/services/evaluation/kbbi/**` edits without manual restart. If this turns out false, the loop will detect it via the regression-guard (no change in FP rate after a known-good edit) and stop with a diagnostic in `iter-NN/error.md`.
- Job IDs are unique per upload; each iter produces a fresh `$evalId`. The loop does not attempt to reuse a prior job's results.
- The PDF is in Bahasa Indonesia with mixed English technical terms — the heuristic is calibrated for that, not for an all-English document.

## Next Step

User reviews this spec. On approval, I invoke the `superpowers:writing-plans` skill to produce a detailed implementation plan (per-iteration runbook).
