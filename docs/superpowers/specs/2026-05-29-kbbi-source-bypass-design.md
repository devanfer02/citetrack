# Design — KBBI source bypasses + self-limit outcome tagging

**Date:** 2026-05-29
**Feature area:** Evaluation → KBBI lookup (`src/services/evaluation/kbbi/`)
**Source of truth:** `.claude/KNOWLEDGE_BASE.md §1` — read before implementing. Update §1.4 (scrape sources) and §1.3 (timeout config) in the same commit as the code.

## Problem

Three defects in the external KBBI scrape tier (tier 3 of the lookup strategy):

1. **kbbi.web.id returns a useless shell.** The current parser (`parsers/kbbiWebId.ts`) reads a `textarea#jsdata` element from the page HTML. The live site renders an empty loading shell server-side and fetches the actual entry over AJAX, so `#jsdata` is absent. The fetch logs `success` (HTTP 200) but the parser extracts nothing — a silent false negative. The real data lives at `https://kbbi.web.id/{word}/ajax_submitxvs7k` (JSON, same `{x,w,d}` entry shape), which requires a `PHPSESSID` cookie obtained from a preflight request.

2. **typoonline.com returns a useless shell, behind Cloudflare.** Same shape of problem: `https://typoonline.com/kbbi/{word}` is an empty shell; the data comes from a POST to `https://typoonline.com/api-kbbi/{word}` returning an HTML fragment. The host sits behind Cloudflare and intermittently 403s plain `fetch` (Node's TLS/JA3 fingerprint is distinctive and shared by all `fetch`/`undici` callers).

3. **Self-imposed lookup timeout is mislabeled `network_error`.** `lookup.ts` enforces a hardcoded 3 s per-word timeout via `controller.abort(new Error('external-lookup-timeout'))`. The abort reason is a plain `Error` (name `'Error'`), so `logged-fetch.ts` classifies it as `network_error` (its timeout branch only matches `AbortError`/`TimeoutError`). The admin api-logs view then shows a genuine-looking `NETWORK_ERROR` for what is actually our own limit kicking in, with no way to know the limit is adjustable.

## Decisions (locked with user)

| Decision | Choice |
| --- | --- |
| Notice surface for self-limit | **Admin api-logs tag only** — no end-user/report banner. The request-log table is the admin diagnostic surface. |
| 3 s timeout handling | **Make configurable + raise default to 7000 ms.** New config `kbbi.external_lookup_timeout_ms`. |
| kbbi.web.id session | **One PHPSESSID per job, reused.** Re-preflight only on expiry (empty/invalid AJAX response). |
| typoonline Cloudflare | **Add `impit` (Apify TLS-impersonation client).** Validate empirically; drop typoonline if unreliable. No headless browser. |

## Architecture

### Shared change — `fetchEntry` hook on `KbbiSource`

`src/services/evaluation/kbbi/sources.ts` currently types every source as
`{ buildUrl, parse, requestInit }`, and `cari.ts` runs one fixed flow:
`loggedFetch(url, requestInit)` → `res.text()` → `parse(html)`, with rate-limit
handling (429/503 pause, kemendikdasmen `BatasSehari`) inline.

Two of the three sources now need a *different* request flow (web.id: preflight +
AJAX returning JSON; typoonline: priming GET + POST via impit). Rather than
special-casing them inside `cari.ts`, add one optional hook to the source contract:

```ts
export type KbbiFetchOutcome = {
  // Raw payload to hand to parse(): JSON string (web.id) or HTML fragment (typoonline).
  raw: string | null
  // The source actually responded conclusively (so a null parse = real "not found").
  attempted: boolean
  // The source was rate-limited / unreachable (so a null parse is inconclusive).
  rateLimited: boolean
}

export type KbbiSource = {
  parse: KbbiParser
  // Default path (3 untouched sources):
  buildUrl?: (keyword: string) => string
  requestInit?: RequestInit
  // Custom path (web.id AJAX, typoonline impit). When present, cari.ts calls
  // this instead of the default loggedFetch flow.
  fetchEntry?: (keyword: string, signal?: AbortSignal) => Promise<KbbiFetchOutcome>
}
```

`cari.ts` change: for each source, if `handler.fetchEntry` exists, call it and use
its `raw`/`attempted`/`rateLimited`; otherwise run the existing default flow
(unchanged). Either way the result feeds the same downstream logic:
`parse(raw)` → first non-null `lema`/`arti` wins; `attempted`/`rateLimited` flow
back into `CariResult` exactly as today, so `lookup.ts`'s "conclusive negative"
decision (`result.attempted.length > 0 && !rateLimited`) is preserved.

Both custom `fetchEntry` implementations call `loggedFetch` internally (so api-logs
still records every request and host throttling/pausing still applies).

This keeps `cari.ts` small and leaves the 3 default sources
(`kbbi.kemendikdasmen.go.id`, `kbbi.co.id`, `kbbi.raf555.dev`) byte-for-byte on
their current path.

### Problem 1 — kbbi.web.id via AJAX

New module: `src/services/evaluation/kbbi/sources/kbbi-web-id-fetch.ts` (or colocated
helper). `fetchEntry(word, signal)`:

1. **Session:** module-level `let webIdSession: string | null`. Reset to `null` in
   `warmKbbiCaches()`. If null, preflight `GET https://kbbi.web.id/{word}` with the
   existing browser headers, read `PHPSESSID` from the `set-cookie` response header,
   store it. (Preflight goes through `loggedFetch` so it's logged + throttled.)
2. **AJAX:** `GET https://kbbi.web.id/{word}/ajax_submitxvs7k` with headers
   `Cookie: PHPSESSID=<session>`, `X-Requested-With: XMLHttpRequest`,
   `Referer: https://kbbi.web.id/{word}`, plus the browser UA.
3. Return `{ raw: <json text>, attempted: true, rateLimited: false }` on HTTP 200.
   On 429/503 → `{ raw: null, attempted: false, rateLimited: true }`. On an empty /
   invalid JSON body, invalidate `webIdSession` and retry the preflight + AJAX **once**;
   if still empty, return `{ raw: <body>, attempted: true, rateLimited: false }`
   (genuine "not found").

**Parser:** refactor `parseKbbiWebId` so the `{x,w,d}` handling (`filter(x===1)`,
`extractSupNumber` sort, `<br/>`/`&#183;` normalization) operates on a parsed JSON
array passed in, not on `textarea#jsdata`. Export the array-handling core; the
`fetchEntry` path `JSON.parse`s the AJAX body and calls it. (If we want to keep a
non-AJAX fallback, the old `#jsdata` extraction can stay as a secondary path, but the
primary is now AJAX. Decision: **drop the `#jsdata` path** — the shell never contains
it anymore, so it is dead code.)

### Problem 2 — typoonline.com via impit

Add dependency: `bun add impit`. New module
`src/services/evaluation/kbbi/sources/typoonline-fetch.ts`. A single shared `Impit`
instance (cookie jar reused across the job; reset in `warmKbbiCaches` if the jar
needs clearing). `fetchEntry(word, signal)`:

1. **Prime:** `impit.fetch(GET https://typoonline.com/kbbi/{word})` so Cloudflare sets
   `cf_clearance` / PHP session cookies into impit's jar. (Wrap through `loggedFetch`
   accounting if feasible; if impit can't reuse our `loggedFetch`, log the request
   manually via the same `writeLog` path so the admin view stays complete.)
2. **POST:** `impit.fetch(POST https://typoonline.com/api-kbbi/{word})` with
   `X-Requested-With: XMLHttpRequest`, `Referer: https://typoonline.com/kbbi/{word}`.
   impit supplies the browser-shaped UA + `Sec-CH-UA-*` and a Chrome TLS fingerprint.
3. On 200 → `{ raw: <fragment>, attempted: true, rateLimited: false }`. On 403/429/503
   → `{ raw: null, attempted: false, rateLimited: true }` (Cloudflare gate counts as
   rate-limited, not a conclusive answer).

**Parser:** `parseTypoOnline` already handles the fragment shape — reuse as-is. The
fragment from `api-kbbi` is the same `#textres` / "Kata X tidak ditemukan" content the
parser expects; verify against a captured fixture.

**Validation gate (in the plan, not committed as a test):** a `.claude/scripts/`
diagnostic that runs ~20 words through `typoonline-fetch` and reports the 200 rate.
If the rate is poor / Cloudflare escalates to a JS challenge, **disable typoonline**
(it is 1 of 5 redundant sources) instead of adding a headless browser.

**Logging note:** impit requests must still appear in api-logs. Preferred: route impit
calls through a thin wrapper that records via the same `writeLog` mechanism as
`loggedFetch`. If that proves awkward, accept that impit calls are logged via a
dedicated helper that mirrors `loggedFetch`'s row shape.

### Problem 3 — self-limit outcome tag

1. **New outcome value.** Add `'aborted'` to `ApiCallOutcome` in
   `src/services/logs/providers.ts`.
2. **Named abort error.** In `lookup.ts`, replace
   `controller.abort(new Error('external-lookup-timeout'))` with a named error class
   (e.g. `class LookupTimeoutError extends Error { name = 'LookupTimeoutError' }`).
3. **Recognize in logged-fetch.** In the `catch` of `loggedFetch`, before the
   generic timeout/network branch, detect the abort reason
   (`init?.signal?.reason instanceof LookupTimeoutError`, or match by
   `err.name === 'LookupTimeoutError'`) and set `outcome: 'aborted'` with an
   informative `errorMessage`, e.g.
   `"Lookup dihentikan oleh batas waktu KBBI (kbbi.external_lookup_timeout_ms). Naikkan di Pengaturan → KBBI."`.
   To avoid a cross-module import cycle (`logged-fetch` → `kbbi/lookup`), detect by
   error **name string** (`'LookupTimeoutError'`) rather than `instanceof`, or define
   the error class in a shared low-level module both can import.
4. **Configurable timeout.** Add config key `kbbi.external_lookup_timeout_ms`
   (default `7000`) in `src/lib/configurations.ts`. It needs an entry in **every**
   config metadata map there: `CONFIG_SCHEMAS` (validation), `CONFIG_LABELS`
   (Indonesian label, e.g. "Batas waktu lookup KBBI"), `CONFIG_DISPLAY` →
   **`'ms-as-seconds'`** (the project convention for ms timeouts — stored as ms,
   shown/edited as seconds; matches `autofetch.*_timeout_ms`), and
   `CONFIG_UNIT_LABEL` → `'seconds'`. The KBBI settings tab matches the `kbbi.`
   prefix, so the field auto-renders there — no `settings.tsx` change needed beyond
   confirming it appears. Read it in `warmKbbiCaches()` into a module-level
   `externalLookupTimeoutMs` (replacing the hardcoded `EXTERNAL_LOOKUP_TIMEOUT_MS = 3_000`).
   A value `<= 0` means "no timeout" (treated as a very large number), mirroring the
   budget's `0 = Infinity` convention.
5. **Render in admin view.** Add `'aborted'` to the outcome badge map and the outcome
   filter options in `src/routes/admin/api-logs.tsx`. Use a non-error pastel tone
   (warning/info, not the `network_error` red) per the color-system rules in CLAUDE.md.

**Scope note:** the 300-word budget cap (`externalLookupsRemaining <= 0`)
short-circuits *before* calling `cari()`, so it makes no HTTP request and produces no
log row. Only the per-word timeout produces an in-flight abort that logs. The budget
cap is therefore out of scope for the log-tag change (it has no log row to mistag).

## Components touched

| File | Change |
| --- | --- |
| `src/services/evaluation/kbbi/sources.ts` | Add `fetchEntry` hook to `KbbiSource`; wire web.id + typoonline to it |
| `src/services/evaluation/kbbi/sources/kbbi-web-id-fetch.ts` (new) | Preflight + AJAX flow, per-job PHPSESSID |
| `src/services/evaluation/kbbi/sources/typoonline-fetch.ts` (new) | impit prime + POST flow |
| `src/services/evaluation/kbbi/parsers/kbbiWebId.ts` | Parse from JSON array, drop `#jsdata` extraction |
| `src/services/evaluation/kbbi/parsers/typoOnline.ts` | Verify fragment parse against api-kbbi fixture (likely no change) |
| `src/services/evaluation/kbbi/cari.ts` | Branch to `fetchEntry` when present |
| `src/services/evaluation/kbbi/lookup.ts` | `LookupTimeoutError`; configurable timeout via `warmKbbiCaches` |
| `src/services/logs/providers.ts` | `'aborted'` outcome |
| `src/services/logs/logged-fetch.ts` | Detect `LookupTimeoutError` → `'aborted'` + message |
| `src/lib/configurations.ts` | `kbbi.external_lookup_timeout_ms` (default 7000) across `CONFIG_SCHEMAS` / `CONFIG_LABELS` / `CONFIG_DISPLAY` (`'ms-as-seconds'`) / `CONFIG_UNIT_LABEL` (`'seconds'`) |
| `src/routes/settings.tsx` | No code change — KBBI tab auto-renders the new `kbbi.` row; just confirm it appears as a "seconds" field |
| `src/routes/admin/api-logs.tsx` | Render + filter `'aborted'` |
| `deploy/seed/*.sql` | Seed the new config key (idempotent) if config keys are seeded |
| `.claude/KNOWLEDGE_BASE.md` | Update §1.3 (timeout config) + §1.4 (web.id AJAX, typoonline impit) |
| `package.json` | `impit` dependency |
| `.claude/scripts/` (new diagnostic) | typoonline 200-rate validation |

## Error handling

- web.id preflight failure / no `PHPSESSID` → return `{ raw: null, attempted: false, rateLimited: true }` so `cari` falls through to the next source.
- web.id AJAX empty body once → re-preflight once → if still empty, treat as conclusive "not found".
- typoonline 403 (Cloudflare) → `rateLimited: true`, fall through. Never blocks the chain.
- impit import/runtime failure on the deployed Bun version → typoonline `fetchEntry` catches and returns `rateLimited: true`; the other 4 sources carry the feature. (Validate impit on the target Bun version in CI / Docker before relying on it.)
- All custom-fetch errors are swallowed into the `KbbiFetchOutcome` contract — `cari` never throws for a single source (matches current behavior).

## Testing

- **Unit:** refactored web.id JSON-array parser against a captured `ajax_submitxvs7k` fixture (found + not-found cases). typoonline parser against a captured `api-kbbi` fragment fixture.
- **Unit:** `logged-fetch` test asserting a fetch aborted with `LookupTimeoutError` produces `outcome: 'aborted'` (and that a real `AbortError`/network failure still maps to `timeout`/`network_error`).
- **Unit:** `warmKbbiCaches` reads `kbbi.external_lookup_timeout_ms` and applies it (with the `<=0 → no timeout` convention).
- **Diagnostic (not committed as a test):** `.claude/scripts/` script measuring typoonline 200-rate via impit across ~20 words — the go/no-go signal for keeping typoonline.

## Out of scope

- Any end-user/report-facing message about the cap or timeout (admin log only, per decision).
- Surfacing the budget cap (`externalLookupsRemaining`) in the log (no HTTP request, no row).
- Headless browser / Chromium for typoonline (explicitly rejected).
- Refactoring the other 3 sources off the default path.
