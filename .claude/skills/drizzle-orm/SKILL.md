---
name: drizzle-orm
description: Drizzle ORM patterns as used in CiteTrack — PostgreSQL schema in `src/db/schema.ts`, `pg` pool client in `src/db/index.ts`, plain async query calls (no Effect wrapping), and the upsert-heavy idioms used across `src/services/`. Use when adding tables, columns, indexes, or any service code that talks to the database.
user-invocable: false
---

# Drizzle ORM — CiteTrack Reference

Versions in use: `drizzle-orm` ^0.45.1, `drizzle-kit` ^0.31.9, dialect `postgresql` via `drizzle-orm/node-postgres` and the `pg` driver. The patterns below reflect what's actually in `src/db/schema.ts` and `src/services/` — not generic Drizzle examples.

## Where Drizzle lives

| File | Purpose |
|------|---------|
| `src/db/index.ts` | Exports `db` (the Drizzle client wrapping a `pg.Pool`) and `pool`. Everyone imports `db` from here. |
| `src/db/schema.ts` | All tables, enums, indexes. The whole `* as schema` is passed to `drizzle()` so `db.query.<table>` works. |
| `drizzle.config.ts` | Drizzle-Kit config. `schema: './src/db/schema.ts'`, `out: './drizzle'`, dialect `postgresql`. |
| `drizzle/` | Generated migration SQL files. Committed. |
| `deploy/seed/` | Idempotent SQL run by `docker-entrypoint.sh` on first boot. NOT migrations — see `CLAUDE.md`. |

The pool config (`max: 10`, 30s idle, 5s connect) is tuned for the single-container CiteTrack deploy. Don't bump `max` without a reason.

## What CiteTrack does NOT do

- **No Effect wrapping at the call site.** Services call `db` directly: `const rows = await db.select().from(...)`. Effect-TS is used inside specific pure pipelines (KBBI lookup, EYD analysis), not as a generic DB layer. Old skill versions showed `dbTryPromise`/`Db` service — that's another project, not this one.
- **No `db.query.<table>` for new code.** The relational query API works (the schema is passed into `drizzle()`), but every service today uses the SQL-like `db.select().from()...` style with explicit joins. Keep new code consistent with that. Only reach for `db.query.x.findFirst({ with })` if you genuinely want nested eager-loaded relations.
- **No drizzle `relations()` helpers.** None are defined. Foreign keys live in the column via `.references()`. If you need to add `relations()` for a new feature that wants `db.query.x.findMany({ with })`, add them at the bottom of `schema.ts` — they don't change the generated SQL.

## Schema patterns CiteTrack uses

### `pgTable` shape

Two PK conventions, applied consistently:

- **`uuid().defaultRandom().primaryKey()`** for job-like entities (`jobs`, `evaluationJobs`, `pages`, `evaluationPages`). UUIDs are surfaced to users via URLs (`/track?jobId=...`, `/evaluation/:evalId`) so they need to be unguessable.
- **`serial().primaryKey()`** for internal child rows that never appear in URLs (`citations`, `references`, `citationMatches`, `evaluationFindings`, `apiCallLogs`, …). Auto-increment, cheap, indexable.

```typescript
import {
  boolean, customType, index, integer, jsonb, pgEnum, pgTable,
  real, serial, text, timestamp, uniqueIndex, uuid,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

export const jobs = pgTable('jobs', {
  id: uuid().defaultRandom().primaryKey(),
  status: jobStatusEnum().default('pending').notNull(),
  filename: text().notNull(),
  fileSize: integer('file_size').notNull(),         // snake_case column, camelCase property
  totalPages: integer('total_pages'),                // nullable until extraction completes
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at')
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
})
```

**Column-name convention**: every snake_case DB column has its name passed as the first argument (`integer('file_size')`). When a property name matches the DB name (single word: `filename`, `status`, `error`), the explicit name argument is omitted. Match this style in new tables — `bun run db:generate` will accept either, but the diff stays clean.

