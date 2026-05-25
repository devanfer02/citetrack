---
name: tanstack-start
description: TanStack Start (React metaframework) patterns as used in CiteTrack — file-based routing, server functions, loaders, search params, and API routes. Use when writing or modifying anything under `src/routes/` or any `createServerFn` in `src/services/`.
user-invocable: false
---

# TanStack Start — CiteTrack Reference

TanStack Start = TanStack Router + Nitro + Vite, with file-based routes, server functions (RPC), and per-route loaders. This document captures **how CiteTrack actually uses it**, not the upstream feature surface.

## What CiteTrack does NOT use

Skip these — they are upstream features the project deliberately doesn't touch:

- **`createMiddleware`** — there are zero middleware files in `src/`. Authorization is done inline inside each server function (see _Authorization gate_ below). Don't introduce middleware for new endpoints.
- **`(groupName)/` route groups** — every route lives at its real path (`admin/api-logs.tsx`, `evaluation/$evalId/`). Don't add parentheses-folders.
- **Effect-TS inside routes / server functions** — services use plain `async/await` with the `db` client directly. Effect lives in `src/services/evaluation/` and `src/services/pdf/` for *pure pipeline logic*, not for HTTP/RPC plumbing.
- **`useSuspenseQuery`** — not used. The pattern is loader → `ensureQueryData` → `useQuery` + `pendingComponent`/`errorComponent`.
- **NextAuth-style session middleware** — there is no logged-in user concept. The only gate is `PUBLIC_MODE` (public-tool mode hides /history, /settings, /admin/*).

If a task asks you to "add middleware" or "wrap this in Effect", first check whether CiteTrack's existing pattern (inline `assertLocalOnly`, plain async, `beforeLoad`) already covers it. It almost always does.

## File-based routing

Routes live in `src/routes/`. File path = URL path. The project layout:

```
src/routes/
├── __root.tsx                           Root shell — sets <html>, meta, fonts
├── index.tsx                            /
├── privacy.tsx                          /privacy
├── evaluation.tsx                       /evaluation         (upload landing)
├── evaluation/$evalId/
│   ├── index.tsx                        /evaluation/:evalId (report)
│   ├── -hooks/                          Co-located hooks (router ignores `-` prefix)
│   │   ├── use-category-focus.ts
│   │   ├── use-evaluation-filters.ts
│   │   └── use-preview-selection.ts
│   └── -sections/                       Co-located components
│       ├── category-section.tsx
│       ├── evaluation-header.tsx
│       └── findings-table.tsx
├── track/
│   ├── index.tsx                        /track
│   └── -sections/
├── history/
│   ├── index.tsx                        /history (gated to local env)
│   └── -sections/
├── results/$jobId/
│   ├── index.tsx                        /results/:jobId
│   └── -sections/
├── admin/
│   └── api-logs.tsx                     /admin/api-logs (gated to local env)
├── settings.tsx                         /settings (gated to local env)
└── api/                                 API routes (file-served, no UI)
    ├── pdf.$jobId.ts                    GET /api/pdf/:jobId            (stream user PDF)
    ├── evaluation-pdf.$evalId.ts        GET /api/evaluation-pdf/:evalId
    ├── evaluation-annotated-pdf.$evalId.ts
    └── dev-fixture.ts                   GET /api/dev-fixture (local-only)
```

Conventions:
- `$param` — dynamic route segment, accessible via `Route.useParams()` or `params` in loader/handler.
- `-folderName/` — router ignores anything that starts with `-`. Use for `-sections/` (page-local components) and `-hooks/` (page-local hooks).
- `index.tsx` — the parent path itself.
- A parent route file (`evaluation.tsx` next to `evaluation/`) is rendered when a child matches — use `useChildMatches()` + `<Outlet />` to render differently when on a child route vs. on the parent (see `src/routes/evaluation.tsx`).

## `__root.tsx` — the shell

Uses `createRootRouteWithContext<MyRouterContext>()` so the loader context is typed across every child route. CiteTrack threads `{ queryClient }` through.

```typescript
// src/routes/__root.tsx
import {
  HeadContent,
  Scripts,
  createRootRouteWithContext,
} from '@tanstack/react-router'
import type { QueryClient } from '@tanstack/react-query'

interface MyRouterContext {
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'CiteTrack' },
      { name: 'description', content: '...' },
    ],
    links: [
      { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
      { rel: 'stylesheet', href: appCss },
    ],
  }),
  shellComponent: RootDocument,  // ← `shellComponent`, not `component`
})

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head><HeadContent /></head>
      <body>
        <Header />
        {children}
        <Footer />
        <Scripts />
      </body>
    </html>
  )
}
```

## `createFileRoute` — page routes

Every non-root route file exports `Route = createFileRoute('/path')({...})`. The path passed to `createFileRoute` must exactly match the file path (the codegen enforces this in `routeTree.gen.ts`).

### Minimal page route

```typescript
export const Route = createFileRoute('/privacy')({
  component: PrivacyPage,
  head: () => ({ meta: [{ title: 'Privacy · CiteTrack' }] }),
})
```

### Route with loader + react-query prefetch

The dominant pattern in CiteTrack: define a `queryOptions` factory outside the component, prefetch in the loader, consume with `useQuery`.

```typescript
// src/routes/evaluation/$evalId/index.tsx
import { queryOptions, useQuery } from '@tanstack/react-query'
import { getEvaluationReport } from '#/services/evaluation/report'

const evaluationReportQuery = (evalId: string) =>
  queryOptions({
    queryKey: ['evaluation-report', evalId] as const,
    queryFn: () => getEvaluationReport({ data: { evalJobId: evalId } }),
  })

export const Route = createFileRoute('/evaluation/$evalId/')({
  component: EvaluationReportPage,
  pendingComponent: EvaluationLoadingView,
  errorComponent: ({ error }) => <EvaluationErrorView error={error} />,
  loader: async ({ context: { queryClient }, params: { evalId } }) => {
    await queryClient.ensureQueryData(evaluationReportQuery(evalId))
  },
})

function EvaluationReportPage() {
  const { evalId } = Route.useParams()
  const { data, isPending } = useQuery(evaluationReportQuery(evalId))
  // ...
}
```

Notes:
- Use `ensureQueryData` (not `prefetchQuery`) so the loader awaits the data and any thrown error reaches `errorComponent`.
- `pendingComponent` covers the loader's pending state on first navigation. `errorComponent` catches loader throws (e.g. `notFound()` or service errors).
- `Route.useParams()` is the typed accessor — prefer it over the generic `useParams` hook.

### Route with search params (`validateSearch` + `zodValidator`)

CiteTrack uses URL search params heavily — they survive refresh and are shareable. Pattern: define a Zod schema, pass via `zodValidator`, declare which params the loader depends on via `loaderDeps`.

```typescript
// src/routes/history/index.tsx
import { zodValidator } from '@tanstack/zod-adapter'
import { historySearchSchema } from '#/schemas/history'

export const Route = createFileRoute('/history/')({
  component: HistoryRoute,
  validateSearch: zodValidator(historySearchSchema),
  loaderDeps: ({ search: { kind, page } }) => ({ kind, page }),
  loader: ({ context, deps: { kind, page } }) =>
    context.queryClient.ensureQueryData(historyQueryOptions(kind, page)),
})

function HistoryRoute() {
  const { kind, page } = Route.useSearch()  // typed via the schema
  const { data } = useQuery({
    ...historyQueryOptions(kind, page),
    staleTime: 30_000,
  })
  // ...
}
```

When you mutate search params, use `Route.useNavigate()` with `replace: true` to avoid spamming history:

```typescript
const navigate = Route.useNavigate()
navigate({ search: (prev) => ({ ...prev, page: next }), replace: true })
```

The schema lives in `src/schemas/<feature>.ts` (e.g. `historySearchSchema`, `pipelineSearchSchema`, `evaluationReportSearchSchema`). Keep search-param schemas there, not inline.

### Authorization gate (`beforeLoad` + `isLocalEnv`)

There are three routes that exist only in local-installation mode: `/history`, `/settings`, `/admin/api-logs`. Gate them with `beforeLoad` + `notFound()`:

```typescript
import { createFileRoute, notFound } from '@tanstack/react-router'
import { isLocalEnv } from '#/env'

export const Route = createFileRoute('/settings')({
  beforeLoad: () => {
    if (!isLocalEnv) throw notFound()
  },
  // ...
})
```

This is the **only** authorization construct in the project. There's no auth context, no session middleware. The matching server-side check (`assertLocalOnly()`) lives inside every server function those pages call — see _Server functions_ below.

### Parent route that's also a leaf (`useChildMatches` + `Outlet`)

`/evaluation` is both the upload page (when standalone) and the layout for `/evaluation/:evalId` (when on a child). Pattern:

```typescript
function EvaluationPage() {
  const childMatches = useChildMatches()
  if (childMatches.length > 0) return <Outlet />
  return <EvaluationUpload />  // standalone view
}
```

## API routes (`server.handlers`)

Files under `src/routes/api/` export `server.handlers.GET/POST/...`. CiteTrack uses these only for byte-streaming (PDFs); JSON RPC goes through `createServerFn` instead.

```typescript
// src/routes/api/pdf.$jobId.ts
import { createFileRoute } from '@tanstack/react-router'
import { readFile, stat } from 'node:fs/promises'
import { paths } from '#/lib/paths'

export const Route = createFileRoute('/api/pdf/$jobId')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const filePath = paths.userPdf(params.jobId)
        try {
          await stat(filePath)
        } catch {
          return new Response('PDF not found', { status: 404 })
        }
        const buffer = await readFile(filePath)
        return new Response(buffer, {
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': 'inline',
            'Cache-Control': 'private, max-age=3600',
          },
        })
      },
    },
  },
})
```

Local-only API routes use the same `isLocalEnv` gate inside the handler (see `src/routes/api/dev-fixture.ts`). There's no middleware to lift the check out.

## Server functions (`createServerFn`)

The RPC layer. All non-byte-stream server logic flows through `createServerFn`. Files live in `src/services/<feature>/*.ts` and are imported by route components (often via `await import('#/services/...')` for code-splitting).

### Shape

```typescript
import { createServerFn } from '@tanstack/react-start'
import { jobIdSchema } from '#/schemas/job'

export const parseCitationsForJob = createServerFn({ method: 'POST' })
  .inputValidator(jobIdSchema)
  .handler(async ({ data: { jobId } }) => {
    // plain async/await + Drizzle — no Effect wrapping
    const rows = await db.select().from(pages).where(eq(pages.jobId, jobId))
    // ...
    return { jobId, totalCitations: rows.length /* ... */ }
  })
