#!/usr/bin/env bash
# EduBooks backup: PostgreSQL (custom-format dump) + uploaded files + checksummed manifest.
#   DATABASE_OWNER_URL  postgres URL of the owner role (required)
#   STORAGE_DIR         local file storage to archive (STORAGE_DRIVER=local). For S3, enable bucket
#                       versioning and/or set RCLONE_REMOTE to copy the bucket (e.g. "r2:edubooks-private").
#   BACKUP_DIR          where backups go (default ./backups)
#   BACKUP_KEEP_DAYS    delete local backups older than this (default 14)
#   BACKUP_GPG_RECIPIENT  optional: encrypt archives with this GPG public key
#   BACKUP_UPLOAD       optional rclone destination for off-site copies (e.g. "b2:edubooks-backups")
set -euo pipefail
: "${DATABASE_OWNER_URL:?DATABASE_OWNER_URL is required}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"; KEEP="${BACKUP_KEEP_DAYS:-14}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"; OUT="$BACKUP_DIR/edubooks-$STAMP"
umask 077; mkdir -p "$OUT"
log() { echo "[$(date -u +%H:%M:%S)] $*"; }

log "dumping database"
pg_dump --format=custom --compress=6 --no-password --file="$OUT/db.dump" "$DATABASE_OWNER_URL"
pg_restore --list "$OUT/db.dump" > /dev/null   # fails if the dump is unreadable

if [[ "${STORAGE_DRIVER:-local}" == "local" && -n "${STORAGE_DIR:-}" && -d "$STORAGE_DIR" ]]; then
  log "archiving files in $STORAGE_DIR"
  tar -C "$STORAGE_DIR" -czf "$OUT/files.tar.gz" .
elif [[ -n "${RCLONE_REMOTE:-}" ]]; then
  log "copying object storage $RCLONE_REMOTE"
  rclone copy "$RCLONE_REMOTE" "$OUT/files" --transfers 8
fi

psql "$DATABASE_OWNER_URL" -XAtq -c "SELECT count(*) FROM drizzle.__drizzle_migrations" > "$OUT/migrations.txt"
psql "$DATABASE_OWNER_URL" -XAtq -F ' ' -c "SELECT relname, n FROM (SELECT c.relname, (xpath('/row/n/text()', query_to_xml(format('SELECT count(*) AS n FROM public.%I', c.relname), false, true, '')))[1]::text::bigint AS n FROM pg_class c JOIN pg_namespace s ON s.oid = c.relnamespace WHERE s.nspname = 'public' AND c.relkind = 'r') t ORDER BY 1" > "$OUT/rowcounts.txt"

if [[ -n "${BACKUP_GPG_RECIPIENT:-}" ]]; then
  for f in "$OUT"/db.dump "$OUT"/files.tar.gz; do [[ -f "$f" ]] && gpg --batch --yes -r "$BACKUP_GPG_RECIPIENT" -o "$f.gpg" -e "$f" && rm -f "$f"; done
fi
( cd "$OUT" && find . -type f ! -name SHA256SUMS -print0 | sort -z | xargs -0 sha256sum > SHA256SUMS )
log "backup written: $OUT ($(du -sh "$OUT" | cut -f1))"

[[ -n "${BACKUP_UPLOAD:-}" ]] && { log "uploading off-site"; rclone copy "$OUT" "$BACKUP_UPLOAD/edubooks-$STAMP"; }
find "$BACKUP_DIR" -maxdepth 1 -type d -name 'edubooks-*' -mtime +"$KEEP" -exec rm -rf {} + 2>/dev/null || true
echo "$OUT"
