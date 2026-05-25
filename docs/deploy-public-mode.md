# Public-mode deploy notes

Things to set when deploying CiteTrack as a public demo on a VPS.
These keep the demo from hitting upstream rate limits when multiple
visitors land at once.

## Environment variables

Set these in the production `.env` (alongside `PUBLIC_MODE=true` and
`VITE_PUBLIC_MODE=true`). The codepaths already look for them; missing
values just downgrade you to the anonymous tier for each provider.

| Variable | Provider | Effect | How to get one |
|---|---|---|---|
| `POLITE_POOL_EMAIL` | CrossRef + OpenAlex + Unpaywall | Moves CrossRef from ~5 req/sec anonymous to ~50 req/sec polite. Same for OpenAlex (`mailto=` param in URL). Free. | Pick any contact email. The first request is the "registration"; subsequent calls share that identity. |
| `UNPAYWALL_EMAIL` | Unpaywall | Required, not optional — Unpaywall refuses anonymous calls. 100k requests/day. | Use the same email as POLITE_POOL_EMAIL. Register at https://unpaywall.org/products/api |
| `NCBI_API_KEY` | PubMed / NCBI | 3 req/sec anonymous → 10 req/sec with key. | https://www.ncbi.nlm.nih.gov/account/settings/ → API Key Management |
| `SEMANTIC_SCHOLAR_API_KEY` | Semantic Scholar | 1 req/sec anonymous → 100 req/sec with key. | https://www.semanticscholar.org/product/api → "Request a free API key" |
| `CORE_API_KEY` | CORE | Without this, the CORE provider is disabled entirely. With it, you get the documented quota (typically a few thousand req/day). | https://core.ac.uk/services/api → register |

## What you also get for free

The single in-process throttle in `src/lib/http-throttle.ts` already
applies a 400ms+jitter minimum gap per upstream host and a per-host
cooldown that fires on any 429 or 503 response. When a provider rate
limits us, that host is parked (honoring `Retry-After`) and subsequent
callers fall through to the next provider in the 8-provider fallback
chain (CrossRef → OpenAlex → Europe PMC → PubMed → arXiv → Semantic
Scholar → Unpaywall → CORE). No restart needed; the cooldown expires
on its own.

KBBI Kemendikdasmen has an extra layer: enable `kbbi.use_tor_proxy=1`
in `/settings` so lookups route through the bundled Tor sidecar. That
diversifies the egress IP when multiple visitors hit KBBI within the
same window. The sidecar starts automatically with `docker compose
up`.

## What's not covered yet

- Cross-job dedup for autofetch (Tier 2 in the brainstorm). If user A
  and user B both reference the same DOI within a day, both jobs hit
  the providers from scratch. No shared `provider_cache` table yet.
- Queue-position UI. With `MAX_CONCURRENT_JOBS=1`, jobs serialize, but
  waiting users see no indicator. They might think the upload froze.
- Per-host rate budgets specific to each provider. Right now every
  host uses the same 400ms baseline; some providers (arXiv at 1/3sec)
  would benefit from a longer custom gap.

Pick up these when the demo actually starts hitting 429s in
production telemetry.
