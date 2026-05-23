#!/bin/sh
set -e

echo "[entrypoint] Running database migrations..."
bunx drizzle-kit push --force

echo "[entrypoint] Seeding configurations..."
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f /app/deploy/seed/configurations.sql

echo "[entrypoint] Seeding evaluation vocabulary..."
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f /app/deploy/seed/vocabulary.sql

KBBI_DUMP="/app/deploy/seed/kbbi-dictionary.sql"
if [ -f "$KBBI_DUMP" ]; then
  COUNT=$(psql "$DATABASE_URL" -t -A -c "SELECT COUNT(*) FROM dictionary" 2>/dev/null || echo "0")
  if [ "$COUNT" = "0" ]; then
    echo "[entrypoint] Loading KBBI dump from $KBBI_DUMP ..."
    psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f "$KBBI_DUMP"
    echo "[entrypoint] KBBI load complete."
  else
    echo "[entrypoint] Skipping KBBI load — dictionary has $COUNT rows."
  fi
else
  echo "[entrypoint] No KBBI dump at $KBBI_DUMP — skipping seed."
fi

echo "[entrypoint] Starting CiteTrack..."
exec bun .output/server/index.mjs
