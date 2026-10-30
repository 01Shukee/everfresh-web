#!/usr/bin/env bash
# Nightly PostgreSQL backup with 30-day rotation. Run from a scheduler on a machine that can reach the database.
# Needs: pg_dump on PATH and DATABASE_URL in the environment. Store the output OFF the database host (and encrypt it: it holds customer data).
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL is required}"; DIR="${BACKUP_DIR:-./backups}"; mkdir -p "$DIR"
F="$DIR/everfresh-$(date -u +%Y%m%dT%H%M%SZ).dump"
pg_dump --format=custom --no-owner "$DATABASE_URL" > "$F"
[ -s "$F" ] || { echo "backup is empty" >&2; rm -f "$F"; exit 1; }
find "$DIR" -name 'everfresh-*.dump' -mtime +30 -delete
echo "backup ok: $F"
