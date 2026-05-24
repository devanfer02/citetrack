import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'

import { env } from '#/env.ts'
import * as schema from './schema.ts'

// Explicit pg.Pool so we can cap connections on a small VPS (Postgres
// max_connections is also lowered to 20 in docker-compose; we stay
// well under it to leave headroom for psql/drizzle-kit/admin sessions).
export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
})

export const db = drizzle(pool, { schema })

// Kick off the daily retention sweep. Safe side-effect: db is
// server-only, so the import path is only loaded inside server fns.
if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'test') {
  void import('#/services/retention.ts').then((m) => m.scheduleRetention())
}