```

Rules:
- `method`: `'GET'` for reads, `'POST'` for writes / anything with side effects. The choice mostly affects HTTP semantics; both can take input.
- `inputValidator`: pass a Zod schema directly. Reuse from `src/schemas/` (`jobIdSchema`, `evalJobIdSchema`, etc.). For typed-but-not-Zod input (e.g. FormData), pass a function — see below.
- Errors: throw `new Error(message)` for normal failures. Throw `notFound()` from `@tanstack/react-router` if the route should render its `errorComponent` as a 404. The error message is what the client sees in the rejected promise.

### Authorization (`assertLocalOnly`)

For server functions that should only run in the local installation (config writes, history queries, purge):

```typescript
import { assertLocalOnly } from '#/env'

export const listConfigurations = createServerFn({ method: 'GET' }).handler(
  async () => {
    assertLocalOnly()  // first line of every local-only handler
    // ...
  },
)
```

`assertLocalOnly()` reads the server-side `PUBLIC_MODE` flag and throws if the install is in public-tool mode. This is the **server-side** half of the gate; the client-side half (`isLocalEnv` in `beforeLoad`) only hides the UI. Both must agree — `env.ts` enforces "set both `PUBLIC_MODE` and `VITE_PUBLIC_MODE` to the same value in deployment" by design.

### FormData input

For file uploads, `inputValidator` takes a function that returns the parsed shape:

```typescript
// src/services/pdf/upload.ts
export const uploadThesis = createServerFn({ method: 'POST' })
  .inputValidator((data) => ({ file: getPdfFile(ensureFormData(data)) }))
  .handler(async ({ data: { file } }) => {
    await assertWithinUploadLimit(file)
    // ... write to disk, insert job row, return jobId
  })
