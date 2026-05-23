#!/bin/sh
set -e

echo "Running database migrations..."
bunx drizzle-kit push

echo "Starting CiteTrack..."
exec bun run .output/server/index.mjs
