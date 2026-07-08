---
name: testing
description: Use when writing, validating, enhancing, or reviewing Vitest tests in CiteTrack — unit tests for parsers, matchers, EYD/KBBI analyzers, PDF extraction, or Effect services, and integration tests that exercise real fixtures (PDFs in `.claude/pdf_examples/`, real Postgres via testcontainers, or full pipelines). Triggers include "add tests", "raise coverage", "this test is flaky", "review the test suite", "write an FP guard test", or "this test should be integration not unit".
---

# Testing — Vitest + CiteTrack conventions

CiteTrack ships unit and integration tests in `tests/`, mirroring `src/`, all driven by Vitest. This skill captures the conventions a new test must follow and how to validate or enhance an existing one. It is **not** generic TDD advice — every pattern here is taken from a test that already lives in this repo.

## Architecture

```
Vitest (NODE_ENV=test) → vitest.config.ts → tests/setup.ts (loads .env.local)
                                          → tests/**/*.test.ts          (unit)
                                          → tests/**/*.integration.test.ts (integration)
                                          → tests/perf/*.test.ts        (excluded by default)
```

`bun run test` runs everything except perf. `bun run test:unit` excludes integration. `bun run test:perf` runs only `tests/perf/` with `PERF=1`.

## File locations

| Concern | Path |
|---------|------|
| Vitest config | `vitest.config.ts` |
| Global setup (dotenv) | `tests/setup.ts` |
| Unit tests | `tests/<area>/<thing>.test.ts` |
| Integration tests | `tests/<area>/<thing>.integration.test.ts` |
| Perf/bench/stress | `tests/perf/*.test.ts` (PERF=1) |
| PDF fixtures | `.claude/pdf_examples/*.pdf` (gitignored) |
| Service under test | `src/services/<area>/<file>.ts` |
| Path alias | `#/*` → `src/*` (configured in `package.json`) |

Tests mirror service layout. `src/services/parser/citation-parser.ts` → `tests/services/parser/citation-parser.test.ts`.

## Unit vs. Integration — how to decide

Use **unit** (`*.test.ts`) when:

- The function under test is pure or only touches deterministic data (regex, parsing, ranking, affix stripping).
- All inputs can be expressed inline in the test (string fixtures, `makePage(...)` helpers).
- No PDF read, no DB, no network, no vocabulary cache load > 1s.

Use **integration** (`*.integration.test.ts`) when:

- A real PDF from `.claude/pdf_examples/` is loaded with `extractPdfText`.
- The full pipeline runs end-to-end (extractor → parser → matcher, or extractor → analyzer).
- A vocabulary cache, dictionary dump, or any background load is needed.
- A real Postgres / testcontainer is involved (currently only `tests/perf/kbbi-tor-bridge.test.ts` — extend the same pattern for any DB-touching integration test).

If a test takes > 5 seconds or needs `beforeAll` to warm a cache, it is integration. Rename it.

## Creating a unit test

Use this shape. Real example: `tests/services/evaluation/kbbi/lookup.test.ts`.

```typescript
import { describe, expect, it } from 'vitest'
import { stripAffixesForTest } from '#/services/evaluation/kbbi/lookup'

describe('stripAffixes — meN- allomorph for vowel-initial bases', () => {
  it('mengeksekusi → eksekusi (meng + vowel)', () => {
    expect(stripAffixesForTest('mengeksekusi')).toContain('eksekusi')
  })

  it('menyusun → susun (meny + vowel, restore s)', () => {
    expect(stripAffixesForTest('menyusun')).toContain('susun')
  })
})
```

Rules for unit tests:

1. Import the **internal-named export** that exists for testing (e.g. `stripAffixesForTest`). Don't reach inside private modules — if there is no `*ForTest` export, add one to the service.
2. One behaviour per `it`. Use `describe` to group by feature, not by file.
3. Title format: short input → expected output, with reason in parens (`(meng + vowel)`).
4. Use `.toContain` when the function legitimately returns multiple candidates (affix stripping returns variants). Use `.toBe` / `.toEqual` for exact equality.
5. No mocks. If you need to mock to test pure logic, the function is doing too much — refactor.

## Creating an integration test

Use this shape. Real example: `tests/services/evaluation/pdf-evaluation.integration.test.ts`.

