# Security

EduBooks holds children's data and paid publisher content. This page lists the protections and how each one is tested.

## Tenant isolation (most important)
- Every table that holds tenant data has PostgreSQL **Row-Level Security**. The app connects as `edubooks_app`, which is **not the table owner** and is `NOBYPASSRLS`. Every request runs in one transaction that carries the publisher, school, user and staff flag as session variables, and the policies filter on them.
  So a query that forgets a `WHERE school_id = …` still cannot return another school's rows.
- The few things that must cross tenants (login, session lookup, profile update, schema version) are narrow `SECURITY DEFINER` functions. Each has a fixed `search_path`, and only `edubooks_app` may execute them.
- *Tests:* RLS isolation between publishers and between schools, run directly against the database as the app role (`foundation`, `licensing`, `lms`, `ai`, `games` suites). The **tenant sweep** in `security.e2e.test.ts` signs in as a principal, a teacher and a student of one school, calls 21 list endpoints, and checks that none of the other school's ids appear anywhere in the responses.

## Accounts and sessions
- Passwords are hashed with **argon2id**. Unknown usernames take the same time as known ones (a dummy hash is computed).
- **Lockout:** after 5 wrong passwords the account is locked for 15 minutes. Each further lock doubles the time, up to 24 hours. While locked, even the correct password is refused. A school admin's **Reset password** unlocks it at once.
- **Rate limits:** a limit per session (or per IP when signed out), a higher per-IP ceiling, and 60 sign-ins per minute per IP. The IP limits are deliberately generous, because a whole school lab often shares one public IP. Password guessing is stopped by the lockout instead.
- Sessions are random 256-bit tokens. Only their SHA-256 hash is stored. The cookie is `HttpOnly`, `Secure` (production) and `SameSite=Lax`.
- Sessions end after **12 hours of inactivity** (`SESSION_IDLE_MINUTES`) and after 7 days at most. They are revoked on password change or reset, and when a user or school is suspended. Expired sessions are deleted every hour.
- Staff accounts created with a generated password must change it at first sign-in.
- *Tests:* `security.e2e.test.ts` (lockout and unlock, counter reset, idle expiry), `foundation.e2e.test.ts` (sessions, suspension, RBAC).

## Authorisation
- Every route requires sign-in unless it is explicitly marked public. Roles are checked per route. Licensing rules (a seat assigned, the academic year still valid) are checked on every access to a book, resource, AI request or publisher game.
- *Tests:* anonymous access to 14 protected routes returns 401; 15 cross-role attempts return 403; plus the per-module licensing and permission tests.

## Files
- Files are stored privately (local folder or private S3 bucket), named by their SHA-256 hash. Downloads use **signed links that expire after 5 minutes**.
- Uploads are checked by their real content (magic bytes), not by the file name. Size is limited. Uploads can be scanned by ClamAV (`REQUIRE_MALWARE_SCAN=1` rejects a file when the scanner is unavailable).
- Uploaded HTML and SVG are served with a sandboxing CSP, so they cannot run scripts on the app's origin.
- PDF text extraction and OCR run in **separate, time-limited processes**. A malicious PDF cannot crash or stall the API.

## HTTP hardening
- API: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, cross-origin isolation headers, `Cache-Control: no-store`, HSTS. JSON bodies are limited to 2 MB (413 when larger). The `X-Powered-By` header is removed. API docs (Swagger) are off in production.
- Web: a Content-Security-Policy (`default-src 'self'`, no plugins, no framing by other sites, forms only to the same origin), `Permissions-Policy` that turns off camera, microphone and location, and HSTS. Caddy provides TLS with automatic certificates.
- Errors never expose stack traces or SQL. Database constraint errors become friendly 4xx messages.

## AI
- Book text is wrapped as data (`<source>` tags), and the model is told to ignore instructions inside it. Answers are validated as JSON, and invented page citations are removed.
- **No student personal data is sent to the AI.** Prompts contain only book content and the teacher's own notes.
- With `AI_PROVIDER=openai-compatible` and a self-hosted model, book content stays on your own servers.
- AI output is always a **draft**. A teacher must approve it before it becomes a lesson plan or homework.

## Children's privacy
- Students need no email address or phone number: only a name, a username and a class.
- Audit logs are append-only: the app role has no `UPDATE` or `DELETE` permission on them. They record admin actions, not children's activity.
- Retention: learning records are kept for the school's use. **Right to erasure:** a school admin (Students → eraser button) or the publisher admin can erase a child's data. Learning records, messages and parent links are deleted. The account is anonymised and cannot sign in, the name is scrubbed from earlier audit entries, and book seats are freed. Typing the username is required to confirm. Covered by `erasure.e2e.test.ts`.

## Dependencies
- `npm audit --omit=dev` reports 0 vulnerabilities. CI fails on any *high* or *critical* finding. Next.js's bundled PostCSS is forced to a patched version with an npm `overrides` entry.

## Reporting a vulnerability
Email the publisher's technical contact (set this before launch). Please don't test against live schools.

## Before go-live checklist
- [ ] All secrets in `.env` are long, random and unique; `.env` is readable only by the deploy user.
- [ ] `DOMAIN` points at the server and `https://` works.
- [ ] ClamAV is running and `REQUIRE_MALWARE_SCAN=1` is set.
- [ ] Daily backups with an off-site copy; one restore drill done.
- [ ] Uptime monitor on `/api/health/ready`.
- [ ] The demo seed has **not** been run on the production database.
- [ ] The publisher admin has changed the one-time password.