### Enums via `pgEnum`

CiteTrack uses Postgres native enums everywhere a column is a small fixed set of strings:

```typescript
export const jobStatusEnum = pgEnum('job_status', [
  'pending', 'extracting', 'done', 'failed',
])

export const fetchSourceEnum = pgEnum('fetch_source', [
  'doi', 'unpaywall', 'semantic-scholar', 'crossref', 'openalex',
  'core', 'manual', 'europepmc', 'pubmed', 'arxiv',
])

// Used as a column factory:
status: jobStatusEnum().default('pending').notNull(),
```

Inferring the type later: `type JobStatus = (typeof jobStatusEnum.enumValues)[number]`.

Adding a value to an enum requires a migration with `ALTER TYPE ... ADD VALUE` — drizzle-kit will generate this for you, but be aware that the new value isn't transactional in old Postgres versions; it can't be rolled back in the same migration.

### Column types in use

| Type | Where in CiteTrack |
|------|---------------------|
| `uuid().defaultRandom()` | Job-like PKs and FKs (`jobs.id`, `evaluationJobs.id`, `pages.jobId`) |
| `serial()` | Internal child-row PKs (`citations.id`, `references.id`, `apiCallLogs.id`) |
| `integer('snake_name')` | Counts, page numbers, durations (ms), foreign keys to serial PKs |
| `real()` | Confidence scores 0..1 (`citationMatches.confidence`, `passageMatches.confidence`) |
| `text()` | All string columns. CiteTrack never uses `varchar(n)` — content is unbounded (PDF pages, error messages) and there's no validation gain from a length cap |
| `boolean()` | Flags (`apiCallLogs.cacheHit`, `dictionaryCache.found`) |
| `timestamp('created_at')` | Always store ts as `timestamp` (no timezone). `defaultNow()` for creation, `$onUpdate(() => new Date())` for `updated_at` |
| `jsonb('col').$type<Shape>()` | Typed JSON (`evaluation_pages.code_ranges: Array<[number, number]>`, `api_call_logs.response_headers: Record<string,string>`, `configurations.value`) |
| `customType<{ data: Buffer }>` for `bytea` | Binary blobs (`source_window_embeddings.embedding`) — see _Custom types_ below |

### Modifiers, in the order CiteTrack writes them

```typescript
referenceId: integer('reference_id')
  .references(() => references.id, { onDelete: 'set null' })   // FK first
  .notNull(),                                                   // nullability after

createdAt: timestamp('created_at')
  .defaultNow()                                                 // default first
  .notNull(),                                                   // then nullability

updatedAt: timestamp('updated_at')
  .defaultNow()
  .$onUpdate(() => new Date())                                  // runtime hook in middle
  .notNull(),
```

`onDelete` choices in this codebase:
- `'cascade'` — child rows that have no meaning without the parent (every `*.jobId → jobs.id`, every `evaluation_*.evalJobId → evaluationJobs.id`).
- `'set null'` — soft references where the row can survive the parent disappearing (`citationMatches.referenceId → references.id` — a match record stays around as "unmatched" if the reference gets repaired).

### Indexes (the 3rd argument)

Every CiteTrack table that gets queried by FK has an explicit index. Don't rely on Postgres to add one for you — Drizzle won't generate it from `.references()` alone.

```typescript
export const citations = pgTable(
  'citations',
  {
    id: serial().primaryKey(),
    jobId: uuid('job_id').references(() => jobs.id, { onDelete: 'cascade' }).notNull(),
    // ...
  },
  (t) => [index('citations_job_idx').on(t.jobId)],
)
```

Patterns used:
- `index('name').on(t.col)` — single column.
- `index('name').on(t.col1, t.col2)` — composite, for `WHERE col1 = ? AND col2 = ?` lookups (`api_call_logs_provider_created_idx`).
- `uniqueIndex('name').on(...)` — uniqueness constraint expressed as a unique index (`passage_match_batches_job_batch_idx`, `source_window_embed_unique_idx`).
- Functional / expression index — wrap the expression in `sql`:
  ```typescript
  (t) => [index('dictionary_word_lookup_idx').on(sql`lower(trim(${t.word}))`)]
  ```
  This is how the KBBI lookup hits its index for case-insensitive matches.

