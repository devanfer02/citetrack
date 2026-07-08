# Third-party API logs — design

**Status:** approved
**Date:** 2026-05-24
**Author:** brainstorm session with the user

## Why

Currently, when a 3rd-party provider call fails during Track auto-fetch or
KBBI evaluation, the user sees a short error string like
`openalex: not a PDF (content-type: text/html;charset=UTF-8)` and has no
way to inspect what the upstream actually returned. The Sources panel
(see screenshot in PR scope) is the most visible failure surface but the
root-cause data — the response body — is gone by the time anyone looks.

This spec adds a structured log of every 3rd-party call we make, plus an
admin page to browse those logs.

## Scope

In scope:

- All outbound HTTP from `src/services/pdf/finder.ts` (provider metadata
  lookups: OpenAlex, Crossref, Unpaywall, Semantic Scholar, Europe PMC,
  PubMed, arXiv, Core, DOI resolver) — 11 fetches.
- Outbound HTTP from `src/services/pdf/auto-fetch.ts` (the PDF download
  itself, metadata-only — no body capture for binary blobs) — 1 fetch.
- Outbound HTTP from `src/services/evaluation/kbbi/cari.ts` (KBBI scrape,
  Tor or direct) — 1 fetch.

Out of scope:

- Internal TanStack Start server-function calls (those aren't 3rd-party).
- ONNX model downloads via @huggingface/transformers (one-time bootstrap,
  not an "event" worth logging).
- The Hugging Face model file fetches — same reasoning.

## Decisions

| Question | Decision |
|---|---|
| Scope | Track auto-fetch + Evaluation KBBI |
| Body capture | Errors → full body (up to 1MB cap). Successes → truncated 2KB preview. Binary PDF download → metadata only, no body. |
| UI placement | Standalone admin route `/admin/api-logs` |
| Access | **Globally accessible** (no `isLocalEnv` gate) — local-first self-hosted, bodies are public-API responses |
| Retention | Piggyback on existing purge flow via FK cascade |

## Architecture

### Data model

One new table:

```sql
api_call_logs (
  id              bigserial PK,
  track_job_id    uuid NULL REFERENCES jobs(id) ON DELETE CASCADE,
  eval_job_id     uuid NULL REFERENCES evaluation_jobs(id) ON DELETE CASCADE,
  provider        text NOT NULL,    -- 'openalex' | 'kbbi' | ...
  method          text NOT NULL,
  url             text NOT NULL,
  status          int NULL,         -- null = request never returned
  response_headers jsonb NULL,      -- subset only
  body_preview    text NULL,        -- 2KB preview or full body (errors)
  body_truncated  bool DEFAULT false,
  body_size_bytes int NULL,
  outcome         text NOT NULL,    -- 'success' | 'http_error' | 'network_error' | 'timeout'
  error_message   text NULL,
  duration_ms     int NOT NULL,
  created_at      timestamp DEFAULT now() NOT NULL
)
```

Indexes:

- `(created_at DESC)` for the default list view
- `(provider, created_at DESC)` for the provider filter
- `(track_job_id)` and `(eval_job_id)` for job-scoped lookups

Two nullable FK columns rather than one polymorphic `(job_kind, job_id)`
tuple because Postgres can cascade-delete via real FK; a polymorphic
pair would force manual cleanup queries during purge.

### Wrapper API

`src/services/logs/logged-fetch.ts`:

```ts
type Provider =
  | 'openalex' | 'crossref' | 'unpaywall' | 'semantic-scholar'
  | 'europepmc' | 'pubmed' | 'arxiv' | 'core' | 'doi'
  | 'kbbi' | 'pdf-download'

interface LogContext {
  provider: Provider
  trackJobId?: string
  evalJobId?: string
  metadataOnly?: boolean  // skip body capture (binary downloads)
}

export async function loggedFetch(
  ctx: LogContext,
  url: string,
  init?: RequestInit,
): Promise<Response>
```

Behavior:

1. Record start time.
2. Run `fetch(url, init)`; catch network errors and timeouts separately.
3. Clone the response so the caller still gets the original.
4. Read the clone's body up to:
   - Full (1MB cap) on `!res.ok`
   - 2KB on `res.ok` and `!metadataOnly`
   - Skip on `metadataOnly`
5. Capture a fixed header subset: `content-type`, `content-length`,
   `retry-after`, all `x-ratelimit-*`.
6. Write the log row fire-and-forget — the response path doesn't await
   the DB insert. Swallow logging errors so the caller never fails
   because of logging.
7. Return the original response.

Call-site changes: 13 fetches across 3 files (`finder.ts`,
`auto-fetch.ts`, `kbbi/cari.ts`). Each `await fetch(url, init)` becomes
`await loggedFetch({ provider: '...', trackJobId, evalJobId }, url, init)`.

### Job-id propagation

- `auto-fetch.ts` already accepts a `jobId` parameter. Thread it through
  to provider attempts via the existing function signatures.
- KBBI lookups inside an evaluation job: thread `evalJobId` from the
  orchestrator down to `cari.ts`.
- Calls fired outside any job (manual diagnostics, cache warm-ups) get
  `null` job IDs — they'll show up on the admin page but won't
  cascade-delete with any specific job.

### Server functions

`src/services/logs/api-logs.ts`:

```ts
listApiCallLogs({
  provider?: Provider[],
  outcome?: 'success' | 'error',    // 'error' = any non-success outcome
  trackJobId?: string,
  evalJobId?: string,
  limit?: number,                    // default 50, max 200
  before?: string,                   // ISO timestamp cursor
}) → { rows, nextCursor }

getApiCallLog(id: number) → full row including untruncated body
                            (if it was stored as preview, returns the preview)
```

No `assertLocalOnly` guard — same access model as the rest of the local-
first self-hosted app.

### UI

Route: `src/routes/admin/api-logs.tsx`

Layout:

```
<Section tone="cream">
  filter bar (provider chips · outcome toggle · job-id input · clear)
  ──────────────────────────────────────────
  list:
    [time] [provider chip] [status] [duration] [url truncated] [outcome dot]
    [time] [provider chip] [status] [duration] [url truncated] [outcome dot]
    ...
  ──────────────────────────────────────────
  pagination (load more)
</Section>
```

Row click expands inline:

```
  ▼ [time] [provider chip] [status] [duration] [url]
    │
    │ Headers:
    │   content-type: application/json
    │   x-ratelimit-remaining: 9
    │
    │ Body (preview, 2048 bytes):
    │   {"meta":{...},"results":[...]}
    │   [view full body]   ← only when body_truncated = true
    │
    │ Error: <error_message if any>
```

Body rendering: pretty-print JSON if `content-type` starts with
`application/json`; otherwise render as monospace text. No syntax
highlighting — keep it simple.

Density: this is a diagnostic surface, not narrative content. Table
rows are compact (1 line per row collapsed), in contrast to the
narrative `<Section>` style elsewhere.

### Retention

When a Track or Evaluation job is deleted by the existing `purge` flow,
its `api_call_logs` rows cascade-delete via the FKs. No extra code
needed for the common case.

For unattached logs (both job FKs null), add one query to the existing
purge handler:

```sql
DELETE FROM api_call_logs
WHERE track_job_id IS NULL
  AND eval_job_id IS NULL
  AND created_at < now() - interval '<retention_days> days'
```

### Testing

- Unit (Vitest): `loggedFetch` against a fake `Response` constructor.
  Cases: success with body truncation, error with full body, binary
  metadata-only, header subset filtering, fire-and-forget continues
  when DB insert throws.
- Integration: `.claude/scripts/test-api-logs.ts` runs one OpenAlex
  call against a real reference and asserts a row landed with the
  expected provider/outcome/status.
- Schema test: deleting a `jobs` row deletes attached `api_call_logs`.

## Out of scope (follow-ups)

- Real-time tail / SSE stream of new log rows.
- Diff view between two calls to the same URL.
- Export to CSV / JSON.
- Re-run a logged call from the UI ("redo this fetch") — interesting
  for debugging but adds complexity and isn't required for the
  monitoring use case.

## Implementation order

1. Schema migration + Drizzle types.
2. `loggedFetch` wrapper + unit tests.
3. Wire `finder.ts` + `auto-fetch.ts` (Track).
4. Wire `kbbi/cari.ts` (Evaluation).
5. Server functions.
6. Admin route UI.
7. Purge integration for unattached logs.
8. Integration test script.