```

`ensureFormData` and `getPdfFile` live in `src/services/pdf/upload-helpers.ts`. Use them — don't re-parse FormData inline.

On the client, call the server fn with FormData directly:

```typescript
const formData = new FormData()
formData.append('file', file)
const { evalJobId } = await uploadEvaluationThesis({ data: formData })
```

### Calling from the client

Three call styles, all of them just `serverFn({ data })`:

```typescript
// 1) Inside a queryFn (most reads)
const evaluationReportQuery = (evalId: string) =>
  queryOptions({
    queryKey: ['evaluation-report', evalId] as const,
    queryFn: () => getEvaluationReport({ data: { evalJobId: evalId } }),
  })

// 2) Inside a mutation
const mutation = useMutation({
  mutationFn: (input: SetFindingResolvedInput) =>
    setFindingResolved({ data: input }),
})

// 3) Direct call (kicks off a pipeline step, returns a promise)
const result = await parseCitationsForJob({ data: { jobId } })
```

Fire-and-forget pattern (e.g. kick off background extraction after upload returns the job id):

```typescript
void processEvaluationUpload({ data: { evalJobId } }).catch(() => {})
```

### Dynamic imports for code-splitting

Server fns that touch Node-only modules (or heavy parsers) use dynamic imports so the client bundle doesn't try to resolve them. This is also how `src/routes/track/index.tsx` keeps the pipeline parsers out of the initial bundle:

```typescript
// Inside a handler
const { mkdir, writeFile } = await import('node:fs/promises')
const { extractPdfText } = await import('#/services/pdf/extractor')

