#!/usr/bin/env bun
// Analyse the existing api_call_logs to answer "is direction A (polite
// pool + cache + concurrency=1) enough, or do we need direction B
// (client-side lookups)?". Computes:
//   - 429 rate per provider
//   - per-job API call cost (p50/p95)
//   - URL duplication (cache hit potential)
//   - burst rate (max calls per minute, per provider)
//   - duration p50/p95 per provider
// Pulls from docker-compose's db service via `docker compose exec`.
//
// Usage:
//   bun .claude/scripts/measure-api-load.ts                # last 24h
//   WINDOW_HOURS=72 bun .claude/scripts/measure-api-load.ts
//
// Output: .claude/scripts/output/api-load-<timestamp>.json + markdown.

import { execSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const OUTPUT_DIR = resolve(process.cwd(), '.claude/scripts/output')
const WINDOW_HOURS = Number(process.env.WINDOW_HOURS ?? '24')

function psql<T = unknown>(sql: string): T[] {
  // psql with -tA defaults to pipe-separated rows. Pipe doesn't appear
  // in our URLs (provider names, ISO timestamps, slash-only URLs), so
  // it's a safe field separator without needing shell escaping.
  const raw = execSync(
    `docker compose exec -T db psql -U postgres -d citetrack -tA -c "${sql.replace(/"/g, '\\"')}"`,
    { encoding: 'utf8' },
  )
  const lines = raw.trim().split('\n').filter(Boolean)
  return lines.map((line) => {
    const cols = line.split('|')
    return cols as unknown as T
  })
}

interface ProviderStat {
  provider: string
  total: number
  successes: number
  http_429: number
  http_other_error: number
  network_error: number
  timeout: number
  rate_429: number
  rate_error: number
  p50_ms: number
  p95_ms: number
}

interface BurstStat {
  provider: string
  worst_minute_iso: string
  calls_in_minute: number
}

interface JobCostStat {
  median_calls_per_job: number
  p95_calls_per_job: number
  total_jobs: number
}

interface CacheHitStat {
  provider: string
  unique_urls: number
  total_calls: number
  duplicate_call_rate: number
  example_url_with_hits: { url: string; hits: number } | null
}

console.log(`Analysing api_call_logs for the last ${WINDOW_HOURS} hours…\n`)

// Per-provider summary
const providerRows = psql<[string, string, string, string, string, string, string, string]>(`
  SELECT
    provider,
    COUNT(*) AS total,
    COUNT(*) FILTER (WHERE outcome = 'success') AS successes,
    COUNT(*) FILTER (WHERE status = 429) AS http_429,
    COUNT(*) FILTER (WHERE outcome = 'http_error' AND (status IS NULL OR status <> 429)) AS http_other,
    COUNT(*) FILTER (WHERE outcome = 'network_error') AS net_err,
    COUNT(*) FILTER (WHERE outcome = 'timeout') AS to_err,
    percentile_disc(0.5) WITHIN GROUP (ORDER BY duration_ms)::int AS p50,
    percentile_disc(0.95) WITHIN GROUP (ORDER BY duration_ms)::int AS p95
  FROM api_call_logs
  WHERE created_at >= NOW() - INTERVAL '${WINDOW_HOURS} hours'
  GROUP BY provider
  ORDER BY total DESC;
`)

const providerStats: ProviderStat[] = providerRows.map((cols) => {
  const [provider, total, successes, http_429, http_other, net_err, to_err, p50, p95] = cols
  const totalN = Number(total)
  return {
    provider,
    total: totalN,
    successes: Number(successes),
    http_429: Number(http_429),
    http_other_error: Number(http_other),
    network_error: Number(net_err),
    timeout: Number(to_err),
    rate_429: totalN === 0 ? 0 : Number(http_429) / totalN,
    rate_error:
      totalN === 0
        ? 0
        : (Number(http_429) + Number(http_other) + Number(net_err) + Number(to_err)) /
          totalN,
    p50_ms: Number(p50 ?? 0),
    p95_ms: Number(p95 ?? 0),
  }
})

// Burst — worst minute per provider
const burstRows = psql<[string, string, string]>(`
  WITH per_min AS (
    SELECT provider, date_trunc('minute', created_at) AS minute, COUNT(*) AS c
    FROM api_call_logs
    WHERE created_at >= NOW() - INTERVAL '${WINDOW_HOURS} hours'
    GROUP BY provider, minute
  ), ranked AS (
    SELECT provider, minute, c,
           ROW_NUMBER() OVER (PARTITION BY provider ORDER BY c DESC) AS rn
    FROM per_min
  )
  SELECT provider, minute, c FROM ranked WHERE rn = 1 ORDER BY c DESC;
`)

const burstStats: BurstStat[] = burstRows.map((cols) => {
  const [provider, minute, calls] = cols
  return {
    provider,
    worst_minute_iso: new Date(minute).toISOString(),
    calls_in_minute: Number(calls),
  }
})

// Job cost — distribution of API calls per (track) job
const jobCostRows = psql<[string, string, string]>(`
  WITH per_job AS (
    SELECT track_job_id, COUNT(*) AS c
    FROM api_call_logs
    WHERE track_job_id IS NOT NULL
      AND created_at >= NOW() - INTERVAL '${WINDOW_HOURS} hours'
    GROUP BY track_job_id
  )
  SELECT
    percentile_disc(0.5) WITHIN GROUP (ORDER BY c)::int AS median,
    percentile_disc(0.95) WITHIN GROUP (ORDER BY c)::int AS p95,
    COUNT(*) AS total_jobs
  FROM per_job;
`)

const jobCost: JobCostStat = jobCostRows[0]
  ? {
      median_calls_per_job: Number(jobCostRows[0][0] ?? 0),
      p95_calls_per_job: Number(jobCostRows[0][1] ?? 0),
      total_jobs: Number(jobCostRows[0][2] ?? 0),
    }
  : { median_calls_per_job: 0, p95_calls_per_job: 0, total_jobs: 0 }

// Cache hit potential — for OpenAlex/CrossRef lookup-style URLs, how
// many unique URLs vs total calls?
const cacheRows = psql<[string, string, string, string, string]>(`
  WITH lookup_calls AS (
    SELECT provider, url
    FROM api_call_logs
    WHERE provider IN ('openalex', 'crossref', 'unpaywall', 'semantic-scholar')
      AND created_at >= NOW() - INTERVAL '${WINDOW_HOURS} hours'
  ), by_provider AS (
    SELECT provider, COUNT(*) AS total, COUNT(DISTINCT url) AS unique_urls
    FROM lookup_calls
    GROUP BY provider
  ), most_duplicated AS (
    SELECT DISTINCT ON (provider) provider, url, c FROM (
      SELECT provider, url, COUNT(*) AS c FROM lookup_calls GROUP BY provider, url
    ) t
    ORDER BY provider, c DESC
  )
  SELECT b.provider, b.total, b.unique_urls,
         COALESCE(m.url, ''), COALESCE(m.c, '0')
  FROM by_provider b
  LEFT JOIN most_duplicated m ON m.provider = b.provider
  ORDER BY b.total DESC;
`)

const cacheStats: CacheHitStat[] = cacheRows.map((cols) => {
  const [provider, total, unique, ex_url, ex_hits] = cols
  const totalN = Number(total)
  const uniqueN = Number(unique)
  return {
    provider,
    total_calls: totalN,
    unique_urls: uniqueN,
    duplicate_call_rate: totalN === 0 ? 0 : (totalN - uniqueN) / totalN,
    example_url_with_hits:
      Number(ex_hits) > 1 ? { url: ex_url, hits: Number(ex_hits) } : null,
  }
})

// Verdict heuristic — based on the table I outlined in chat
function verdict(): {
  conclusion: 'A is enough' | 'A is borderline' | 'A is insufficient'
  reasons: string[]
} {
  const reasons: string[] = []
  const worstProvider = providerStats[0]
  if (!worstProvider) {
    return {
      conclusion: 'A is enough',
      reasons: ['No traffic in window — nothing to evaluate'],
    }
  }
  const worst429 = Math.max(
    ...providerStats.map((s) => s.rate_429),
    0,
  )
  const bestCacheHit = Math.max(
    ...cacheStats.map((s) => s.duplicate_call_rate),
    0,
  )

  if (worst429 < 0.01 && bestCacheHit > 0.3) {
    reasons.push(
      `429 rate < 1% on worst provider (${(worst429 * 100).toFixed(2)}%)`,
    )
    reasons.push(
      `cache hit potential ≥ 30% on best provider (${(bestCacheHit * 100).toFixed(1)}%)`,
    )
    return { conclusion: 'A is enough', reasons }
  }
  if (worst429 < 0.05) {
    reasons.push(
      `429 rate < 5% on worst provider (${(worst429 * 100).toFixed(2)}%)`,
    )
    if (bestCacheHit < 0.3) {
      reasons.push(
        `cache hit potential low (${(bestCacheHit * 100).toFixed(1)}%) — A weakens as users grow`,
      )
    }
    return { conclusion: 'A is borderline', reasons }
  }
  reasons.push(
    `429 rate ${(worst429 * 100).toFixed(2)}% on worst provider exceeds 5%`,
  )
  return { conclusion: 'A is insufficient', reasons }
}

const v = verdict()

const report = {
  windowHours: WINDOW_HOURS,
  generatedAt: new Date().toISOString(),
  providers: providerStats,
  bursts: burstStats,
  jobCost,
  cachePotential: cacheStats,
  verdict: v,
}

mkdirSync(OUTPUT_DIR, { recursive: true })
const ts = new Date().toISOString().replace(/[:.]/g, '-')
const jsonPath = resolve(OUTPUT_DIR, `api-load-${ts}.json`)
writeFileSync(jsonPath, JSON.stringify(report, null, 2))

const md = renderMarkdown(report)
const mdPath = resolve(OUTPUT_DIR, `api-load-${ts}.md`)
writeFileSync(mdPath, md)

console.log(md)
console.log(`\nFull JSON: ${jsonPath}`)
console.log(`Markdown:  ${mdPath}`)

function renderMarkdown(r: typeof report): string {
  const lines: string[] = []
  lines.push(`# API load report — last ${r.windowHours}h`)
  lines.push('')
  lines.push(`Generated ${r.generatedAt}`)
  lines.push('')
  lines.push(`## Verdict: **${r.verdict.conclusion}**`)
  for (const reason of r.verdict.reasons) lines.push(`- ${reason}`)
  lines.push('')
  lines.push(`## Per-provider`)
  lines.push('')
  lines.push(
    '| provider | total | 429 | err | 429 rate | err rate | p50 ms | p95 ms |',
  )
  lines.push('|---|---:|---:|---:|---:|---:|---:|---:|')
  for (const p of r.providers) {
    lines.push(
      `| ${p.provider} | ${p.total} | ${p.http_429} | ${p.http_other_error + p.network_error + p.timeout} | ${(p.rate_429 * 100).toFixed(2)}% | ${(p.rate_error * 100).toFixed(2)}% | ${p.p50_ms} | ${p.p95_ms} |`,
    )
  }
  lines.push('')
  lines.push(`## Burst — worst minute per provider`)
  lines.push('')
  lines.push('| provider | worst minute | calls |')
  lines.push('|---|---|---:|')
  for (const b of r.bursts) {
    lines.push(`| ${b.provider} | ${b.worst_minute_iso} | ${b.calls_in_minute} |`)
  }
  lines.push('')
  lines.push(`## Per-job cost`)
  lines.push('')
  lines.push(`- Jobs in window: **${r.jobCost.total_jobs}**`)
  lines.push(`- Median API calls per job: **${r.jobCost.median_calls_per_job}**`)
  lines.push(`- p95 API calls per job: **${r.jobCost.p95_calls_per_job}**`)
  lines.push('')
  lines.push(`## Cache hit potential (lookup-style providers)`)
  lines.push('')
  lines.push('| provider | total calls | unique urls | duplicate rate | example |')
  lines.push('|---|---:|---:|---:|---|')
  for (const c of r.cachePotential) {
    const ex = c.example_url_with_hits
      ? `${c.example_url_with_hits.hits}× — ${c.example_url_with_hits.url.slice(0, 60)}…`
      : '—'
    lines.push(
      `| ${c.provider} | ${c.total_calls} | ${c.unique_urls} | ${(c.duplicate_call_rate * 100).toFixed(1)}% | ${ex} |`,
    )
  }
  return lines.join('\n')
}
