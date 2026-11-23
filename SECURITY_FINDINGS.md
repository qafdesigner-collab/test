# EduBooks security hunt — MEDIUM+ findings

Scan tree: `/tmp/edubooks-scan/edubooks` (API NestJS + RLS).  
Excluded from re-report: game answer keys/client scores; public company tax/IBAN; SCHOOLS company docs; mustChangePassword; admin reset session revoke; mailbox/publisher SMTP/update-download SSRF.

Empty areas after review (no complete MEDIUM+ chain): exams/LMS answer keys (teacher-gated + student reveal only after GRADED/RETURNED), parents/messaging IDOR, whiteboard class join, commerce license bypass, erasure cross-tenant, training, checklists, analytics, demo wipe of real schools, GitHub workflow secret exfil, AI cross-user prompt-injection exfil.

---

## 1. MEDIUM — Teachers can read any class timetable including live meeting URLs

**Location:** `apps/api/src/attendance/attendance.controller.ts`

**Title:** Cross-class timetable IDOR leaks `onlineUrl` meeting links to any teacher

**Description:**  
`GET /api/timetable/classes/:id` has no `@Roles` restriction beyond authentication. Authorization is `canSeeClass()`, which returns success for **every** `TEACHER` in the school without checking `class_teachers`. Slot rows include `onlineUrl` (Zoom/Meet/etc.). Elsewhere (attendance, LMS, exams, whiteboard) the same codebase uses `assertTeaches()`.

**Impact:** A teacher who does not teach class B can obtain class B’s recurring/online lesson links and join or share those meetings. Horizontal privilege escalation within the school.

**Attack path:**
1. Authenticate as Teacher A (assigned only to class A).
2. Enumerate class IDs via `GET /api/classes` (teachers may list all classes; `mine=true` is optional).
3. Call `GET /api/timetable/classes/{classBId}`.
4. Response includes `slots[].onlineUrl` for class B.

**Evidence:**

```167:179:apps/api/src/attendance/attendance.controller.ts
  private async canSeeClass(classId: string) {
    const [c] = await this.q.select({ id: classes.id, name: classes.name, section: classes.section }).from(classes).where(eq(classes.id, classId));
    if (!c) throw new NotFoundException('Class not found');
    if (this.access.is('SCHOOL_ADMIN') || this.access.is('TEACHER')) return c;
    // ...
  }

  async classTimetable(classId: string) {
    const c = await this.canSeeClass(classId);
    return { class: c, periods: await this.periods(), slots: await this.slotRows(sql`t.class_id = ${classId}`) };
  }
```

```231:231:apps/api/src/attendance/attendance.controller.ts
  @Get('timetable/classes/:id') classTt(@Param('id', Id()) id: string) { return this.svc.classTimetable(id); }
```

**Why auth/RLS doesn’t block it:** Session auth succeeds for Teacher A. RLS only scopes rows to the school tenant. There is no `class_teachers` check on this read path; `@Roles` is absent so any authenticated school role that passes `canSeeClass` is enough.

---

## 2. MEDIUM — AI custom/ollama/guard `baseUrl` enables server-side request forgery

**Location:** `apps/api/src/ai/ai-settings.controller.ts`

**Title:** Unrestricted AI provider `baseUrl` causes SSRF with response body reflection

**Description:**  
Publisher admin (and school admin when AI access is `OWN`) can set `preset` to `custom` or `ollama` with an arbitrary `http://`/`https://` `baseUrl`. Validation is only a scheme/host regex — no private-IP / link-local / metadata blocklist. The API then `fetch`es that URL for test, models, generate, and prompt-guard. Error paths return up to ~300 bytes of the upstream body; `models`/`test` return parsed JSON to the caller.

**Impact:** Pivot from a school-admin (OWN) or publisher-admin session into the host’s internal network (cloud metadata, internal admin UIs, Redis/HTTP services). Distinct from the already-reported mailbox/SMTP/update SSRFs.

**Attack path:**
1. Publisher sets school AI `access` to `OWN` (or attacker is `PUBLISHER_ADMIN`).
2. As school admin: `PUT /api/school/ai` with `{ "preset": "custom", "baseUrl": "http://169.254.169.254", "model": "x", "apiKey": "x" }` (or use `POST .../test` / `POST .../models` without saving).
3. Server issues HTTP to the attacker-chosen URL; response content is returned in API errors or model lists.
4. Same pattern on `PUT /api/ai/settings` and `PUT /api/ai/settings/guard` for publisher admin.