// In a route component
const { parseCitationsForJob } = await import('#/services/parser/citations')
const result = await parseCitationsForJob({ data: { jobId } })
```

### Background work

For long-running background analysis kicked off from a handler, use `setImmediate` (not just `void`) so the response actually flushes first:

```typescript
setImmediate(() => {
  runEvaluationAnalysis(evalJobId).catch((err) => {
    console.error('[evaluation] background analysis failed', err)
  })
})
```

## SSR-load workaround for the dev-mode RPC hang

**Known issue** (commit `9235f0f`): in this dev setup, `createServerFn`-backed client RPCs (`createClientRpc` → `/_serverFn/<id>`) sometimes never resolve back into react-query. A direct `curl` to the same endpoint returns 200 in ~100ms, but the browser hook stays `isLoading` forever.

If you add a new local-only route whose first paint depends on a server fn, **do not rely on `useQuery` to fire on mount**. Instead:

- For single queries: replace `useQuery({ queryFn })` with `Route.loader` + `useLoaderData()`, so the data is fetched server-side during navigation.
- For infinite queries: keep `useInfiniteQuery`, but in the loader call `context.queryClient.ensureInfiniteQueryData(...)` and let it seed the cache. Filter changes and load-more still go through `queryFn` and may still hang until the underlying bug is fixed.

See `src/routes/settings.tsx` and `src/routes/admin/api-logs.tsx` for the worked examples.

## Navigation

```typescript
import { useNavigate, Link } from '@tanstack/react-router'

// Programmatic (typed against your route tree)
const navigate = useNavigate()
navigate({ to: '/evaluation/$evalId', params: { evalId } })
navigate({ to: '/track', search: { jobId, phase: 'review-citations' }, replace: true })

// Declarative
<Link to="/evaluation/$evalId" params={{ evalId }}>Lihat laporan</Link>
```

Prefer the route-scoped accessors when you're inside a route file:

```typescript
const search = Route.useSearch()       // typed by validateSearch schema
const params = Route.useParams()       // typed by $segments
const navigate = Route.useNavigate()   // typed against this route's tree
const { queryClient } = Route.useRouteContext()
```

## Per-route `<head>`

Every route sets its own title and description (Indonesian by default, since the audience is Indonesian skripsi writers — see `.impeccable.md`). Use the `head` option:

```typescript
head: () => ({
  meta: [
    { title: 'Track citations · CiteTrack' },
    { name: 'description', content: 'Unggah PDF skripsi…' },
    { property: 'og:title', content: 'Track citations · CiteTrack' },
    { property: 'og:description', content: '…' },
  ],
}),
```

`<HeadContent />` in `__root.tsx` is what renders these. Don't add a separate `<Helmet>` library.

## Route option reference (CiteTrack-flavored)

```typescript
createFileRoute('/some/path')({
  // Search params
  validateSearch: zodValidator(someSearchSchema),
  loaderDeps: ({ search }) => ({ /* the keys the loader cares about */ }),

  // Auth / pre-data
  beforeLoad: ({ context, params }) => { /* throw notFound() for local-only routes */ },

  // Data
  loader: ({ context: { queryClient }, params, deps }) =>
    queryClient.ensureQueryData(someQueryOptions(...)),

  // UI
  component: MyComponent,
  pendingComponent: MyLoadingView,
  errorComponent: ({ error }) => <MyErrorView error={error} />,

  // <head>
  head: () => ({ meta: [...], links: [...] }),

  // Byte-streaming API routes only
  server: {
    handlers: { GET, POST, /* ... */ },
  },
})
```

## Quick checklist before opening a PR

- [ ] New page route uses `loader` + `ensureQueryData` + `useQuery`, not raw `fetch` on mount.
- [ ] Search-param route has `validateSearch: zodValidator(...)` and `loaderDeps` enumerating only the params the loader actually reads.
- [ ] Local-only route has `beforeLoad: () => { if (!isLocalEnv) throw notFound() }` **and** every server fn it calls starts with `assertLocalOnly()`.
- [ ] New `createServerFn` has `inputValidator` (Zod or FormData fn) and lives in `src/services/<feature>/`.
- [ ] Heavy / Node-only imports inside handlers use dynamic `await import(...)` so the client bundle stays slim.
- [ ] Page-local components go in `<route>/-sections/`, hooks in `<route>/-hooks/` — never put them next to the route file without the `-` prefix or they become routes.
- [ ] `head()` sets the Indonesian title + description for any user-facing page.
- [ ] No `createMiddleware`, no Effect wrappers in handlers, no `(group)/` folders — these aren't the CiteTrack way.