Index naming convention: `<table>_<column-summary>_idx`. Keep it under 63 chars (PG identifier limit).

### Custom types (`bytea` for embeddings)

PG `bytea` isn't a built-in Drizzle type; CiteTrack defines it once at the top of `schema.ts`:

```typescript
const bytea = customType<{ data: Buffer; notNull: false; default: false }>({
  dataType() { return 'bytea' },
})

embedding: bytea('embedding').notNull(),
```

The `customType` generic types the JS value (`Buffer`) and whether the column has a NOT NULL / default at the schema-helper level (both `false` here — applied via `.notNull()` instead). For other custom types you can also pass `toDriver` / `fromDriver` for value-level transforms (e.g. a `tsvector` that takes a string but returns parsed tokens) — see the Drizzle docs.

### Typed JSON

When a column is `jsonb`, type its payload with `.$type<>()` so reads return the right shape without manual casts:

```typescript
codeRanges: jsonb('code_ranges').$type<Array<[number, number]>>().default([]).notNull(),
responseHeaders: jsonb('response_headers').$type<Record<string, string>>(),
value: jsonb().notNull(),   // configurations.value — payload shape is per-config-key, validated at the service layer with Zod
```

`.$type<>()` is **compile-time only** — Drizzle does not validate the JSON at runtime. If the column receives external input, validate the parsed value with Zod in the service handler before relying on the type.

## Calling style — plain async, plain `db`

CiteTrack services import `db` and call it directly. No service-locator pattern, no Effect for HTTP-facing code.

```typescript
// src/services/parser/citations.ts
import { db } from '#/db'
import { citations, pages } from '#/db/schema'
import { eq, asc } from 'drizzle-orm'

export const parseCitationsForJob = createServerFn({ method: 'POST' })
  .inputValidator(jobIdSchema)
  .handler(async ({ data: { jobId } }) => {
    const jobPages = await db
      .select({ pageNumber: pages.pageNumber, content: pages.content })
      .from(pages)
      .where(eq(pages.jobId, jobId))
      .orderBy(asc(pages.pageNumber))

    if (jobPages.length === 0) {
      throw new Error('No pages found for this job. Run text extraction first.')
    }

    // ...
  })
```

Error handling is "throw on unexpected, return on expected". Notify clients via TanStack Query's rejected promise; don't try/catch in handlers unless you need to write a partial-failure status back to the DB (see `processUpload` in `src/services/pdf/upload.ts` for the one place that does).

## Query idioms in use

### Select with explicit joins

The default pattern. Choose `innerJoin` when both sides must exist (the result is empty if either side is missing) and `leftJoin` when the right side is optional:

```typescript
import { eq, and, desc } from 'drizzle-orm'

const rows = await db
  .select({
    match: passageMatchBatches,
    pdf: sourcePdfs,
    ref: references,
  })
  .from(passageMatchBatches)
  .innerJoin(sourcePdfs, eq(passageMatchBatches.sourcePdfId, sourcePdfs.id))
  .leftJoin(references,  eq(sourcePdfs.referenceId, references.id))
  .where(and(eq(passageMatchBatches.jobId, jobId), eq(passageMatchBatches.status, 'done')))
  .orderBy(desc(passageMatchBatches.batchIndex))
```

The select object names the joined groups, so reads are `row.match.batchIndex`, `row.pdf.filename`, `row.ref?.title`. Pick a tight column list for `select({ ... })` when the table is wide (a page's full `content` is 50–200KB; don't pull it back when you only need page numbers).

### Insert + `returning()`

Always destructure when you only need the one row back:

```typescript
const [job] = await db
  .insert(jobs)
  .values({ filename: file.name, fileSize: file.size, status: 'pending' })
  .returning()
```

