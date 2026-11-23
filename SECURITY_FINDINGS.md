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
