#!/bin/sh
# Web container entrypoint: apply pending Prisma migrations, then start the
# Next.js standalone server. Forward-only migrations (see CLAUDE.md) make this
# safe to run on every deploy; `migrate deploy` is a no-op when up to date.
set -e

echo "[web] applying database migrations (prisma migrate deploy)..."
prisma migrate deploy --schema prisma/schema.prisma

echo "[web] starting server..."
exec node server.js