```typescript
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { extractPdfText } from '#/services/pdf/extractor'
import { analyzeEyd } from '#/services/evaluation/eyd/analyzer'
import { refreshVocabularyCache } from '#/services/evaluation/vocabulary-cache'

const THESIS_PDF = resolve(process.cwd(), '.claude/pdf_examples/thesis_example.pdf')

beforeAll(async () => {
  await refreshVocabularyCache()
})

const loadPdf = async (path: string): Promise<AnalyzedPage[]> => {
  const buf = await readFile(path)
  const { pages } = await extractPdfText(new Uint8Array(buf))
  return pages.map((p) => ({
    pageNumber: p.pageNumber,
    content: p.content,
    codeRanges: p.codeRanges,
    italicRanges: p.italicRanges,
  }))
}

describe('analyzers — respect structural ranges', () => {
  it('produces zero EYD findings inside code ranges (thesis)', async () => {
    const pages = await loadPdf(THESIS_PDF)
    const findings = await analyzeEyd(pages)
    for (const f of findings) {
      const page = pages.find((p) => p.pageNumber === f.pageNumber)
      if (!page) continue
      for (const [s, e] of page.codeRanges) {
        expect(f.offset < s || f.offset >= e).toBe(true)
      }
    }
  }, 120_000)
})
```

Rules for integration tests:

1. End the filename with `.integration.test.ts` so `bun run test:unit` skips it.
2. Always set an explicit timeout as the third arg to `it(...)`. KBBI-touching tests need `600_000`; PDF-only tests need `60_000`–`120_000`.
3. Use `beforeAll` to warm any expensive cache (`refreshVocabularyCache`, vector index load). Never put this in `beforeEach`.
4. Resolve PDF paths from `process.cwd()`, not `__dirname`. The repo runs Vitest from the project root.
5. Don't snapshot the full findings list — assertions should describe **structural invariants** (no findings inside code ranges, no findings on TOC pages) or **named regressions** (a specific known typo must be flagged).

## Two patterns CiteTrack uses heavily

### Positive controls next to FP guards

Every false-positive guard test must be paired with a positive-control test that proves the rule still fires when it should. Real example from `tests/services/evaluation/eyd-acronym-guards.test.ts`:

```typescript
it('skips Indonesian section-header words on TOC / chapter title pages', async () => {
  const tokens = await acronymTokens([makePage(1, 'DAFTAR ISI\nBAB 1 PENDAHULUAN\n')])
  for (const word of ['DAFTAR', 'BAB']) {
    expect(tokens, `expected "${word}" to be filtered`).not.toContain(word)
  }
})

it('still flags genuinely undeclared acronyms in prose (positive control)', async () => {
  const tokens = await acronymTokens([
    makePage(1, 'Penelitian ini mengacu pada laporan QNBP tahun 2023.'),
  ])
  expect(tokens).toContain('QNBP')
})
```

Without the positive control, a regex that accidentally filters everything still passes. **A FP-suppression test without a positive control is incomplete — reject it in review.**

### Descriptive expect messages

Use the second argument of `expect` to attach a message that survives in CI logs:

```typescript
expect(tokens, `expected "${word}" to be filtered`).not.toContain(word)
expect(failures, failures.slice(0, 10).join('\n')).toHaveLength(0)
expect(bad, bad.slice(0, 10).join('; ')).toHaveLength(0)
```

This turns "expected 0 to be 0" failures into something actionable. Required for integration assertions that loop over many items.

## Testing Effect-TS services

Two cases:

**1. Service exposes a plain async wrapper (preferred).** Most CiteTrack analyzers do this — `analyzeEyd`, `analyzeKbbi`, `extractPdfText` are async functions that internally run an Effect with the right Layer. Test them directly with `await`. No Effect imports in the test.

**2. You must test the Effect itself (e.g. a service function that returns `Effect<T, E, Db>`).** Provide `DbLayer` and run with `Effect.runPromise`. Mirror `src/lib/db.ts` setup. Real DB only — do not mock Drizzle. Use a testcontainer Postgres for isolation (extend the pattern from `tests/perf/kbbi-tor-bridge.test.ts`).

```typescript
import { Effect } from 'effect'
import { DbLayer } from '#/lib/db'
import { fetchThingById } from '#/services/things'

it('fetches a thing by id', async () => {
  const result = await Effect.runPromise(
    fetchThingById(1).pipe(Effect.provide(DbLayer)),
  )
  expect(result.id).toBe(1)
})
```

If the service returns `Effect.fail(...)`, use `Effect.either` and assert on the `Left` shape — don't `try/catch` around `runPromise`.

## Validating an existing test (review checklist)

Run through this list when reviewing a test PR or auditing the suite. Reject the test if any item fails.