Bulk insert with an array — same shape, just pass `values([...rows])`. If `rows.length === 0`, **skip the insert call entirely** — Drizzle's executor doesn't no-op an empty array, you'll get a SQL error:

```typescript
if (result.pages.length > 0) {
  await db.insert(pages).values(result.pages.map(...))
}
```

### Update

Always scope with `.where(...)` — there's no built-in guard against a `.set(...)` without one. Use `.returning()` if you need the new state:

```typescript
const [updated] = await db
  .update(evaluationJobs)
  .set({ status: 'analyzing', currentStep: 'eyd' })
  .where(eq(evaluationJobs.id, evalJobId))
  .returning()
```

Empty `.returning()` array = the WHERE clause matched no rows. Treat that as "not found".

### Delete

Same shape. CiteTrack uses delete a lot for "re-derive from scratch" pipeline steps:

```typescript
await db.delete(citations).where(eq(citations.jobId, jobId))   // wipe before re-parsing
await db.insert(citations).values(matches.map(...))
```

The whole sequence runs inside a single request, so a transaction is *not* strictly required — but if you reach for a `db.transaction(...)` block, that's where it belongs:

```typescript
await db.transaction(async (tx) => {
  await tx.delete(citations).where(eq(citations.jobId, jobId))
  if (matches.length > 0) {
    await tx.insert(citations).values(matches)
  }
})
```

The `tx` parameter has the same API as `db` — use it for every call inside the block. Throwing from the callback rolls back. There are no `db.transaction` calls in CiteTrack today; introduce them when a step writes to two tables and must be atomic.

### Upserts — `onConflictDoUpdate` + `excluded`

This is the dominant write idiom in CiteTrack — `dictionaryCache`, `evaluationVocabulary`, `configurations`, and the embedding cache all use it. The `excluded` keyword refers to the row that would have been inserted:

```typescript
await db
  .insert(dictionaryCache)
  .values({ word, found: true, source: 'kbbi', arti })
  .onConflictDoUpdate({
    target: dictionaryCache.word,          // PK or unique index column(s)
    set: {
      found:  sql`excluded.found`,
      source: sql`excluded.source`,
      arti:   sql`excluded.arti`,
      fetchedAt: sql`now()`,
    },
  })
```

Variants in use:
- Composite target: `target: [t.col1, t.col2]` — must match a unique constraint or index.
- `onConflictDoNothing({ target })` when you want to silently skip duplicates (used in the embedding cache where the unique index already guarantees identity).
- Conditional update: pass `setWhere` to skip the `UPDATE` part when nothing changed (e.g. only update if `excluded.value != stored.value`).

`sql\`excluded.col\`` references the proposed insert. `sql\`now()\`` is a plain SQL expression. If you want the old value preserved on conflict, write `sql\`${table.col}\`` (the existing column) on the right-hand side.

### `sql` template tag

Three places it shows up in CiteTrack:

1. **`excluded` references in upserts** (above).
2. **Functional index expressions** in schema (`sql\`lower(trim(${t.word}))\``).
3. **`where: sql\`...\``** for predicates Drizzle's operator set can't express cleanly:
   ```typescript
   .where(sql`${pages.lowTextDensity} = 0 AND char_length(${pages.content}) > 200`)
   ```

Interpolate column references with `${table.col}` — Drizzle emits the correctly-quoted identifier. Interpolate raw runtime strings only via `sql.raw(...)` and only when you've already validated the input (e.g. a column name from a typed enum), since `sql.raw` skips parameter binding and bypasses SQL-injection protection.

### Operators reference

```typescript
import {
  eq, ne, gt, gte, lt, lte,
  and, or, not,
  isNull, isNotNull,
  inArray, notInArray,
  like, ilike, between,
  asc, desc,
  sql, count, sum, avg, min, max,
} from 'drizzle-orm'
```

