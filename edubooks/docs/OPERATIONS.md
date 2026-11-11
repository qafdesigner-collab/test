# Operations runbook

## Health checks
| Endpoint | Meaning |
|---|---|
| `GET /api/health` | The API process is running (use for liveness) |
| `GET /api/health/ready` | Database reachable, all migrations applied, file storage writable. Returns **503** when something is wrong. Use for readiness and uptime monitoring. |

Point an uptime monitor (UptimeRobot, Better Stack, etc.) at `https://<domain>/api/health/ready`.

## Logs
In production the API writes **one JSON line per event**: requests (method, path, status, duration, user id, request id), warnings and errors.
```bash
docker compose -f compose.prod.yml logs -f api
docker compose -f compose.prod.yml logs api | grep '"status":5'      # server errors
```
Every response carries an `X-Request-Id` header. When a user reports a problem, ask for the time and the page, then search the logs for that request id.
Passwords and session tokens are never logged, and file-link tokens are masked in request paths.

## Backups
`infra/backup/backup.sh` makes a complete backup:
- the database (a custom-format `pg_dump`),
- the uploaded files (when they are stored locally),
- row counts, the migration count, and a `SHA256SUMS` manifest.

With Docker Compose:
```bash
docker compose -f compose.prod.yml --profile tools run --rm backup
```
Run it every day from cron, for example at 02:15:
```
15 2 * * * cd /srv/edubooks-src/edubooks && docker compose -f compose.prod.yml --profile tools run --rm backup >> /var/log/edubooks-backup.log 2>&1
```
Options (environment variables): `BACKUP_KEEP_DAYS` (default 14), `BACKUP_GPG_RECIPIENT` (encrypt the archives), `BACKUP_UPLOAD` (an [rclone](https://rclone.org) destination for an **off-site copy**, which you should always have).
With `STORAGE_DRIVER=s3`, turn on **bucket versioning** and a lifecycle rule. Optionally set `RCLONE_REMOTE` so backups also copy the bucket.

For a managed database, also turn on the provider's point-in-time recovery.

## Restore
`infra/backup/restore.sh <backup-folder> <empty-database-url> [files-target-dir]`
- checks the SHA-256 manifest first,
- refuses to write into a database that already has tables,
- restores in a single transaction,
- then compares the row count of every table and the migration count with the backup.

Steps for a full restore:
1. Stop the app: `docker compose -f compose.prod.yml stop api web`.
2. Create an empty database with the roles and extensions (the SQL in `infra/prod/init-db.sh`). Use a new database name, or a new server.
3. Run `restore.sh` into it, with the files target set to the storage volume.
4. Point `DATABASE_URL` and `DATABASE_OWNER_URL` at the restored database. Start the app and check `/api/health/ready`.

### Restore drill — 11 Nov 2026
We backed up the development database (46 tables) and the uploaded files, then restored them into a fresh, empty database:
- Checksums verified. Restore took under 1 second. Every table's row count matched. Row-level security was active on all 46 tables. The restored files were byte-for-byte identical.
- We then started the API on the restored copy, as the restricted runtime role. A student signed in, opened their licensed book and downloaded its 26-page PDF. Their games list loaded too.
- Running `restore.sh` a second time was refused, because the target was no longer empty.
- **Lesson learned:** extensions belong to the database superuser, so the restore skips them. They must exist in the target before you restore.

**Repeat the drill every 3 months**, and after any major upgrade. CI runs a backup + restore on every change.

## Routine jobs (automatic)
The API runs these every hour (`EXPIRY_JOB_MINUTES`):
- expire licences at the end of their academic year,
- delete expired and revoked sessions.

## Common tasks
| Task | How |
|---|---|
| A user is locked out after 5 wrong passwords | The lock ends by itself (15 minutes, then longer). The school admin can also unlock it straight away with **Reset password**. |
| A school admin forgot their password | Publisher admin → Schools → school → reset the admin's password |
| Re-read a book's text for AI and search | Publisher → Book → part → **Re-index** |
| Check accessibility | `npm run a11y -w apps/web` (needs the app running with demo data) |
| Load test | `node apps/api/scripts/load-test.mjs https://staging-host 30 50`. Run it against **staging**, with `RATE_LIMIT_PER_MIN` raised. |

## Incident checklist
1. Check `/api/health/ready` and `docker compose ps`.
2. Read the API logs for errors (`"level":"error"`).
3. Database full or slow? Check disk space and `pg_stat_activity`.
4. Suspected data exposure? Suspend the affected accounts (sessions are revoked immediately). Check `audit_logs`, which is append-only. Then follow SECURITY.md.
