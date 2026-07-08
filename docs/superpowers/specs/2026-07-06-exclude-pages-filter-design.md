# Exclude Pages Filter ("Kecualikan halaman")

**Date:** 2026-07-06
**Feature area:** Evaluation report (KBBI + EYD findings list)
**Status:** Design — awaiting review

## Problem

On the Evaluation report (`/evaluation/$evalId`), some pages of a thesis are
predictably noisy — appendices, use-case tables, code listings, reference
lists — where EYD/KBBI findings (e.g. dozens of `eyd.foreign-not-italic` hits
on a page full of English UI terms) are not worth acting on. The student wants
to say "ignore pages 7 and 10–12" and have those findings disappear from the
results so the list shows only what's worth fixing.

## Scope

**View-only, session state.** The exclusion behaves exactly like the existing
tag / level / search filters:

- Excludes matching findings from the on-screen KBBI and EYD lists and their
  visible counts.
- Session-only — resets on reload. Not persisted to the DB.
- **Out of scope:** the "Unduh" annotated PDF and "Terapkan perbaikan" docx
  still contain every finding. No server-side or schema changes.

## Data flow (current, unchanged)

`useEvaluationFilters()` → `ParsedFilter` → `filterFindings()` inside each
`CategorySection`. Every finding already carries a non-null `pageNumber`
(schema column `page_number`). We extend this existing client-side pipeline.

## Design

### 1. Parse helper — `src/lib/evaluation/filter.ts`

A pure function, kept separate so it is unit-testable:

```ts
export function parseExcludedPages(input: string): Set<number>
```

- Splits the raw input on commas.
- Each token is trimmed and matched as either a single page `N` or a range
  `A-B`.
- Ranges are order-tolerant: `12-10` yields `10, 11, 12`.
- Only positive integers are accepted; non-numeric, empty, or malformed tokens
  are ignored silently (no error UI — invalid input just contributes nothing).
- Returns a `Set<number>` of page numbers. Empty input → empty set.
- No clamping to `totalPages` — a page number past the end simply matches no
  finding, so clamping would be cosmetic only.

### 2. Filter — `ParsedFilter` + `filterFindings`

Add to `ParsedFilter`:

```ts
excludedPages: Set<number>
```

In `filterFindings`, after the existing checks:

```ts
if (filter.excludedPages.size > 0 && filter.excludedPages.has(f.pageNumber)) {
  return false
}
```

Empty set is a no-op, so existing callers (e.g. comparison view, if any) stay
backward-compatible. Every construction site of `ParsedFilter` must include the
new field.

### 3. Hook — `useEvaluationFilters`

- Add `excludedPagesInput: string` state (raw text the user typed) and its
  setter.
- Debounce it 200ms via `useDebouncedValue`, matching `query`.
- Fold `parseExcludedPages(debouncedExcludedPages)` into the `parsedFilter`
  memo as `excludedPages`.
- Expose `excludedPagesInput` and `setExcludedPagesInput` from the hook result.

### 4. UI — `evaluation-filters.tsx`

- Add an `Input` labelled "Kecualikan halaman" with placeholder
  `mis. 7, 10-12`, styled like the existing search `Input` (bottom-border,
  transparent, `h-8`). Add `aria-label="Kecualikan halaman dari hasil"`.
- When the exclusion is active (non-empty parsed set), render a small helper
  line: `menyembunyikan N temuan` where `N` is the count of findings that
  would otherwise be visible but are hidden solely by the page exclusion, plus
  a `✕` "Hapus" button that clears the input.
- The hidden count `N` is computed in `index.tsx` by running `filterFindings`
  twice — once with the full filter, once with `excludedPages` emptied — and
  diffing the lengths. Cheap (findings are already in memory).
- New props on `EvaluationFiltersProps`: `excludedPagesInput`,
  `onExcludedPagesChange`, `hiddenByPageCount`.

Because the exclusion feeds `parsedFilter`, both `CategorySection` lists, their
live counts, and the "Tandai selesai semua yang difilter" bulk action all
respect it automatically — no extra wiring.

### 5. Wiring — `index.tsx`

- Pass the new hook fields and computed `hiddenByPageCount` into
  `EvaluationFilters`.
- No other changes; `parsedFilter` already flows to both `CategorySection`s.

## Testing

Unit tests (Vitest), no fixtures needed:

- `parseExcludedPages`:
  - `"7, 10-12, 45"` → `{7,10,11,12,45}`
  - whitespace tolerance: `" 7 ,10 - 12 "` → `{7,10,11,12}`
  - reversed range `"12-10"` → `{10,11,12}`
  - junk tokens `"7, abc, -, 3-"` → `{7}` (and `3` from `3-`? no — malformed,
    ignored) → `{7}`
  - empty `""` and `"  "` → empty set
  - single page `"5"` → `{5}`
- `filterFindings` with `excludedPages`:
  - findings on excluded pages are dropped; others kept
  - empty `excludedPages` is a no-op

## Files touched

- `src/lib/evaluation/filter.ts` — `parseExcludedPages`, `ParsedFilter`,
  `filterFindings`
- `src/routes/evaluation/$evalId/-hooks/use-evaluation-filters.ts`
- `src/routes/evaluation/$evalId/-sections/evaluation-filters.tsx`
- `src/routes/evaluation/$evalId/index.tsx`
- test file(s) under the project's test location for `filter.ts`

## Non-goals

- Persisting excluded pages across reloads or into downloads.
- Excluding by anything other than page number (section, rule, region).
- Server-side changes of any kind.