- [ ] **Naming** — unit ends in `.test.ts`, integration in `.integration.test.ts`. Wrong suffix means the file runs on the wrong gate.
- [ ] **Location** — under `tests/` mirroring `src/`, not next to source.
- [ ] **No mocks for DB or external services in integration tests.** Use real Postgres / testcontainer. Mocks in unit tests are OK only for pure inputs (no DB, no FS).
- [ ] **Explicit timeout** on any `it` that loads a PDF or calls a KBBI/analyzer routine.
- [ ] **Positive control present** for every FP-suppression rule.
- [ ] **No `console.log` in unit tests.** In integration/diagnostic tests, allowed but must be marked `// biome-ignore lint/suspicious/noConsole: diagnostic output for iteration`.
- [ ] **Imports use `#/` alias**, not relative `../../`.
- [ ] **Fixtures live in `.claude/pdf_examples/`** for PDFs, or are inlined as strings. Never check in test PDFs to the repo.
- [ ] **No snapshot of mutable lists.** Assert structural invariants (`every f.offset is outside codeRanges`) or named items (`tokens contains "QNBP"`), not the whole array.
- [ ] **Assertion has a descriptive message** when looping over candidates.
- [ ] **One behaviour per `it`.** If the test body has three independent assertions, split them.

## Enhancing an existing test

Common upgrades, ordered by frequency of need:

1. **Adding a regression case.** A bug report says "TKJ is flagged on caption lines." Find the relevant FP-guard test, add a new `it` with the offending fixture inlined, leave the existing tests untouched. Don't refactor neighbouring tests in the same PR.
2. **Reducing flakiness.** If a test fails 1/10 runs with a timeout, raise the explicit timeout *and* add a `beforeAll` cache warm if missing. Don't `await new Promise(setTimeout)` — wait on the actual condition. Flakes in CI usually mean a shared cache wasn't warmed; check `refreshVocabularyCache` first.
3. **Promoting unit → integration.** When a unit test starts needing a real PDF or KBBI cache, rename the file to `*.integration.test.ts`, add `beforeAll` warm, and add an explicit timeout. The test:unit gate will stop running it; that is correct.
4. **Adding a positive control.** Any FP-guard test that doesn't already have one — add one paired `it` in the same `describe`.
5. **Adding descriptive messages.** Convert bare `expect(x).toBe(y)` inside loops to `expect(x, JSON.stringify(context)).toBe(y)`.

## Common mistakes

- **Using `__dirname` for fixture paths.** Vitest runs from project root; use `process.cwd()`.
- **Forgetting `refreshVocabularyCache()` in `beforeAll`.** Causes flaky KBBI tests that pass alone but fail in suite.
- **Putting integration tests under `tests/perf/`.** That directory is `PERF=1`-gated and excluded from CI by default — your integration test will not run.
- **Mocking `Db` with a fake `db.query.things.findFirst`.** Per project memory, integration tests must hit real Postgres; mocks have masked migration breakage before. Use testcontainers.
- **Asserting on a full findings list.** Findings ordering is not stable. Assert on the set, structural invariants, or named items only.
- **Re-using `await new Promise(r => setTimeout(r, N))`.** Forbidden — wait on the real condition.
- **Adding tests under `src/`.** All tests live under `tests/`. Vitest will run them either way but the convention is `tests/`.

## Three-mode quick reference

| Mode | Trigger | Action |
|------|---------|--------|
| **Validate** | "review this test", "is this test good?" | Run the validation checklist above. Reject on any miss. |
| **Enhance** | "this test is flaky", "add this case", "raise coverage" | Apply the enhancement list. One change per PR. |
| **Create — unit** | "test this pure function", "add EYD rule test" | Use unit shape. No PDF, no cache, no DB. Inline string fixtures. |
| **Create — integration** | "test the full pipeline", "test against real PDF", "test the DB-touching path" | Use integration shape. `*.integration.test.ts`. Explicit timeout. `beforeAll` for cache. |

## Checklist for a new test

1. Decide unit vs. integration using the criteria above. Rename if borderline.
2. Place under `tests/<area>/`. Use `#/` alias for imports.
3. For unit: inline fixtures, no async setup beyond `beforeAll` if at all.
4. For integration: `beforeAll(refreshVocabularyCache)` if KBBI; resolve PDFs from `process.cwd()`; explicit timeout.
5. Pair every FP guard with a positive control in the same `describe`.
6. Add descriptive `expect(value, msg)` for any assertion inside a loop.
7. Run `bun run test:unit` first to confirm the unit gate is fast; then `bun run test` to confirm integration passes.
8. Commit using Conventional Commits: `test(<area>): <what>`.
