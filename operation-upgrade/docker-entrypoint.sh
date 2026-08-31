#!/bin/sh
set -e
# Schema first, then serve. Railway's healthcheck timeout covers the migration.
if [ -n "$DATABASE_URL" ]; then
  echo "operation-upgrade: applying migrations"
  prisma migrate deploy --schema ./prisma/schema.prisma
else
  echo "operation-upgrade: no DATABASE_URL, running without a database"
fi
exec node server.js
