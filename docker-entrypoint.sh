#!/bin/sh
set -e

echo "[entrypoint] Running database migrations..."
bunx drizzle-kit push --force

CONFIG_SEED="/app/deploy/seed/configurations.sql"
if [ -f "$CONFIG_SEED" ]; then
  echo "[entrypoint] Seeding configurations..."
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f "$CONFIG_SEED"
else
  echo "[entrypoint] No configurations seed at $CONFIG_SEED — skipping."
fi

VOCAB_SEED="/app/deploy/seed/vocabulary.sql"
if [ -f "$VOCAB_SEED" ]; then
  echo "[entrypoint] Seeding evaluation vocabulary..."
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f "$VOCAB_SEED"
else
  echo "[entrypoint] No vocabulary seed at $VOCAB_SEED — skipping."
fi

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

LEMMA_SEED="/app/deploy/seed/kbbi-lemma-supplement.sql"
if [ -f "$LEMMA_SEED" ]; then
  LCOUNT=$(psql "$DATABASE_URL" -t -A -c "SELECT COUNT(*) FROM dictionary_lemma" 2>/dev/null || echo "0")
  if [ "$LCOUNT" = "0" ]; then
    echo "[entrypoint] Loading KBBI lemma supplement from $LEMMA_SEED ..."
    psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f "$LEMMA_SEED"
    echo "[entrypoint] Lemma supplement load complete."
  else
    echo "[entrypoint] Skipping lemma supplement — dictionary_lemma has $LCOUNT rows."
  fi
else
  echo "[entrypoint] No lemma supplement at $LEMMA_SEED — skipping seed."
fi

echo "[entrypoint] Starting CiteTrack..."
exec bun .output/server/index.mjs
