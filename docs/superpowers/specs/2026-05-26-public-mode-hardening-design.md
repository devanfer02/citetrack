# Public mode hardening — design

**Status:** draft (awaiting user review)
**Date:** 2026-05-26
**Author:** brainstorm session with the user

## Why

CiteTrack is a local-first tool. The default `docker compose up` puts the
whole app — History, Settings, 3rd Party Logs included — in front of one
operator on one machine. That's the intended deployment.

The user also wants a public-facing demo on a VPS so people can see the
tool actually works before they decide to clone and run it locally. The
demo is a credibility pitch, not a multi-tenant SaaS. Visitors are
anonymous, uploads are addressable by link, and there is no identity
layer — anyone with the link can open anyone's report.

`PUBLIC_MODE` already exists in `src/env.ts` and 404s the operator-only
routes (History, Settings, Admin) plus their server functions. What it
doesn't do yet:

1. Force the heavier configuration values (passage embeddings, upload
   size, autofetch concurrency, retention) down to demo-safe defaults.
2. Tell a visitor they're on a public demo, before they upload a draft
   thesis to a VPS.
3. Nudge people who care about privacy to run the tool locally instead.

Separate but adjacent: retention is split across two configs today. The
daily sweep reads `env.JOB_RETENTION_DAYS`, the manual purge button
reads DB config `purge.retention_days`. They should be one number.

## Scope

In scope:

- New `src/lib/public-mode.ts` module exposing `isPublicMode`,
  `isPublicModeClient`, and `PUBLIC_MODE_OVERRIDES`.
- Read-time override in `src/services/configurations-cache.ts:getConfig()`
  so public-mode values come back from the cache regardless of DB state.
- Retention unification: `runRetention` switches from
  `env.JOB_RETENTION_DAYS` to `getConfig('purge.retention_days')`. Env
  var becomes a one-shot DB seed when no row exists.
- Header badge component reading `isLocalEnv` client-side and rendering
  a small "Demo publik" pill in `src/components/Header.tsx`.
- New `src/components/PublicModeNotice.tsx` component, rendered above
  the upload dropzone on `/track` and `/evaluation` only when
  `!isLocalEnv`.
- Vitest coverage for the override path and the retention seed path.

Out of scope:

- Any new gated route or new `assertLocalOnly()` call site.
- Auth / login / identity. The demo stays anonymous-link-only.
- A per-job delete endpoint. Author can't delete their upload by design
  — the daily sweep is the only deletion path in public mode.
- A "report this upload" flow.
- A dedicated `/install` route. The privacy callout links to the GitHub
  README; the route can come later if needed.
- Touching `src/services/purge.ts` (manual purge). It keeps its existing
  `assertLocalOnly()` gate.

## Decisions

| Question | Decision |
|---|---|
| Where does the public-mode policy live? | `src/lib/public-mode.ts` — one module owns the boolean, the override map, and any future public-mode constants. Keeps `src/env.ts` to env-var parsing only. |
| How does the config override apply? | Read-time only. `getConfig()` returns the override when `isPublicMode && key in PUBLIC_MODE_OVERRIDES`. DB rows untouched. Flipping `PUBLIC_MODE` back to false restores normal behavior with no migration. |
| Which keys get overridden? | `passage.embedding_model='none'`, `upload.max_file_size_bytes=10485760` (10 MB), `autofetch.concurrency=2`, `purge.retention_days=1`. |
| How is retention unified? | `runRetention()` calls `await getConfig('purge.retention_days')` instead of reading the env var. `scheduleRetention()` checks once on boot: if no DB row exists for `purge.retention_days`, insert one using `env.JOB_RETENTION_DAYS ?? CONFIG_DEFAULTS['purge.retention_days']` as the value. After that the DB is authoritative; the env var is only ever consulted in this seed step. |
| How visible is the demo indicator? | Subtle: small pill next to the `CiteTrack` wordmark in the header. No action, no hover state, no link. Pure ambient signal. |
| Where is the privacy notice? | Pastel-blush `.soft-card` above the upload dropzone on `/track` and `/evaluation`. Only renders when `!isLocalEnv`. |
| Should the notice nudge toward local install? | Yes — last sentence inside the same callout, with an inline link to the GitHub repo README. No separate landing section, no `/install` route. |
| Where does the "run locally" link point? | GitHub repo README. Single constant in `src/lib/public-mode.ts` so it's one edit if the repo moves. URL is a TODO until the repo is pushed. |

## Architecture

### File changes

**New files**

- `src/lib/public-mode.ts` — exports `isPublicMode`, `isPublicModeClient`, `PUBLIC_MODE_OVERRIDES`, `CITETRACK_REPO_URL` (placeholder constant).
- `src/components/PublicModeNotice.tsx` — the blush soft-card callout. Pure presentational, no props beyond the optional className.
- `src/services/configurations-cache.test.ts` — Vitest covering override behavior.
- `src/services/retention.test.ts` — Vitest covering the seed-on-first-run path.

**Modified files**

- `src/services/configurations-cache.ts` — add override branch at the top of `getConfig`.
- `src/services/retention.ts` — switch from `env.JOB_RETENTION_DAYS` to `getConfig('purge.retention_days')`; add seed-if-missing logic.
- `src/components/Header.tsx` — add `<DemoBadge />` next to the wordmark, conditional on `!isLocalEnv`.
- `src/routes/track/index.tsx` — render `<PublicModeNotice />` above the dropzone.
- `src/routes/evaluation.tsx` — render `<PublicModeNotice />` above the dropzone.