**Evidence:**

```55:61:apps/api/src/ai/ai-settings.controller.ts
  private resolve(d: AiSettingsDto, s?: any) {
    const p = AI_PRESETS[d.preset];
    const baseUrl = (d.preset === 'custom' || d.preset === 'ollama' ? d.baseUrl || p.baseUrl : p.baseUrl).trim().replace(/\/+$/, '');
    if (!/^https?:\/\/[^\s/]+/i.test(baseUrl)) throw new BadRequestException('Enter the address of the AI service (it starts with https://)');
    // ...
  }
```

```15:33:apps/api/src/ai/providers/openai-compatible.provider.ts
  private async post(path: string, body: any): Promise<any> {
    // ...
    res = await fetch(`${this.baseUrl}${path}`, { method: 'POST', /* ... */ });
    // ...
    if (!res.ok) {
      const text = (await res.text()).slice(0, 300);
      // ...
      throw new AiUnavailableError(/* ... includes text */);
    }
```

**Why auth/RLS doesn’t block it:** Role checks only require `PUBLISHER_ADMIN` or `SCHOOL_ADMIN` with `OWN`. RLS is irrelevant — the request leaves the DB and targets attacker-controlled network destinations from the API host.

---

## AuthZ re-hunt (2026-11-23, thorough) — NONE

Scan tree: `/tmp/edubooks-scan/edubooks` (HEAD `4b23abf`). All 44 `*controller.ts` files reviewed with service/guard/SQL follow-through.

**Result: NONE** — no new validated MEDIUM+ authorization/IDOR/privilege-escalation bug with a complete attack chain beyond already-known exclusions.

### Paths checked (why they held)

