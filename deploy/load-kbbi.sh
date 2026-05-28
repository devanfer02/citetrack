#!/usr/bin/env bash
# Load the merged KBBI seed into the application's PostgreSQL database.
# Prereq: `bun run db:push` has already created the `dictionary` and
# `dictionary_lemma` tables.
#
# Production path: deploy/seed/kbbi/core_kbbi.sql is the canonical bundle —
# it TRUNCATEs both tables and re-INSERTs from every source, so re-runs are
# safe. The per-source files under deploy/seed/kbbi/source/ exist as raw
# provenance and can be regenerated with `bun .claude/scripts/build-kbbi-sources.ts`.
set -euo pipefail

CORE="${KBBI_DUMP_PATH:-deploy/seed/kbbi/core_kbbi.sql}"

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

if [[ -f "$CORE" ]]; then
  echo "Loading KBBI core seed from $CORE into $DATABASE_URL ..."
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$CORE"
  echo "Done."
  exit 0
fi

# Fallback for transitional environments where core_kbbi.sql has not been
# generated yet — load each per-source file in deterministic order. Equivalent
# end state, just slower.
echo "WARN: $CORE not found — falling back to loading source/*.sql in order." >&2
SOURCE_DIR="deploy/seed/kbbi/source"
if [[ ! -d "$SOURCE_DIR" ]]; then
  echo "ERROR: neither $CORE nor $SOURCE_DIR is present." >&2
  exit 1
fi

shopt -s nullglob
for f in "$SOURCE_DIR"/*.sql; do
  echo "Loading $f ..."
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f"
done
echo "Done."