CiteTrack uses `ilike` (case-insensitive `LIKE`) for filename searches and `ne` for "exclude this status" listings; the others speak for themselves. `count()` / `sum()` etc. are typed aggregate helpers — prefer them over hand-written `sql\`count(*)\`` when grouping by a column.

## Migrations

Workflow:

```bash
bun run db:generate    # diff schema.ts against the last migration, write drizzle/<ts>_<name>.sql
bun run db:migrate     # apply the generated SQL to DATABASE_URL
bun run db:push        # skip the migration file — apply schema changes directly (only for local prototyping)
bun run db:studio      # open the Drizzle Studio GUI
```

Rules in this repo:
- **Always `db:generate`, never `db:push`, for changes that will land on `master`.** `db:push` doesn't create a migration file; deploys won't pick up the change.
- Migration SQL under `drizzle/` is **committed**. Don't edit the generated file unless you really need to (e.g. adding a `BEGIN; COMMIT;` around an enum-value addition).
- Seed data lives in `deploy/seed/`, not in migrations — `docker-entrypoint.sh` runs seeds idempotently after migrations.

## Quick reference — CiteTrack tables

| Table | Purpose |
|-------|---------|
| `jobs` | One row per uploaded thesis on the **Track** flow. UUID PK. |
| `pages` | Extracted text per thesis page. FK → `jobs`, cascade. |
| `citations` | In-text citation occurrences parsed from `pages.content`. |
| `references` | Bibliography entries parsed from the thesis. |
| `citationMatches` | Citation ↔ reference matches (exact / fuzzy / unmatched). |
| `sourcePdfs` | Source PDFs fetched or uploaded for each reference. |
| `sourcePages` | Extracted text from source PDFs. |
| `sourceWindowEmbeddings` | Embeddings over sliding windows of source pages (bytea). |
| `passageMatches` | Citation → passage in source PDF. |
| `passageMatchBatches` | Batch scheduling for the passage-matching pipeline. |
| `evaluationJobs` | One row per uploaded thesis on the **Evaluation** flow. |
| `evaluationPages` | Extracted text + code/italic ranges (jsonb) per eval page. |
| `evaluationFindings` | KBBI/EYD findings: category × severity × page × rule. |
| `evaluationSummary` | Per-job rolled-up scores. PK = `evalJobId`. |
| `evaluationVocabulary` | User-curated word classifications (word PK). |
| `dictionary` | KBBI dictionary dump. Functional index on `lower(trim(word))`. |
| `dictionaryCache` | Scrape results for words missing from the dump. |
| `configurations` | App configuration k/v store, `value` is `jsonb`. PK = `code`. |
| `apiCallLogs` | Diagnostic log of every outbound third-party API call. |

If a schema change crosses these tables, run the affected pipeline scripts under `.claude/scripts/` afterwards to catch regressions before pushing.

## Latest-Drizzle features worth knowing (Drizzle 0.45 / Drizzle-Kit 0.31)

CiteTrack doesn't use these yet, but they're current-generation Drizzle and may fit a future change:

- **`generatedAlwaysAsIdentity({ startWith: 1000 })`** — PG identity columns. Modern alternative to `serial()`; supported since `drizzle-orm@0.32`. Use this if you need fine control over the sequence (start value, cache, min/max) or want to avoid the legacy `SERIAL` behaviour.
- **`generatedAlwaysAs(() => sql\`...\`)`** — stored generated columns. Pairs nicely with `customType<{ data: string }>` returning `'tsvector'` for full-text search; index with `.using('gin', t.col)`.
- **`$defaultFn(() => createId())`** — runtime default for inserts (e.g. CUID2 IDs). Different from `defaultRandom()` which is a Postgres-side default.
- **`getColumns(table)` + `sql.raw('excluded.' + col.name)`** — builds a generic `set` object for multi-row upserts when you don't want to enumerate columns by hand.

Anything else not listed here, check `/drizzle-team/drizzle-orm-docs` via context7 before improvising — Drizzle ships frequently and the `0.4x` line has churned on PG-specific APIs.
