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

## AuthZ re-hunt (2026-11-23) — no new MEDIUM+ findings

Scan tree: `/tmp/edubooks-scan/edubooks/edubooks` (product HEAD `4b23abf`, includes 1.4.17 panorama/proctor). Focus: login-as, files/chunked uploads, reader PDF/hotspots/work, school-admin resets, licensing pools, exams/proctor live view, parent-child, progress override, publishing/reader license gates, broad `@Roles` (`SCHOOL`/`ANY`/`ALLIN`), student→teacher/admin data.

**Result: none** (no new validated MEDIUM/HIGH/CRITICAL authorization bug with a complete attack chain beyond already-known exclusions).

### Paths checked (controller → service → DB / RLS)

| Area | Primary files | Gate that held |
|---|---|---|
| Login-as / return | `auth/login-as.controller.ts`, `drizzle/0032_login_as.sql`, `auth.guard.ts` | `start_impersonation` = PUBLISHER_ADMIN + school user only; return unbound to impersonator is known #17 only with XSS |
| Files / signed URLs | `storage/files.controller.ts`, `storage/assets.service.ts`, `licensing.service.ts` `canAccessAsset` | `sameUser` + entitlement/`visibleTo` checker; staff bypass intentional |
| Chunked uploads | `storage/chunked.controller.ts` | PUBLISHER_STAFF + `meta.userId` bind + hex32 id |
| Reader PDF / hotspots / work | `reader/reader.controller.ts`, `reader/reader.service.ts` | `assertEdition` + `sees(visibleTo)`; workScope via `assertTeaches` / `teacherClassIds` |
| Apps / flipbook | `apps/apps.controller.ts`, `flipbook/flipbook.controller.ts` | `assertEdition` on reader paths; flip HMAC + sameUser on document navigations |
| School-admin users/passwords | `school-admin/school-admin.controller.ts`, `schools/school-users.service.ts` | `@Roles('SCHOOL_ADMIN')` + `users.schoolId`; peer admin reset = intentional school IT |
| Licensing pools / assign | `licensing/licensing.service.ts`, school-admin pool routes | RLS `school_id = app_school()` on pool SELECT; `lockablePool` / `assignment()` schoolId checks; seat FOR UPDATE SKIP LOCKED |
| Exams / LMS / proctor / live | `lms/lms.controller.ts`, `lms/lms.service.ts`, `exams/exams.controller.ts` | `assessment()` → `assertTeaches`; student `visibleToStudent`; proctor RLS own-row for students |
| Parents / child | `parents/parents.controller.ts` | `assertChild` / `parent_students`; AuthGuard parent allowlist |
| Progress override | `progress/progress.controller.ts` | `assertTeaches` + enrolment membership |
| Messaging / live lessons / whiteboard | `messaging/messaging.controller.ts`, `whiteboard/whiteboard.controller.ts` | `contacts()`/`myClassIds`/`canSee`/`assertTeaches` (unlike timetable #10) |
| Audio | `audio/audio.controller.ts` | `allowed()` owner / peer / teacherClassIds / parent |
| Calendar / groups / checklists / attendance | respective controllers | list scoped; writes `assertTeaches` or SCHOOL_ADMIN; timetable teacher IDOR already #10 |
| Auth core | `auth/auth.guard.ts`, `common/tenant.interceptor.ts`, `lms/access.service.ts` | session hash, `@Roles`, parent default-deny, TenantCtx RLS |

Do not re-open excluded items (timetable onlineUrl IDOR, games/exams answer keys, mustChangePassword, admin reset revoke, commerce/erasure/training/checklists/analytics, login-as+XSS #17, etc.).
