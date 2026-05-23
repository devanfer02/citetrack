#!/usr/bin/env bash
# Load the KBBI dictionary dump into the application's PostgreSQL database.
# Prereq: `bun run db:push` has already created the `dictionary` table.
# The SQL dump only contains INSERT statements — the table must exist first.
set -euo pipefail

DUMP="${KBBI_DUMP_PATH:-data/sql/dictionary_PostgreSQL.sql}"

if [[ ! -f "$DUMP" ]]; then
  echo "ERROR: KBBI dump not found at $DUMP" >&2
  echo "Set KBBI_DUMP_PATH or place the file at data/sql/dictionary_PostgreSQL.sql" >&2
  exit 1
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  if [[ -f .env.local ]]; then
    set -a
    # shellcheck disable=SC1091
    source .env.local
    set +a
  fi
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "ERROR: DATABASE_URL not set (and .env.local does not define it)." >&2
  exit 1
fi

echo "Loading KBBI dump from $DUMP into $DATABASE_URL ..."
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$DUMP"
echo "Done."
