# Contributing to CiteTrack

Thanks for taking the time to contribute. CiteTrack is a draft-checking tool for Indonesian students writing their skripsi — your help making it more useful is welcome.

This document covers how to set up a working copy, the conventions a change should follow, and the format we expect on pull requests.

## Before you start

- Read the [README](./README.md) for what CiteTrack does and how to run it.
- Skim [`.claude/CLAUDE.md`](./.claude/CLAUDE.md). It lists the **strict** rules this codebase enforces — no `any`, no `useState`/`useEffect` by default, no hardcoded colors, etc. The pre-commit hook catches most violations; reading this first saves you a round-trip.
- For evaluation feature work, also read [`.claude/KNOWLEDGE_BASE.md`](./.claude/KNOWLEDGE_BASE.md). It consolidates the KBBI dictionary integration and the full EYD rule set — the source of truth for any rule-writing or prompt work.

## Setting up

The quickest path is `docker compose up --build` (everything is bootstrapped on first boot). For active development with HMR use Bun directly:

```bash
bun install
bun run dev          # dev server on :3000
bun test             # vitest
bun run lint         # oxlint check
bun run lint:fix     # oxlint auto-fix
```

Full setup steps, env vars, and troubleshooting live in the [README](./README.md).

## Pull request title format

> **Required.** PRs whose titles don't match this format will be asked to rename before review.

```
[<TYPE>] [<FEATURE>] short description
```

- `<TYPE>` is one of: `FEAT`, `FIX`, `REFACTOR`, `DOCS`, `CHORE`, `PERF`, `STYLE`, `TEST`, `CI`.
- `<FEATURE>` is the area being touched: `Track`, `Evaluation`, `History`, `Results`, `Settings`, `PDF`, `Auth`, `DB`, `Docs`, etc.
- The description is one short sentence in imperative mood. No trailing period.

Examples:

```
[FEAT] [Evaluation] add mark-resolved per finding
[FIX] [Track] handle missing year in reference parser
[REFACTOR] [PDF] hoist firstNonSpace helper out of extractPage
[DOCS] [README] clarify .env DATABASE_URL setup
[PERF] [Evaluation] skip offscreen findings with content-visibility
```

If a PR genuinely spans two features, prefer splitting it. If you can't, name the more user-visible one in `<FEATURE>` and explain the scope in the description.

## Pull request workflow

1. **Fork & branch.** Use a short, descriptive name: `feat/<name>`, `fix/<name>`, `refactor/<name>`, `docs/<name>`.
2. **Write the change.** Keep one concern per PR. Atomic commits using [Conventional Commits](https://www.conventionalcommits.org/) (`feat(scope): …`, `fix(scope): …`). Husky runs `oxlint --fix` on staged files before each commit — don't bypass with `--no-verify`; fix the lint instead.
3. **Test it.** `bun test` for the full vitest suite. For UI work, drive the change in the browser and screenshot anything visual. For evaluation work, the relevant `.claude/scripts/` diagnostic is your friend (see [Local diagnostic tooling](#local-diagnostic-tooling) below).
4. **Open the PR** with the title format above and a body that covers:
   - **What** changed — one or two sentences on the diff.
   - **Why** — the motivation, especially when the change isn't obvious from the code.
   - **How to test** — concrete steps a reviewer can take to verify locally.
   - Screenshots / short GIFs for UI changes.
   - `Closes #N` if it resolves a tracked issue.
5. **Iterate.** Append fixup commits during review rather than force-pushing — the maintainer will squash at merge time. Keep the conversation in the PR thread.

## Commit messages

Conventional Commits, one concern per commit:

```
<type>[optional scope]: <subject>

[optional body explaining why]

[optional footer]
```

Allowed types: `feat`, `fix`, `refactor`, `chore`, `docs`, `test`, `style`, `ci`, `perf`.

Examples:

```
feat(evaluation): add mark-resolved per finding
fix(track): handle missing year in reference parser
refactor(pdf): hoist firstNonSpace helper out of extractPage
docs(readme): clarify .env DATABASE_URL setup
```

Note: commits use Conventional Commits (`feat(scope): …`); PR titles use the bracketed format (`[FEAT] [Scope] …`). Both styles coexist on purpose — the bracketed PR title is easier to scan in the GitHub list, the commit format is friendlier for tooling.

## Code style highlights

The full list of rules lives in [`.claude/CLAUDE.md`](./.claude/CLAUDE.md). The headlines:

- **Types** — no `any` / `unknown` unless strictly unavoidable. Use Zod for runtime validation; derive types with `z.infer<>`.
- **State** — no `useState` / `useEffect` by default. TanStack Query for server state, TanStack Form for form fields, Zustand for global client state.
- **Styling** — Tailwind CSS v4. Use the design tokens defined in `src/styles.css`; never hardcode colors. Prefer `rem` / `vh` / `%` over `px` for layout sizing; `px` is reserved for borders, focus rings, and 1–2px optical nudges.
- **Imports** — use the `#/*` alias for everything under `src/`.
- **Environment** — read from `env` in `src/env.ts`. Never reference `process.env` outside that file.
- **Documentation lookup** — for TanStack or Tailwind v4 APIs, consult context7 (`resolve-library-id` → `query-docs`). Training data goes stale.

The pre-commit hook catches most violations. CI fails the rest.

## Local diagnostic tooling

`.claude/scripts/` contains Bun TypeScript helpers for local testing, iteration, and ad-hoc diagnosis. Use them before claiming a fix works:

- `test-autofetch.ts` — exercises the PDF provider chain against `.claude/pdf_examples/thesis_example.pdf`. Run after changes to `src/services/pdf/finder.ts` or `src/services/pdf/auto-fetch.ts`.
- `classify-kbbi-iter.ts` — classifies KBBI iteration findings as TP/FP with a deterministic heuristic.
- `run-iteration.ts` / `run-track-iteration.ts` — full-pipeline iteration runners for Evaluation and Track.
- `diff-iterations.ts` — diffs two `iter-NN` folders to surface regressions.

Outputs go to `.claude/scripts/output/` (gitignored). Never commit run artefacts. Don't promote a script from there to `src/` — if it needs to ship, build a proper module under `src/services/` with tests.

## Reporting a bug

Open an issue with:

- What you expected to happen.
- What actually happened (error message, screenshot, logs).
- Steps to reproduce. For upload-related bugs, a sample PDF or the structure of the input is invaluable.
- Browser / OS / Bun version when it might be relevant.

If the issue is sensitive (e.g., a security vulnerability or contains personal thesis content), reach the maintainer privately rather than filing publicly.

## Suggesting a feature

Open an issue first describing the user-facing problem before writing the patch. CiteTrack's audience is Indonesian thesis writers across every discipline (engineering, biomedicine, law, humanities, education) and their advisors. A proposed feature should be justifiable for that user, not only for the contributor's own workflow.

## Questions

If anything here is unclear, open an issue — it's usually the fastest way to get an answer, and it helps the next person too.
