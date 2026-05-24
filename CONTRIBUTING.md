# Contributing to CiteTrack

Thanks for being here. CiteTrack is a draft-checking tool for Indonesian skripsi writers; the more people poking at it, the better it gets.

This doc covers setup, the conventions a change should follow, and what we expect on the PR title.

## Before you start

- Read the [README](./README.md). It explains what CiteTrack does and how to run it.
- Skim [`.claude/CLAUDE.md`](./.claude/CLAUDE.md). It lists the **strict** rules this codebase enforces (no `any`, no `useState`/`useEffect` by default, no hardcoded colors, and so on). The pre-commit hook will reject most violations anyway, but reading this up front saves a round-trip.
- For evaluation feature work, also read [`.claude/KNOWLEDGE_BASE.md`](./.claude/KNOWLEDGE_BASE.md). That's where the KBBI integration and the full EYD rule set live. When in doubt about a rule, that file wins over memory.

## Setting up

Quickest path is `docker compose up --build`. Everything is bootstrapped on first boot. For day-to-day work, run Bun directly:

```bash
bun install
bun run dev          # dev server on :3000
bun run test:unit    # vitest, skips integration suites (see Tests below)
bun test             # full vitest run — needs author PDFs in .claude/pdf_examples/
bun run lint         # oxlint check
bun run lint:fix     # oxlint auto-fix
```

Full setup steps, env vars, and troubleshooting live in the [README](./README.md).

## Pull request title format

> **Required.** Titles that don't match get sent back for renaming before review.

```
[<TYPE>] [<FEATURE>] short description
```

- `<TYPE>` is one of: `feat`, `fix`, `refactor`, `docs`, `chore`, `perf`, `style`, `test`, `ci`.
- `<FEATURE>` is the area being touched. `Track`, `Evaluation`, `History`, `Results`, `Settings`, `PDF`, `Auth`, `DB`, `Docs`, and so on.
- The description is one short sentence in imperative mood. No trailing period.

Examples:

```
[feat] [Evaluation] add mark-resolved per finding
[fix] [Track] handle missing year in reference parser
[refactor] [PDF] hoist firstNonSpace helper out of extractPage
[docs] [README] clarify .env DATABASE_URL setup
[perf] [Evaluation] skip offscreen findings with content-visibility
```

If your PR really spans two features, split it. If you can't, pick the more user-visible one for `<FEATURE>` and explain the rest in the body.

## Pull request workflow

