#!/usr/bin/env bash
# Restore an EduBooks backup into an EMPTY database (never over a live one).
#   restore.sh <backup-folder> <target-database-url> [target-storage-dir]
# The target database must exist, be owned by the owner role, and have the roles from infra/bootstrap.sql.
# Encrypted backups (*.gpg) are decrypted with the local GPG key.
set -euo pipefail
SRC="${1:?backup folder}"; TARGET="${2:?target database url}"; FILES_TO="${3:-}"
log() { echo "[$(date -u +%H:%M:%S)] $*"; }
WORK="$(mktemp -d)"; trap 'rm -rf "$WORK"' EXIT

log "verifying checksums"
( cd "$SRC" && sha256sum --quiet -c SHA256SUMS )
for f in db.dump files.tar.gz; do
  if [[ -f "$SRC/$f.gpg" ]]; then gpg --batch -o "$WORK/$f" -d "$SRC/$f.gpg"; elif [[ -f "$SRC/$f" ]]; then ln -s "$(cd "$SRC" && pwd)/$f" "$WORK/$f"; fi
done

tables="$(psql "$TARGET" -XAtq -c "SELECT count(*) FROM pg_tables WHERE schemaname = 'public'")"
[[ "$tables" == "0" ]] || { echo "Refusing: target database already has $tables tables. Restore into an empty database." >&2; exit 2; }

log "restoring database"
# Extensions are created by a superuser (infra/bootstrap.sql), so skip them and their comments.
pg_restore --list "$WORK/db.dump" | grep -Ev ' (EXTENSION|COMMENT - EXTENSION) ' > "$WORK/toc.list"
for ext in pgcrypto citext vector; do
  psql "$TARGET" -XAtq -c "SELECT 1 FROM pg_extension WHERE extname = '$ext'" | grep -q 1 || { echo "Extension $ext missing in target — run the CREATE EXTENSION lines of infra/bootstrap.sql first." >&2; exit 2; }
done
pg_restore --no-password --exit-on-error --single-transaction --use-list="$WORK/toc.list" --dbname="$TARGET" "$WORK/db.dump"

if [[ -n "$FILES_TO" && -f "$WORK/files.tar.gz" ]]; then
  log "restoring files into $FILES_TO"
  mkdir -p "$FILES_TO" && tar -C "$FILES_TO" -xzf "$WORK/files.tar.gz"
fi

log "checking row counts and schema version"
psql "$TARGET" -XAtq -c "SELECT count(*) FROM drizzle.__drizzle_migrations" | diff -q - "$SRC/migrations.txt" > /dev/null || { echo "Migration count differs" >&2; exit 3; }
psql "$TARGET" -XAtq -F ' ' -c "SELECT relname, n FROM (SELECT c.relname, (xpath('/row/n/text()', query_to_xml(format('SELECT count(*) AS n FROM public.%I', c.relname), false, true, '')))[1]::text::bigint AS n FROM pg_class c JOIN pg_namespace s ON s.oid = c.relnamespace WHERE s.nspname = 'public' AND c.relkind = 'r') t ORDER BY 1" > "$WORK/counts.txt"
diff -u "$SRC/rowcounts.txt" "$WORK/counts.txt" || { echo "Row counts differ" >&2; exit 3; }
rls="$(psql "$TARGET" -XAtq -c "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity")"
log "restore OK: $(wc -l < "$WORK/counts.txt") tables, row counts match, $rls tables with row-level security"
