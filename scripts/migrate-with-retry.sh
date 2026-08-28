#!/bin/sh
# Neon's free-tier database suspends when idle and can take a few seconds to
# wake back up. Prisma's migrate lock wait (10s) sometimes loses that race on
# the very first connection of a build, failing the whole deploy with P1002.
# A first "wake up" query plus a couple of retries makes that reliable
# without needing a paid always-on database.
set -e

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
