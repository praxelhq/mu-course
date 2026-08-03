#!/bin/sh
set -eu
prisma migrate deploy --schema ./prisma/schema.prisma
exec node server.js