| Area | Primary files | Gate that held |
|---|---|---|
| `canSeeClass` vs `assertTeaches` | `attendance/attendance.controller.ts` | Only timetable uses `canSeeClass` (known #10). Attendance register/save/report, LMS, exams, whiteboard, progress, groups, checklists, live lessons all use `assertTeaches` / `myClassIds` / `canSee` |
| Broad `@Roles` (`SCHOOL`/`ANY`/`ALLIN`) | messaging, school-brand, calendar, covers, catalog GETs | Messaging scopes via `contacts`/`myClassIds`; calendar/catalog/covers are non-sensitive lists; parent default-deny allowlist still applies |
| Files / signed URLs / chunked | `storage/files.controller.ts`, `assets.service.ts`, `chunked.controller.ts` | `sameUser` + `canAccessAsset` (entitlement + `visibleTo`); chunked `meta.userId` bind + hex32 |
| Reader PDF / hotspots / work | `reader/reader.controller.ts`, `reader.service.ts` | `assertEdition` + `sees(visibleTo)`; `workScope` → `assertTeaches` / `teacherClassIds`; SCHOOL_ADMIN school-wide intentional |
| Apps / flipbook | `apps/apps.controller.ts`, `flipbook/*` | Reader paths `assertEdition`; flip HMAC + sameUser on document navigations; cookie-less subframe loads intentional |
| School-admin password / users | `school-admin.controller.ts`, `school-users.service.ts` | `@Roles('SCHOOL_ADMIN')` + `users.schoolId` match; CreateUsersDto TEACHER\|STUDENT only; peer admin reset = school IT |
| Licensing seat theft | `licensing.service.ts` | RLS `school_id = app_school()`; `lockablePool`/`assignment` schoolId checks; seats `FOR UPDATE SKIP LOCKED` |
| Proctor / live / exams | `lms.service.ts`, `exams.controller.ts` | `assessment()` → `assertTeaches`; student `visibleToStudent`; proctor RESTRICTIVE RLS own-row; images only via teacher watch routes |
| Parent → other children | `parents.controller.ts`, attendance/checklists parent routes | `assertChild` / `parent_students`; AuthGuard parent allowlist |
| Progress override | `progress.controller.ts` | `assertTeaches` + enrolment membership |
| Mass assignment role/schoolId | DTOs + `main.ts` ValidationPipe | `whitelist` + `forbidNonWhitelisted`; update DTOs lack privileged fields |
| Unauth / Public leaks | registration, company public, health, branding, ruffle, app-download, files token | Registration throttled/honeypot; company tax/IBAN known #5; file/app tokens capability URLs; below new MEDIUM |
| RLS / owner SQL | `db.service.ts`, `demo.controller.ts`, `erase_student_data`, `start_impersonation` | Request path uses tenant TX + `set_config`; owner URL only demo load (PUBLISHER_ADMIN) / migrate; SECURITY DEFINER funcs re-check publisher/school |
| Login-as | `login-as.controller.ts`, `0032_login_as.sql` | Start = PUBLISHER_ADMIN + school user; return unbound is known #17 only with XSS |

Do not re-open excluded items (timetable onlineUrl IDOR #10, login-as+XSS #17, games/exams answer keys, mustChangePassword, admin reset revoke, commerce/erasure if gated, etc.).

### Less-reviewed areas (second pass) — discarded

| Candidate | Why discarded |
|---|---|
| Voice/Piper `POST /voice/say`, page TTS | `assertEdition` + `visibleFor`; install URLs fixed; PARENT blocked by AuthGuard path allowlist (not `/api/voice`) |
| Audio clips `GET /messages/audio/:id` | `allowed()`: owner / SCHOOL_ADMIN / message peer / teacherClassIds enrolment / parent_students |
| Reader `page_work` list/image/comment | `workScope` → `assertTeaches` / teacherClassIds / SCHOOL_ADMIN school-wide |
| Groups CRUD + compare | `assertTeaches` on mutate; compare aggregates intentionally school-wide totals (no per-student for other classes) |
| Checklists parent/student | `parent_students` / self-only; teacher paths via `own()` → `assertTeaches` |
| Analytics `classes/:id` | `assertTeaches` at entry |
| Training learner quiz `correct[]` | Boolean feedback only (no answer key); audience filter on PUBLISHED courses — below AuthZ MEDIUM |
| Licensing school pools/assign | RLS `school_id = app_school()`; `lockablePool`/`assignment` schoolId checks |
| Parents import/link | SCHOOL_ADMIN + school-scoped; parent `assertChild` |
| Registration `asPublisher(staff:true)` | Creates SUSPENDED school; login blocks non-ACTIVE + PENDING/REJECTED registration status |
| Branding public GET | Logo/manifest/icons only; PATCH/POST logo PUBLISHER_ADMIN |
| Apps reader + `app-download/:token` | `assertEdition` / known HMAC capability URL (#11) |
| Flipbook reader + `flip/:token` | `assertEdition` on mint; `sameUser` on document dest; HMAC excluded |
| Chunked uploads | PUBLISHER_STAFF + `meta.userId` bind + `/^[a-f0-9]{32}$/` |
| Files `assets/:id/link` / `files/:token` | `canAccessAsset`; `sameUser` on stream; no `@Roles` but AuthGuard + parent allowlist |
| Live lessons / announcements | messaging `assertTeaches` / `myClassIds` |
| Retention / proctor cleanup | SECURITY DEFINER + `REVOKE … FROM PUBLIC`; grant only `edubooks_app`; cron via root TX |
| Consent / erasure | `erase_student_data` re-checks publisher/school; username confirm |
| Room-scan phone token | SHA-256 lookup; one-shot `done_at`; binds student/assessment from link; ManualTx + withContext(student) |
| Impersonation | Start PUBLISHER_ADMIN only; `auth/return` unbound = known #17 |
| Webhooks | `NOTIFY_WEBHOOK_URL` env-only (not user-controlled) |
| Nested `withContext` early-return | Skips only when ALS already set (same request TX); ManualTx paths call withContext after exit |

API fingerprint: `apps/api` package `1.4.19`; `auth.guard.ts` sha256 `662e2dd2…`.

---

## Crypto / secrets / infra re-hunt (2026-11-23, very thorough) — NONE

Scan trees: `/tmp/edubooks-scan/edubooks` (packaging/cpanel, packaging/public_html, infra/, compose.prod.yml, docker-compose.yml, apps/api crypto+auth), `/tmp/edubooks-scan/lms`, `/tmp/edubooks-scan/.github/workflows`.

**Result: NONE** — no new MEDIUM+ crypto/secrets/infrastructure finding with a complete attack chain beyond already-known exclusions (#11 demo/secret-box/HMAC, LMS seed passwords, cPanel demo admin password, #16 public_html updater RCE, LMS plaintext sessions, LMS login rate limit).

### Surfaces reviewed (held)

| Area | Primary files | Why it held |
|---|---|---|
| Session / cookie flags | `auth.controller.ts`, `login-as.controller.ts`, `config.ts`, cPanel `app.js` | `httpOnly` + `sameSite: 'lax'`; `COOKIE_SECURE` forced `1` in compose.prod and when installer `siteUrl` is https; session token `randomBytes(32)` hashed at rest (SHA-256) |
| Password hashing | `auth/password.ts`, LMS `db.js` | Argon2id OWASP params; LMS bcrypt cost 10; lockout via `auth_login_result` (≥5 failures) |
| secret-box / file HMAC / PDF AES-CTR / app-download | `secret-box.ts`, `assets.service.ts`, `apps.controller.ts`, `flipbook.service.ts` | Known #11 (FILE_URL_SECRET keying); uses `createCipheriv` AES-GCM/CTR (not legacy `createCipher`); `timingSafeEqual` on HMACs |
| Publisher SMTP at-rest password | `0035_mail.sql`, `mail.controller.ts` `saveSettings` | Plaintext column vs sealed mailbox/AI keys — no low-priv read path (`@Roles('PUBLISHER_ADMIN')`, API returns `hasPassword` only); needs DB/backup read already |
| Embedded Postgres | `packaging/cpanel/embedded-db.js` | `listen_addresses=''`, unix socket `0700`, `auth-host=reject`, scram-sha-256; passwords `randomBytes` |
| cPanel installer | `packaging/cpanel/app.js` | Install key `randomBytes(9)` + timingSafeEqual; `.env` mode `0o600`; `FILE_URL_SECRET` generated at install; no static serve of `install-key.txt` |
| public_html wizard | `packaging/public_html/index.php` | CSRF on POST; `autoinstall.json` chmod 0600 then deleted; emergency update path = known #16 |
| Docker / compose | `compose.prod.yml`, Dockerfiles, `docker-compose.yml` | Prod: no DB ports published; `USER node`; secrets required via `${…:?}`; local compose weak creds intentional for localhost |
| GitHub Actions | `.github/workflows/edubooks-ci.yml` | `permissions: contents: read`; no `pull_request_target`; no `secrets.*` exfil; CI dummy env only |
| Caddy / backups | `infra/prod/Caddyfile`, `infra/backup/*` | HSTS; GPG encrypt optional; umask 077; no privileged/cap_add/docker.sock |
| LMS tokens / PINs | `lms/src/auth.js`, `routes.js` bulk students | Session `randomBytes(32)` (plaintext store = already known); 4-digit student PINs intentional for kids — spraying needs known no-rate-limit |

### Discarded candidates (below MEDIUM / incomplete chain / excluded)

- Publisher SMTP password plaintext at rest (defense-in-depth only; no unauth/low-priv exfil)
- `mail_smtp_config()` SECURITY DEFINER returns password to app role (server-side mailer only; school API paths select `site_url` only)
- `open()` plaintext passthrough when value lacks `v1:` prefix (needs prior write of unsealed secret)
- AES-CTR PDF stream without AEAD (DRM convenience; key returned to licensed reader by design — #11 family)
- cPanel `LOGIN_RATE_LIMIT=600` / `RATE_LIMIT_PER_IP_PER_MIN=30000` (account lockout still applies)
- `docker-compose.yml` exposed Postgres/MinIO weak passwords (local-dev labeled)
- Default `DATABASE_URL`/`DATABASE_OWNER_URL` in `config.ts` when env unset (compose.prod/cPanel override; no prod boot with published DB)
- LMS bulk `randomInt(1000,10000)` student passwords (product choice; rate-limit gap already known)
- Host-header `site_url()` in public_html installer (known #12 class; no password-reset email chain)
- health/ready `e.message` (known #13)
- System update `POST .../download` https SSRF (known #3)
- No `createCipher`/`md5`-as-MAC/`Math.random` for auth tokens; Piper MD5 is vendor checksum only

---

## Perfume ERP + LMS hunt (2026-11-23) — NONE

Scan trees:
- Perfume ERP `/tmp/sec-scan/perfume/perfume-erp` @ `5d67d9c` (dark theme / branding / System panel / cPanel installer)
- LMS `/tmp/sec-scan/edubooks/lms` @ `6604b15` (package alongside EduBooks 1.4.20)

**Result: NONE** — no new validated MEDIUM+ with a complete attack chain beyond known exclusions (LMS seed passwords / plaintext sessions / login rate limit; HMAC/secret-box; EduBooks cPanel updater RCE).

### Prior “held” claims — re-verified

| Claim | Evidence |
|---|---|
| Perfume `allow()` on mutating APIs | Controllers call `ErpBaseController::allow()` / role checks on POST paths; cashier Invoice/Purchase blocked by second `allow()` in `DocumentController::createDocument` |
| Cashier cannot override price/discount | `DocumentController.php` ~61–69; tested in `ErpWorkflowsTest::test_pos_requires_shift_and_cashier_cannot_override_price` |
| Formulas manager+production | `ManufacturingController::formulas/saveFormula` `allow(['manager','production'])`; approve manager-only |
| Artwork tokens SHA-256 + 32-byte hex | `ArtworkPortalController` `random_bytes(32)` + `hash('sha256', $token)`; route regex `[a-f0-9]{64}` |
| Installer `abort_if(isInstalled)` + install-code file | `InstallController` + `Installation::isInstalled/code`; lock deletes code file |
| System update/backup owner+password reauth | `SystemController::ownerOnly` + `confirmPassword`; throttle `system` |
| Query builder not string-concat SQL | Bindings / query builder throughout; Backup mysqlDump quotes identifiers from `SHOW TABLES` only |
| LMS parameterized SQL | `db.prepare(sql).all/get/run(...p)`; dynamic columns only from fixed `pick()` allowlists |
| LMS `allowedBookIds` / `ownUser` / `myDemo` | `auth.js` + `routes.js` ownership helpers |
| LMS HTML CSP sandbox | `routes.js` materials file: `Content-Security-Policy: sandbox …` + `nosniff`; viewer iframe sandbox |

### Recent Perfume feature attack surfaces (dark theme, branding, System, installer)

| Surface | Files | Why not MEDIUM+ |
|---|---|---|
| Dark theme | `shell.js`, `app.blade.php`, `login.blade.php` | Theme from `localStorage` / fixed enum; print forces light; no server trust of theme |
| Brand colour / invoice footer | `CompanyController::settings`, `shell.js` `applyBranding`, print paths in `sales.js` | Hex regex `^#[0-9a-fA-F]{6}$`; footer/name `esc()` / Blade `{{ }}` |
| Logo upload / public `/media/logo` | `CompanyController::logo/logoImage` | `mimes`+`mimetypes` reject SVG; store under `branding/`; serve requires `str_starts_with(..., 'branding/')`; manager+owner only |
| Owner System migrate/backup | `SystemController`, `Backup` | Owner role + password reauth + rate limit; migrate/library only (no arbitrary artisan); backup path random under `storage/app` |
| cPanel web installer | `InstallController`, `Installation`, `first-run.php`, `build-cpanel.sh` | Closed after owner exists; install-code file `0o600`; `.env` quoting rejects `'`/newlines; package adds deny-all `.htaccess` on app root |
| Dashboard / table sort-filter | `WorkspaceController`, `tables.js` | Client-side filter only; finance fields gated by role |

### Discarded candidates

| Candidate | Why discarded |
|---|---|
| Install code only `random_bytes(4)` (32-bit) | Online brute impractical under `throttle:10,1` per IP during short pre-install window; needs exposed unfinished install |
| Installer MySQL `db_host` as SSRF | Requires valid install code (filesystem read of code file ≈ already privileged); MySQL wire protocol ≠ useful HTTP SSRF |
| `logo_path` `branding/../` traversal | `logo_path` only written by `store('branding')`; settings POST cannot set it; no write primitive |
| Warehouse can create Invoice | Intentional nav (`wholesale` includes warehouse); not cashier escalation |
| `GET /api/products` without `allow()` | Any active authenticated role needs catalogue/POS; disabled users blocked by `EnsureActiveUser` |
| Artwork path column in staff project JSON | Same-tenant staff; downloads still go through `projectAccess` |
| LMS SVG/HTML upload XSS | Response CSP `sandbox` (no `allow-same-origin`) + viewer iframe sandbox; HttpOnly session not readable from opaque origin |
| LMS `update(table, …)` string SQL | Table/column names from hardcoded callers / `pick()` allowlists only; values bound |
| LMS sales sees all books/materials | Role design for demos; not cross-tenant |
| LMS seed/`ADMIN_PASSWORD` defaults | Excluded known family |
| LMS plaintext session tokens / no login rate limit | Excluded known family |
| EduBooks Nest API SSRF/XSS/updater/login-as | Out of LMS tree scope; already stored #3/#9/#15/#16/#17 |

---

## LMS + packaging + workflows + pine + zen (2026-11-23 22:25 UTC) — NONE NEW

Scan trees:
- Node LMS `/tmp/sec-scan/edubooks/lms` (alongside EduBooks 1.4.20 @ `6604b15`)
- Zen `/tmp/sec-scan/zen` @ `93f2588` (API 0.1.0; LMS byte-identical; no `packaging/`)
- Workflows: `/tmp/sec-scan/edubooks/.github`, `/tmp/sec-scan/zen/.github` (no `/agent/repos/test/.github`)
- Packaging: `/tmp/sec-scan/edubooks/edubooks/packaging` (skip known public_html updater RCE #16 + demo password)
- Pine: `/agent/repos/test/*.pine`

**Result: NONE NEW** — no new MEDIUM+ complete attack chain beyond known exclusions.

### Surfaces reviewed (held)

| Area | Evidence | Why held |
|---|---|---|
| LMS auth / IDOR | `lms/src/auth.js`, `lms/src/routes.js` | `requireRole`; `canSeeBook` / `ownUser` / `ownClass` / `myClass` / `myStudent` / `myDemo`; student assignments scoped by `class_id` |
| LMS file serve | `routes.js:72-84` | `path.basename(m.filename)`; multer `randomBytes(16).hex` + allowlisted ext; CSP `sandbox` (no `allow-same-origin`) |
| LMS AI | `lms/src/ai.js` | Gemini/Groq/Ollama from env only — no user-controlled URL |
| LMS SQL / mass-assign | `routes.js` `pick`/`update` | Column names from hardcoded allowlists; values bound via `db.prepare` |
| Zen | LMS identical; no packaging; API older 0.1.0 | Not a separate deployable product branch; prefer 1.4.20; no zen-unique MEDIUM+ chain |
| GitHub Actions | `edubooks-ci.yml` | `permissions: contents: read`; `pull_request` only; no `secrets.*` exfil; CI dummy passwords |
| cPanel updater unzip | `packaging/cpanel/updater.js:86-113` | Rejects `..`, absolute paths, symlinks; size/entry caps |
| System update download | `system.controller.ts:125-142` | Known #3 (https SSRF) |
| public_html emergency update | `public_html/index.php:167-192` | Known #16 — skipped per prompt |
| Pine scripts | `*.pine` | Only `alert(...)`; no webhook URLs, tokens, or credentials |

### Discarded this pass

| Candidate | Why discarded |
|---|---|
| LMS seed / plaintext sessions / no login rate limit / sales all books / CSP-sandboxed HTML XSS | Explicit exclusions |
| LMS client-reported game stars | Same family as excluded game client scores |
| `GET /api/me` leaks AI provider name when logged out | Info only — below MEDIUM |
| `embedded-db` restore `tar -xzf` weak path check | Needs filesystem write into `restore/` outside webroot — incomplete remote chain |
| Update `upload` without password reauth | Staging only; `apply`/`rollback` require password; no remote swap of staging without FS write |
| Flipbook `Access-Control-Allow-Origin: *` | Cookie-less capability URLs; known HMAC/#11 family |
| Workflow cpanel zip artifact | Built package, not secrets |
| TradingView `alert()` | Not a vuln per prompt |