1. **Fork and branch.** Short, descriptive name: `feat/<name>`, `fix/<name>`, `refactor/<name>`, `docs/<name>`.
2. **Write the change.** One concern per PR. Atomic commits in [Conventional Commits](https://www.conventionalcommits.org/) form. Husky runs `oxlint --fix` on staged files before each commit. Don't bypass it with `--no-verify`. Fix the lint instead.
3. **Test it.** `bun test` runs the vitest suite (read [Tests](#tests) before you panic at the red lines). For UI work, also drive the change in the browser and screenshot anything visual. For evaluation work, the relevant `.claude/scripts/` diagnostic is your friend (see [Local diagnostic tooling](#local-diagnostic-tooling) below).
4. **Open the PR** using the title format above. In the body, cover:
   - What changed: one or two sentences on the diff.
   - Why: the motivation, especially when it's not obvious from the code.
   - How to test: concrete steps a reviewer can take locally.
   - Screenshots or short GIFs for UI changes.
   - `Closes #N` if it resolves a tracked issue.
5. **Iterate.** Append fixup commits during review instead of force-pushing. The maintainer will squash at merge time. Keep the conversation in the PR thread, not DMs.

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

Yes, the PR title and the commit messages use two different conventions. That's deliberate. The bracketed PR title is easier to scan in the GitHub list view. The dotted commit format plays nicely with tooling like `git log --oneline` and changelog generators.

## Code style highlights

Full rules in [`.claude/CLAUDE.md`](./.claude/CLAUDE.md). The shortest possible summary:

- Types: no `any` or `unknown` unless you genuinely can't avoid them. Use Zod for runtime validation, then derive types with `z.infer<>`.
- State: no `useState` or `useEffect` by default. TanStack Query for server state, TanStack Form for form fields, Zustand for global client state.
- Styling: Tailwind CSS v4 with design tokens from `src/styles.css`. No raw hex colors. Use `rem`, `vh`, or `%` for layout sizing. `px` is reserved for borders, focus rings, and 1–2px optical nudges.
- Imports: use the `#/*` alias for everything under `src/`.
- Environment: read from `env` in `src/env.ts`. Don't reference `process.env` outside that file.
- Docs lookup: for TanStack or Tailwind v4 APIs, consult context7 (`resolve-library-id`, then `query-docs`). Those APIs move faster than you'd expect.

The pre-commit hook catches most violations. CI catches the rest.

## Tests

Two commands, depending on what you have on disk:

```bash
bun run test:unit   # skips integration suites — use this on a fresh clone
bun test            # full vitest run — needs author PDFs in .claude/pdf_examples/
```

`bun run test:unit` excludes every file matching `**/*.integration.test.ts`. Currently that's:

- `tests/services/track/track-pipeline.integration.test.ts`
- `tests/services/evaluation/pdf-evaluation.integration.test.ts`

Both feed real thesis PDFs through the parser, matcher, extractor, KBBI lookup, and EYD analyzer. Those PDFs live in `.claude/pdf_examples/`, which is **gitignored**. They're someone's actual skripsi (the maintainer's, plus a couple of published journal articles used as fixtures), so we can't ship them with the repo. If the directory is empty on your machine, `bun test` will fail with file-not-found errors or report 0% match coverage on those suites. That is the expected state — run `bun run test:unit` instead.

If you want to exercise the integration suites yourself, drop your own thesis PDFs into `.claude/pdf_examples/` using the filenames the tests reference (`thesis_example.pdf`, `14484.pdf`, and so on — open the test file for the exact list). Tweaking the thresholds or expected match counts to fit your fixtures is fine for local iteration; revert that before opening a PR.

New integration tests that depend on private fixtures should follow the same naming convention (`*.integration.test.ts`) so they're picked up by the same exclude pattern. Don't gate them on `process.env.SOMETHING` inside the file — the filename is the source of truth.

For PR reviews, treat `bun run test:unit` as required and the integration suites as informational. The maintainer runs the integration suites against a private fixture stash before merging anything that touches the parser, matcher, extractor, KBBI lookup, or EYD analyzer.

## Smoke and regression testing

Automated tests catch a lot but not everything. Before opening a PR, drive the change in the running app — load the page, run the flow, look at the actual output.

- **Smoke the thing you changed.** Upload flow → upload a PDF. Evaluation findings → open an evaluation and click around. Parser change → run `.claude/scripts/run-iteration.ts` or `run-track-iteration.ts` against a real thesis.
- **Regression-check the neighbours.** Pick one or two adjacent flows that share code paths and exercise them too. If you edited a service, run both callers. If you changed a shared UI primitive, eyeball one other page that uses it. The goal is catching breakage that's downstream of your diff, not auditing the whole app.
- **Write what you did into the PR body.** Under "How to test", describe what *you* actually did to verify — not what a hypothetical reviewer should do. "Opened evaluation, marked 3 findings resolved, refreshed, confirmed they stayed resolved" is the right shape.

Exception: when the change is a deliberate behavior shift — a redesign, a UX rework, an intentional feature removal — there's no old behavior to regress against. Test against the new spec instead. Refactors and perf work are **not** exceptions; their whole goal is "same behavior, different shape", which is exactly what regression catches.

## Local diagnostic tooling

`.claude/scripts/` contains Bun TypeScript helpers for local testing and ad-hoc diagnosis. Use them before claiming a fix works:

- `test-autofetch.ts` exercises the PDF provider chain against `.claude/pdf_examples/thesis_example.pdf`. Run this after any change to `src/services/pdf/finder.ts` or `src/services/pdf/auto-fetch.ts`.
- `classify-kbbi-iter.ts` classifies KBBI iteration findings as TP/FP via a deterministic heuristic.
- `run-iteration.ts` and `run-track-iteration.ts` are full-pipeline iteration runners for Evaluation and Track.
- `diff-iterations.ts` diffs two `iter-NN` folders to surface regressions.

Outputs go to `.claude/scripts/output/` (gitignored). Don't commit run artefacts. And don't promote a script from there to `src/`. If a diagnostic needs to ship as a real feature, build a proper module under `src/services/` with tests.

## Reporting a bug

Open an issue with:

- What you expected.
- What actually happened (error message, screenshot, logs).
- Steps to reproduce. For upload-related bugs, a sample PDF (or even a redacted snippet) helps a lot.
- Browser, OS, and Bun version when they might be relevant.

If the issue is sensitive (security vulnerability, contains personal thesis content), reach the maintainer privately instead of filing a public issue.

## Suggesting a feature

Open an issue first describing the user-facing problem before writing the patch. CiteTrack is for Indonesian thesis writers across every discipline (engineering, biomedicine, law, humanities, education) and their advisors. A proposed feature should be defensible for that user, not just for your own workflow.

## Questions

If anything here is unclear, open an issue. That's usually the fastest way to get an answer.
