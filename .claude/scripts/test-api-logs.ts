#!/usr/bin/env bun
import { desc, eq } from 'drizzle-orm'
import { db } from '#/db'
import { apiCallLogs } from '#/db/schema'
import {
  loggedFetch,
  withApiLogContext,
} from '#/services/logs/logged-fetch'

const SENTINEL_HOST = 'https://example.test/api-logs-smoke'

async function clearOldRuns(): Promise<void> {
  // Best-effort cleanup so repeat runs don't pollute the table.
  await db
    .delete(apiCallLogs)
    .where(eq(apiCallLogs.provider, 'openalex'))
    .returning({ id: apiCallLogs.id })
    .catch(() => [])
}

function stubFetch(body: string, status: number): void {
  globalThis.fetch = async () =>
    new Response(body, {
      status,
      headers: {
        'content-type': 'application/json',
        'content-length': String(body.length),
      },
    })
}

function restoreFetch(original: typeof globalThis.fetch): void {
  globalThis.fetch = original
}

const originalFetch = globalThis.fetch

async function main(): Promise<void> {
  console.log('Smoke-test for loggedFetch + api_call_logs')
  console.log('---')

  await clearOldRuns()

  // Case 1: success with body capture
  stubFetch('{"results":[{"id":"W123"}]}', 200)
  const fakeJobId = '00000000-0000-0000-0000-000000000000'
  try {
    await withApiLogContext({ trackJobId: fakeJobId }, async () => {
      const res = await loggedFetch(
        { provider: 'openalex' },
        `${SENTINEL_HOST}/works?search=test`,
      )
      const body = await res.json()
      console.log('case 1: caller got body', JSON.stringify(body))
    })
  } catch (err) {
    // trackJobId references a fake uuid that doesn't exist in jobs table —
    // the FK will reject the insert. That's expected; we'll verify by
    // dropping the FK constraint, or by using a real job. For the smoke
    // test we just verify the wrapper doesn't break the caller.
    console.log('case 1 caller still completed despite FK error:', err)
  }

  // Case 2: HTTP error
  stubFetch('{"error":"forbidden"}', 403)
  const res2 = await loggedFetch(
    { provider: 'openalex' },
    `${SENTINEL_HOST}/works/forbidden`,
  )
  console.log('case 2: status', res2.status)

  // Case 3: network error
  globalThis.fetch = async () => {
    throw new Error('econnrefused')
  }
  try {
    await loggedFetch(
      { provider: 'openalex' },
      `${SENTINEL_HOST}/works/network-fail`,
    )
    console.log('case 3 FAILED — should have thrown')
  } catch (err) {
    console.log('case 3: caller saw network error:', (err as Error).message)
  }

  restoreFetch(originalFetch)

  // Wait for fire-and-forget DB writes.
  await new Promise((resolve) => setTimeout(resolve, 1000))

  // Verify rows landed for the calls that didn't FK-fail.
  const rows = await db
    .select()
    .from(apiCallLogs)
    .where(eq(apiCallLogs.provider, 'openalex'))
    .orderBy(desc(apiCallLogs.createdAt))
    .limit(10)

  console.log('---')
  console.log(`Found ${rows.length} log rows (provider='openalex'):`)
  for (const row of rows) {
    console.log(
      `  [${row.id}] ${row.outcome} status=${row.status} duration=${row.durationMs}ms url=${row.url}`,
    )
    if (row.bodyPreview) {
      const preview = row.bodyPreview.slice(0, 80)
      console.log(
        `    body (${row.bodySizeBytes}B${row.bodyTruncated ? ', truncated' : ''}): ${preview}`,
      )
    }
    if (row.errorMessage) {
      console.log(`    error: ${row.errorMessage}`)
    }
  }

  console.log('---')
  console.log(
    rows.length >= 2
      ? 'PASS: at least the http_error + network_error cases landed in the DB.'
      : 'WARN: fewer rows than expected — check api_call_logs migration was applied (bun run db:migrate or restart docker compose).',
  )
}

await main()
