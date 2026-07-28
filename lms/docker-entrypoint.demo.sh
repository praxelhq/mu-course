#!/bin/sh
# Demo container entrypoint: apply migrations, seed the demo world on a fresh
# DB (idempotent — skipped once users exist), then start the standalone server.
# Used only by the throwaway demo instance (Dockerfile.demo); real production
# uses docker-entrypoint.web.sh, which never seeds.
set -e

echo "[demo] applying database migrations (prisma migrate deploy)..."
prisma migrate deploy --schema prisma/schema.prisma

echo "[demo] checking demo seed..."
node prisma/seed-if-empty.cjs || echo "[demo] seed step reported an error; continuing"

echo "[demo] starting server..."
exec node server.js