### `src/lib/public-mode.ts` shape

```ts
import { env } from '#/env'
import type { ConfigKey, ConfigValue } from '#/lib/configurations'

export const isPublicMode = env.PUBLIC_MODE
export const isPublicModeClient = env.VITE_PUBLIC_MODE

export const PUBLIC_MODE_OVERRIDES = {
  'passage.embedding_model': 'none',
  'upload.max_file_size_bytes': 10 * 1024 * 1024,
  'autofetch.concurrency': 2,
  'purge.retention_days': 1,
} as const satisfies Partial<{ [K in ConfigKey]: ConfigValue<K> }>

export const CITETRACK_REPO_URL = 'https://github.com/TODO/citetrack'
```

### Override mechanism in `getConfig`

Lookup precedence becomes:

```
getConfig(key)
  if isPublicMode and key in PUBLIC_MODE_OVERRIDES
    return PUBLIC_MODE_OVERRIDES[key]
  if DB row exists and schema parses
    return parsed DB value
  return CONFIG_DEFAULTS[key]
```

No caller changes. Every reader (passage matching, autofetch, upload
validation, retention sweep, manual purge) gets the override transparently.

### Retention unification

`runRetention()` in `src/services/retention.ts` becomes:

```ts
export async function runRetention(): Promise<RetentionRunResult> {
  const startedAt = Date.now()
  const retentionDays = await getConfig('purge.retention_days')
  const threshold = new Date(Date.now() - retentionDays * ONE_DAY_MS)
  // ...existing delete logic
}
```

On first invocation when no DB row exists for `purge.retention_days`,
`getConfig()` falls back to `CONFIG_DEFAULTS` and the row stays absent.
We add a one-shot seed in `scheduleRetention`'s initial run that inserts
the row using `env.JOB_RETENTION_DAYS ?? CONFIG_DEFAULTS[...]`. After
seed, subsequent reads come from the DB normally.

### UI gating

`isLocalEnv` is the client-side flag (already defined in `src/env.ts`).
The two UI surfaces are conditional on `!isLocalEnv`:

- `Header.tsx`: badge renders inside the existing nav layout. No layout
  reflow; the badge sits in the same flex row as the wordmark.
- `PublicModeNotice.tsx`: rendered as the first child of the upload
  card on `/track` and `/evaluation`. Uses `.soft-card[data-tone="blush"]`
  per the design tokens.

## Copy (final, audited)

All Indonesian. Voice: calm, direct, "kamu" not "anda", no exclamations,
no emoji. Audited against `humanizer` and `ux-writing` skills.

**Header badge**

```
Demo publik
```

**Privacy callout heading**

```
Ini demo publik
```

**Privacy callout body**

> Apa pun yang kamu unggah di sini bisa dibuka siapa saja yang punya
> tautannya, dan tidak bisa dihapus atas permintaan. Sapuan harian
> menghapus unggahan setelah sekitar 24 jam, tapi sebelum itu, anggap
> saja publik. Untuk skripsi yang sensitif, jalankan CiteTrack di
> komputermu sendiri. **Panduan di GitHub.**

The bolded "Panduan di GitHub" is the inline link, pointing to
`CITETRACK_REPO_URL`.

## Tests

`src/services/configurations-cache.test.ts`

- With `PUBLIC_MODE=true` and no DB row, `getConfig('passage.embedding_model')` returns `'none'`.
- With `PUBLIC_MODE=true` and a DB row set to `'multilingual-e5-base'`, `getConfig('passage.embedding_model')` still returns `'none'`.
- With `PUBLIC_MODE=false` and a DB row, `getConfig('passage.embedding_model')` returns the DB value.
- With `PUBLIC_MODE=false` and no DB row, `getConfig('passage.embedding_model')` returns `CONFIG_DEFAULTS` value.
- Same matrix for `upload.max_file_size_bytes`, `autofetch.concurrency`, `purge.retention_days`.
- A non-overridden key (e.g. `kbbi.use_tor_proxy`) is untouched by `PUBLIC_MODE=true`.

`src/services/retention.test.ts`

- `runRetention()` reads from `getConfig('purge.retention_days')`, not env var.
- When the DB row is absent on first call, the seed inserts a row with `env.JOB_RETENTION_DAYS` (or the schema default if env is unset), and the row persists.
- When `PUBLIC_MODE=true`, the threshold computed inside `runRetention` matches a 1-day cutoff regardless of env var.

Manual smoke (post-merge):

- `PUBLIC_MODE=false bun run dev` — confirm History, Settings, 3rd Party Logs nav items visible. No badge. No callout on /track or /evaluation.
- `PUBLIC_MODE=true bun run dev` — confirm those nav items hidden, `/settings` 404s, header shows `Demo publik` badge, /track and /evaluation show the privacy callout above the dropzone, link in callout opens the repo URL.

## Open questions and TODOs

- `CITETRACK_REPO_URL`: placeholder until the repo is pushed to GitHub.
  Single source of truth in `src/lib/public-mode.ts`; one-line update
  when ready.
- `docker-compose.yml` for the public deploy: set both `PUBLIC_MODE=true`
  and `VITE_PUBLIC_MODE=true`. Out of scope for this spec — production
  deploy config is its own task — but worth noting the two flags must
  match.
- The `JOB_RETENTION_DAYS` env var stays declared in `src/env.ts` after
  the unification so existing `.env` files don't break validation. It's
  used only as the seed default when no DB row exists. A comment in
  `env.ts` should call this out.
