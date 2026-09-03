#!/bin/sh
# Neon's free-tier database suspends when idle and can take a few seconds to
# wake back up. Prisma's migrate lock wait (10s) sometimes loses that race on
# the very first connection of a build, failing the whole deploy with P1002.
# A first "wake up" query plus a couple of retries makes that reliable
# without needing a paid always-on database.
set -e

# Some build environments (some shared-hosting containers, for one) don't
# preserve the executable bit on Prisma's downloaded native engine binaries
# after `npm install` — that fails `prisma migrate deploy` with EACCES
# trying to spawn the schema engine. Re-apply it explicitly before running
# any prisma command; a no-op everywhere it isn't needed.
chmod +x node_modules/@prisma/engines/* 2>/dev/null || true
chmod +x node_modules/.prisma/client/*.node 2>/dev/null || true

echo "Waking up the database..."
echo "SELECT 1;" | npx prisma db execute --stdin --schema prisma/schema.prisma > /dev/null 2>&1 || true

attempt=1
max_attempts=4
until npx prisma migrate deploy; do
  if [ "$attempt" -ge "$max_attempts" ]; then
    echo "prisma migrate deploy failed after $attempt attempts"
    exit 1
  fi
  wait=$((attempt * 5))
  echo "migrate deploy attempt $attempt failed, retrying in ${wait}s..."
  sleep "$wait"
  attempt=$((attempt + 1))
done
