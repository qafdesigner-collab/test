import { BadRequestException, Body, Controller, ForbiddenException, Get, HttpCode, Injectable, Module, NotFoundException, Param, ParseUUIDPipe, Post, Put, Query, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsDateString, IsEmail, IsIn, IsInt, IsOptional, IsString, Length, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { sql } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { Roles } from '../common/decorators';
import { AccessService } from '../lms/access.service';
import { LmsModule } from '../lms/lms.module';
import { NotificationsService } from '../notifications/notifications.service';
import { MailerService } from '../notifications/mailer.service';
import { timezone } from '../common/region';

const Id = () => new ParseUUIDPipe();
const arr = (ids: string[]) => `{${ids.join(',')}}`;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ALL = ['PUBLISHER_ADMIN', 'PUBLISHER_EDITOR', 'PUBLISHER_SALES', 'SCHOOL_ADMIN', 'TEACHER', 'STUDENT', 'PARENT'];
const SENDERS = ['PUBLISHER_ADMIN', 'PUBLISHER_EDITOR', 'PUBLISHER_SALES', 'SCHOOL_ADMIN', 'TEACHER'];

class MeetingDto {
  @IsDateString() startsAt!: string;
  @Type(() => Number) @IsInt() @Min(5) @Max(600) durationMin!: number;
  @IsOptional() @IsString() @MaxLength(200) location?: string;
  @IsOptional() @IsString() @MaxLength(500) @Matches(/^https:\/\//, { message: 'The online meeting link must start with https://' }) url?: string;
}
class ComposeDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(200) @IsString({ each: true }) @MaxLength(120, { each: true }) to!: string[];
  @IsString() @Length(1, 200) subject!: string;
  @IsOptional() @IsString() @MaxLength(20000) body?: string;
  @IsOptional() @ValidateNested() @Type(() => MeetingDto) meeting?: MeetingDto;
}
class ReplyDto { @IsString() @Length(1, 20000) body!: string; }
class RsvpDto { @IsIn(['YES', 'NO', 'MAYBE']) answer!: 'YES' | 'NO' | 'MAYBE'; }
class FolderQuery { @IsOptional() @IsIn(['inbox', 'sent', 'archived']) folder?: string; @IsOptional() @IsString() @MaxLength(100) q?: string; }
class PeopleQuery { @IsOptional() @IsString() @MaxLength(100) q?: string; }
class SettingsDto {
  @IsBoolean() enabled!: boolean;
  @IsString() @MaxLength(200) host!: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(65535) port!: number;
  @IsBoolean() secure!: boolean;
  @IsString() @MaxLength(200) username!: string;
  /** Leave empty to keep the saved password. */
  @IsOptional() @IsString() @MaxLength(300) password?: string;
  @IsString() @MaxLength(120) fromName!: string;
  @IsOptional() @IsString() @MaxLength(200) fromEmail?: string;
  @IsBoolean() notifyStudents!: boolean;
}
class TestDto { @IsEmail() to!: string; }

type Group = { key: string; label: string; count: number };

@Injectable()
export class MailService {
  constructor(private readonly db: DbService, private readonly access: AccessService, private readonly notifications: NotificationsService, private readonly mailer: MailerService) {}
  private get ctx() { return this.db.ctx; }
  private async rows(q: ReturnType<typeof sql>) { return (await this.db.q.execute(q)).rows as any[]; }
  private is(...r: string[]) { return r.some((x) => this.ctx.roles.includes(x)); }
  private get staff() { return this.ctx.staff; }

  // ------------------------------------------------------------------ who can be written to
  /** Groups the signed-in user may write to, with how many people each reaches. */
  async groups(): Promise<Group[]> {
    const out: Group[] = []; const me = this.ctx.userId;
    const add = async (key: string, label: string, q: ReturnType<typeof sql>) => { const ids = await this.groupIds(key, q); out.push({ key, label, count: ids.length }); };
    if (this.staff) {
      await add('staff', 'Publisher team', sql`SELECT DISTINCT u.id FROM users u JOIN user_roles r ON r.user_id = u.id AND r.role::text LIKE 'PUBLISHER_%' WHERE u.school_id IS NULL AND u.status = 'ACTIVE' AND u.id <> ${me}`);
      await add('school-admins', 'All school admins', sql`SELECT DISTINCT u.id FROM users u JOIN user_roles r ON r.user_id = u.id AND r.role = 'SCHOOL_ADMIN' JOIN schools s ON s.id = u.school_id AND s.status = 'ACTIVE' WHERE u.status = 'ACTIVE'`);
      await add('all-teachers', 'All teachers (every school)', sql`SELECT DISTINCT u.id FROM users u JOIN user_roles r ON r.user_id = u.id AND r.role = 'TEACHER' JOIN schools s ON s.id = u.school_id AND s.status = 'ACTIVE' WHERE u.status = 'ACTIVE'`);
      for (const s of await this.rows(sql`SELECT id, name FROM schools WHERE status = 'ACTIVE' ORDER BY name`)) {
        await add(`school:${s.id}:admins`, `${s.name} — school admins`, this.schoolRole(s.id, 'SCHOOL_ADMIN'));
        await add(`school:${s.id}:teachers`, `${s.name} — teachers`, this.schoolRole(s.id, 'TEACHER'));
      }
      return out;
    }
    const school = this.ctx.schoolId!;
    if (this.is('SCHOOL_ADMIN')) {
      await add('school-staff', 'All staff (admins and teachers)', sql`SELECT DISTINCT u.id FROM users u JOIN user_roles r ON r.user_id = u.id AND r.role IN ('SCHOOL_ADMIN','TEACHER') WHERE u.school_id = ${school} AND u.status = 'ACTIVE' AND u.id <> ${me}`);
      await add('teachers', 'All teachers', this.schoolRole(school, 'TEACHER'));
      await add('students', 'All pupils', this.schoolRole(school, 'STUDENT'));
      await add('parents', 'All parents', this.schoolRole(school, 'PARENT'));
      await add('publisher', 'Our publisher (super admin)', sql`SELECT id FROM publisher_mail_contacts()`);
    } else if (this.is('TEACHER')) {
      await add('office', 'School office (admins)', this.schoolRole(school, 'SCHOOL_ADMIN'));
      await add('teachers', 'Teachers at my school', sql`SELECT DISTINCT u.id FROM users u JOIN user_roles r ON r.user_id = u.id AND r.role = 'TEACHER' WHERE u.school_id = ${school} AND u.status = 'ACTIVE' AND u.id <> ${me}`);
    } else return out;
    const classes = this.is('SCHOOL_ADMIN')
      ? await this.rows(sql`SELECT c.id, c.name, c.section FROM classes c JOIN academic_years y ON y.id = c.academic_year_id WHERE NOT c.archived AND current_date BETWEEN y.starts_on AND y.ends_on ORDER BY c.name, c.section`)
      : await this.rows(sql`SELECT c.id, c.name, c.section FROM classes c WHERE c.id = ANY(${arr((await this.access.teacherClassIds()).concat('00000000-0000-0000-0000-000000000000'))}::uuid[]) AND NOT c.archived ORDER BY c.name, c.section`);
    for (const c of classes) {
      const n = `${c.name}${c.section ? ` ${c.section}` : ''}`;
      await add(`class:${c.id}:students`, `${n} — pupils`, this.classPupils(c.id));
      await add(`class:${c.id}:parents`, `${n} — parents`, sql`SELECT DISTINCT ps.parent_id AS id FROM parent_students ps JOIN enrolments e ON e.student_id = ps.student_id AND e.class_id = ${c.id} JOIN users u ON u.id = ps.parent_id AND u.status = 'ACTIVE'`);
    }
    return out;
  }
  private schoolRole(school: string, role: string) {
    return sql`SELECT DISTINCT u.id FROM users u JOIN user_roles r ON r.user_id = u.id AND r.role = ${role} WHERE u.school_id = ${school} AND u.status = 'ACTIVE'`;
  }
  private classPupils(classId: string) {
    return sql`SELECT e.student_id AS id FROM enrolments e JOIN users u ON u.id = e.student_id AND u.status = 'ACTIVE' WHERE e.class_id = ${classId}`;
  }
  private async groupIds(_key: string, q: ReturnType<typeof sql>) { return (await this.rows(q)).map((r) => r.id as string); }

  /** People the user may write to individually (search by name, login ID or email). */
  async people(q?: string) {
    const me = this.ctx.userId; const like = q?.trim() ? `%${q.trim()}%` : null;
    const match = like ? sql`AND (u.display_name ILIKE ${like} OR u.username::text ILIKE ${like} OR coalesce(u.email::text, '') ILIKE ${like})` : sql``;
    let rows: any[] = [];
    if (this.staff) {
      rows = await this.rows(sql`SELECT DISTINCT u.id, u.display_name AS name, s.name AS school, string_agg(DISTINCT r.role::text, ',') AS roles
        FROM users u JOIN user_roles r ON r.user_id = u.id LEFT JOIN schools s ON s.id = u.school_id
        WHERE u.status = 'ACTIVE' AND u.id <> ${me} AND (r.role::text LIKE 'PUBLISHER_%' OR r.role IN ('SCHOOL_ADMIN','TEACHER')) ${match}
        GROUP BY u.id, s.name ORDER BY u.display_name LIMIT 40`);
    } else if (this.is('SCHOOL_ADMIN')) {
      rows = await this.rows(sql`SELECT u.id, u.display_name AS name, NULL AS school, string_agg(DISTINCT r.role::text, ',') AS roles
        FROM users u JOIN user_roles r ON r.user_id = u.id WHERE u.school_id = ${this.ctx.schoolId} AND u.status = 'ACTIVE' AND u.id <> ${me} ${match}
        GROUP BY u.id ORDER BY u.display_name LIMIT 40`);
    } else if (this.is('TEACHER')) {
      const cls = (await this.access.teacherClassIds()).concat('00000000-0000-0000-0000-000000000000');
      rows = await this.rows(sql`SELECT u.id, u.display_name AS name, NULL AS school, string_agg(DISTINCT r.role::text, ',') AS roles
        FROM users u JOIN user_roles r ON r.user_id = u.id
        WHERE u.school_id = ${this.ctx.schoolId} AND u.status = 'ACTIVE' AND u.id <> ${me} ${match}
          AND (r.role IN ('SCHOOL_ADMIN','TEACHER')
            OR (r.role = 'STUDENT' AND EXISTS (SELECT 1 FROM enrolments e WHERE e.student_id = u.id AND e.class_id = ANY(${arr(cls)}::uuid[])))
            OR (r.role = 'PARENT' AND EXISTS (SELECT 1 FROM parent_students ps JOIN enrolments e ON e.student_id = ps.student_id WHERE ps.parent_id = u.id AND e.class_id = ANY(${arr(cls)}::uuid[]))))
        GROUP BY u.id ORDER BY u.display_name LIMIT 40`);
    }
    const label: Record<string, string> = { PUBLISHER_ADMIN: 'Super admin', PUBLISHER_EDITOR: 'Publisher editor', PUBLISHER_SALES: 'Sales', SCHOOL_ADMIN: 'School admin', TEACHER: 'Teacher', STUDENT: 'Pupil', PARENT: 'Parent' };
    return rows.map((r) => ({ id: r.id, name: r.name, school: r.school, role: String(r.roles ?? '').split(',').map((x) => label[x] ?? x).join(', ') }));
  }

  /** Turns the "to" list (group keys and u:<id>) into user ids, checking each one is allowed. */
  private async resolve(to: string[]) {
    const groups = await this.groups(); const ids = new Set<string>(); const labels: string[] = [];
    for (const key of [...new Set(to)]) {
      if (key.startsWith('u:')) {
        const id = key.slice(2); if (!UUID.test(id)) throw new BadRequestException('Unknown recipient');
        const ok = (await this.people()).some((p) => p.id === id) || (await this.peopleById(id));
        if (!ok) throw new ForbiddenException('You cannot write to one of the chosen people');
        ids.add(id); labels.push((await this.rows(sql`SELECT display_name FROM users WHERE id = ${id}`))[0]?.display_name ?? 'someone');
        continue;
      }
      const g = groups.find((x) => x.key === key);
      if (!g) throw new ForbiddenException('You cannot write to one of the chosen groups');
      for (const id of await this.groupIdsFor(key)) ids.add(id);
      labels.push(g.label);
    }
    ids.delete(this.ctx.userId);
    if (ids.size > 5000) throw new BadRequestException('Too many recipients at once (max 5000)');
    return { ids: [...ids], label: labels.join(', ').slice(0, 300) };
  }
  /** People search is capped at 40 rows; this checks one id directly with the same rules. */
  private async peopleById(id: string) {
    const me = this.ctx.userId;
    if (this.staff) return !!(await this.rows(sql`SELECT 1 FROM users u JOIN user_roles r ON r.user_id = u.id WHERE u.id = ${id} AND u.id <> ${me} AND u.status = 'ACTIVE' AND (r.role::text LIKE 'PUBLISHER_%' OR r.role IN ('SCHOOL_ADMIN','TEACHER'))`)).length;
    if (this.is('SCHOOL_ADMIN')) return !!(await this.rows(sql`SELECT 1 FROM users WHERE id = ${id} AND school_id = ${this.ctx.schoolId} AND status = 'ACTIVE'`)).length;
    return false;
  }
  private async groupIdsFor(key: string): Promise<string[]> {
    const school = this.ctx.schoolId; const me = this.ctx.userId;
    const m = /^(school|class):([0-9a-f-]{36}):(admins|teachers|students|parents)$/.exec(key);
    let q: ReturnType<typeof sql> | null = null;
    if (key === 'staff') q = sql`SELECT DISTINCT u.id FROM users u JOIN user_roles r ON r.user_id = u.id AND r.role::text LIKE 'PUBLISHER_%' WHERE u.school_id IS NULL AND u.status = 'ACTIVE' AND u.id <> ${me}`;
    else if (key === 'school-admins') q = sql`SELECT DISTINCT u.id FROM users u JOIN user_roles r ON r.user_id = u.id AND r.role = 'SCHOOL_ADMIN' JOIN schools s ON s.id = u.school_id AND s.status = 'ACTIVE' WHERE u.status = 'ACTIVE'`;
    else if (key === 'all-teachers') q = sql`SELECT DISTINCT u.id FROM users u JOIN user_roles r ON r.user_id = u.id AND r.role = 'TEACHER' JOIN schools s ON s.id = u.school_id AND s.status = 'ACTIVE' WHERE u.status = 'ACTIVE'`;
    else if (key === 'school-staff') q = sql`SELECT DISTINCT u.id FROM users u JOIN user_roles r ON r.user_id = u.id AND r.role IN ('SCHOOL_ADMIN','TEACHER') WHERE u.school_id = ${school} AND u.status = 'ACTIVE'`;
    else if (key === 'teachers') q = this.schoolRole(school!, 'TEACHER');
    else if (key === 'students') q = this.schoolRole(school!, 'STUDENT');
    else if (key === 'parents') q = this.schoolRole(school!, 'PARENT');
    else if (key === 'office') q = this.schoolRole(school!, 'SCHOOL_ADMIN');
    else if (key === 'publisher') q = sql`SELECT id FROM publisher_mail_contacts()`;
    else if (m && m[1] === 'school') q = this.schoolRole(m[2], m[3] === 'admins' ? 'SCHOOL_ADMIN' : 'TEACHER');
    else if (m && m[3] === 'students') q = this.classPupils(m[2]);
    else if (m && m[3] === 'parents') q = sql`SELECT DISTINCT ps.parent_id AS id FROM parent_students ps JOIN enrolments e ON e.student_id = ps.student_id AND e.class_id = ${m[2]} JOIN users u ON u.id = ps.parent_id AND u.status = 'ACTIVE'`;
    return q ? (await this.rows(q)).map((r) => r.id as string) : [];
  }

  // ------------------------------------------------------------------ sending
  async compose(d: ComposeDto) {
    if (!this.is(...SENDERS)) throw new ForbiddenException('Only staff can start a new mail; you can reply to mail you received.');
    const { ids, label } = await this.resolve(d.to);
    if (!ids.length) throw new BadRequestException('Nobody to send to: the chosen groups are empty.');
    const meeting = d.meeting ? { startsAt: new Date(d.meeting.startsAt).toISOString(), durationMin: d.meeting.durationMin, location: d.meeting.location?.trim() || '', url: d.meeting.url?.trim() || '' } : null;
    return this.store({ subject: d.subject.trim(), body: d.body ?? '', meeting, ids, label });
  }

  private async store(m: { subject: string; body: string; meeting: any; ids: string[]; label: string; replyTo?: string }) {
    const me = (await this.rows(sql`SELECT display_name, email::text AS email FROM users WHERE id = ${this.ctx.userId}`))[0];
    const [row] = await this.rows(sql`INSERT INTO mail_messages (publisher_id, school_id, sender_id, sender_name, subject, body, kind, meeting, to_label, reply_to)
      VALUES (${this.ctx.publisherId}, ${this.ctx.schoolId ?? null}, ${this.ctx.userId}, ${me.display_name}, ${m.subject}, ${m.body}, ${m.meeting ? 'MEETING' : 'MAIL'}, ${m.meeting ? JSON.stringify(m.meeting) : null}::jsonb, ${m.label}, ${m.replyTo ?? null}) RETURNING id`);
    for (let i = 0; i < m.ids.length; i += 500) {
      const chunk = m.ids.slice(i, i + 500);
      await this.db.q.execute(sql`INSERT INTO mail_recipients (message_id, user_id, publisher_id, school_id)
        SELECT ${row.id}, x, ${this.ctx.publisherId}, ${this.ctx.schoolId ?? null} FROM unnest(${arr(chunk)}::uuid[]) x`);
    }
    // In-app notification (bell) for everyone, and an email copy for those with an email address.
    const title = m.meeting ? `📅 Meeting: ${m.subject}` : `✉️ ${m.subject}`;
    const when = m.meeting ? new Date(m.meeting.startsAt).toLocaleString('en-GB', { timeZone: timezone(), dateStyle: 'medium', timeStyle: 'short' }) : '';
    const snippet = m.meeting ? `${when}${m.meeting.location ? ` · ${m.meeting.location}` : ''} — from ${me.display_name}` : `From ${me.display_name}: ${m.body.slice(0, 140)}`;
    await this.notifications.notify(m.ids.map((id) => ({ id })), { kind: 'MAIL', title: title.slice(0, 200), body: snippet, link: `/mail?m=${row.id}` }, { email: false, schoolId: this.ctx.schoolId ?? null });
    const c = await this.mailer.config();
    if (c) {
      const emails = (await this.rows(sql`SELECT DISTINCT email::text AS email FROM users WHERE id = ANY(${arr(m.ids)}::uuid[]) AND email IS NOT NULL AND status = 'ACTIVE'`)).map((r) => r.email);
      const text = `${m.meeting ? `${when}${m.meeting.location ? `\nWhere: ${m.meeting.location}` : ''}${m.meeting.url ? `\nJoin: ${m.meeting.url}` : ''}\n\n` : ''}${m.body}\n\n— ${me.display_name}`;
      const ids = m.ids;
      this.mailer.later(c, { to: emails, subject: title, text, html: this.mailer.html(c, title, text, `/mail?m=${row.id}`), replyTo: me.email ?? undefined, ics: m.meeting ? ics(row.id, m.subject, m.body, m.meeting, me.display_name, c.from_email) : undefined },
        () => this.db.withContext({ ...this.ctx }, async () => { await this.db.q.execute(sql`UPDATE mail_recipients SET emailed_at = now() WHERE message_id = ${row.id} AND user_id = ANY(${arr(ids)}::uuid[])`); }));
    }
    return { id: row.id, recipients: m.ids.length };
  }

  async reply(id: string, d: ReplyDto) {
    const msg = await this.message(id);
    const mine = msg.sender_id === this.ctx.userId;
    if (!mine && !msg.recipient) throw new ForbiddenException('Not your mail');
    if (mine) throw new BadRequestException('Use “New mail” to write to the recipients again.');
    if (!msg.sender_id) throw new BadRequestException('The sender no longer exists');
    return this.store({ subject: msg.subject.startsWith('Re: ') ? msg.subject : `Re: ${msg.subject}`.slice(0, 200), body: d.body, meeting: null, ids: [msg.sender_id], label: msg.sender_name, replyTo: id });
  }

  // ------------------------------------------------------------------ reading
  async list(f: FolderQuery) {
    const me = this.ctx.userId; const like = f.q?.trim() ? `%${f.q.trim()}%` : null;
    const search = like ? sql`AND (m.subject ILIKE ${like} OR m.body ILIKE ${like} OR m.sender_name ILIKE ${like})` : sql``;
    if (f.folder === 'sent') {
      return this.rows(sql`SELECT m.id, m.subject, left(m.body, 160) AS snippet, m.kind, m.meeting, m.to_label AS "toLabel", m.created_at AS "createdAt",
          (SELECT count(*)::int FROM mail_recipients r WHERE r.message_id = m.id) AS recipients,
          (SELECT count(*)::int FROM mail_recipients r WHERE r.message_id = m.id AND r.read_at IS NOT NULL) AS "readBy"
        FROM mail_messages m WHERE m.sender_id = ${me} ${search} ORDER BY m.created_at DESC LIMIT 200`);
    }
    return this.rows(sql`SELECT m.id, m.subject, left(m.body, 160) AS snippet, m.kind, m.meeting, m.sender_name AS "senderName", m.created_at AS "createdAt",
        r.read_at IS NOT NULL AS read, r.rsvp
      FROM mail_recipients r JOIN mail_messages m ON m.id = r.message_id
      WHERE r.user_id = ${me} AND r.archived = ${f.folder === 'archived'} ${search} ORDER BY m.created_at DESC LIMIT 200`);
  }

  async unread() {
    const [r] = await this.rows(sql`SELECT count(*)::int AS n FROM mail_recipients WHERE user_id = ${this.ctx.userId} AND read_at IS NULL AND NOT archived`);
    return { unread: r.n };
  }

  private async message(id: string) {
    const [m] = await this.rows(sql`SELECT m.*, (SELECT row_to_json(r) FROM mail_recipients r WHERE r.message_id = m.id AND r.user_id = ${this.ctx.userId}) AS recipient FROM mail_messages m WHERE m.id = ${id}`);
    if (!m) throw new NotFoundException('Mail not found');
    if (m.sender_id !== this.ctx.userId && !m.recipient) throw new ForbiddenException('Not your mail');
    return m;
  }

  async get(id: string) {
    const m = await this.message(id); const mine = m.sender_id === this.ctx.userId;
    if (m.recipient && !m.recipient.read_at) await this.db.q.execute(sql`UPDATE mail_recipients SET read_at = now() WHERE message_id = ${id} AND user_id = ${this.ctx.userId}`);
    let recipients: any = null;
    if (mine) {
      const list = await this.rows(sql`SELECT r.user_id AS id, coalesce(u.display_name, 'Publisher') AS name, r.read_at AS "readAt", r.rsvp, r.emailed_at AS "emailedAt"
        FROM mail_recipients r LEFT JOIN users u ON u.id = r.user_id WHERE r.message_id = ${id} ORDER BY r.rsvp NULLS LAST, u.display_name LIMIT 1000`);
      const count = (k: string) => list.filter((x) => x.rsvp === k).length;
      recipients = { total: list.length, read: list.filter((x) => x.readAt).length, emailed: list.filter((x) => x.emailedAt).length, rsvp: { YES: count('YES'), NO: count('NO'), MAYBE: count('MAYBE') }, list };
    }
    const thread = await this.rows(sql`SELECT id, subject, sender_name AS "senderName", body, created_at AS "createdAt" FROM mail_messages
      WHERE (id = ${m.reply_to ?? '00000000-0000-0000-0000-000000000000'} OR reply_to = ${id}) AND (sender_id = ${this.ctx.userId} OR EXISTS (SELECT 1 FROM mail_recipients r WHERE r.message_id = mail_messages.id AND r.user_id = ${this.ctx.userId}))
      ORDER BY created_at`);
    return { id: m.id, subject: m.subject, body: m.body, kind: m.kind, meeting: m.meeting, senderName: m.sender_name, mine, toLabel: m.to_label, createdAt: m.created_at,
      rsvp: m.recipient?.rsvp ?? null, archived: m.recipient?.archived ?? false, canReply: !mine && !!m.sender_id, recipients, related: thread };
  }

  async rsvp(id: string, d: RsvpDto) {
    const m = await this.message(id);
    if (m.kind !== 'MEETING' || !m.recipient) throw new BadRequestException('This is not a meeting invitation for you');
    await this.db.q.execute(sql`UPDATE mail_recipients SET rsvp = ${d.answer}, rsvp_at = now(), read_at = coalesce(read_at, now()) WHERE message_id = ${id} AND user_id = ${this.ctx.userId}`);
    return { ok: true, rsvp: d.answer };
  }

  async archive(id: string, archived: boolean) {
    const m = await this.message(id);
    if (!m.recipient) throw new BadRequestException('Only received mail can be archived');
    await this.db.q.execute(sql`UPDATE mail_recipients SET archived = ${archived} WHERE message_id = ${id} AND user_id = ${this.ctx.userId}`);
    return { ok: true };
  }

  // ------------------------------------------------------------------ outgoing email account (super admin)
  async settings(siteUrl?: string) {
    const [s] = await this.rows(sql`SELECT * FROM publisher_mail_settings WHERE publisher_id = ${this.ctx.publisherId}`);
    return { enabled: s?.enabled ?? false, host: s?.host ?? '', port: s?.port ?? 465, secure: s?.secure ?? true, username: s?.username ?? '', hasPassword: !!s?.password,
      fromName: s?.from_name ?? '', fromEmail: s?.from_email ?? '', notifyStudents: s?.notify_students ?? true, siteUrl: s?.site_url || siteUrl || '' };
  }
  async saveSettings(d: SettingsDto, siteUrl: string) {
    if (d.enabled && (!d.host.trim() || !(d.fromEmail || d.username).includes('@'))) throw new BadRequestException('Enter the mail server and the sending address');
    const from = (d.fromEmail || d.username).trim();
    await this.db.q.execute(sql`INSERT INTO publisher_mail_settings (publisher_id, enabled, host, port, secure, username, password, from_name, from_email, notify_students, site_url, updated_at)
      VALUES (${this.ctx.publisherId}, ${d.enabled}, ${d.host.trim()}, ${d.port}, ${d.secure}, ${d.username.trim()}, ${d.password ?? ''}, ${d.fromName.trim()}, ${from}, ${d.notifyStudents}, ${siteUrl}, now())
      ON CONFLICT (publisher_id) DO UPDATE SET enabled = excluded.enabled, host = excluded.host, port = excluded.port, secure = excluded.secure, username = excluded.username,
        password = CASE WHEN ${d.password ?? ''} = '' THEN publisher_mail_settings.password ELSE excluded.password END,
        from_name = excluded.from_name, from_email = excluded.from_email, notify_students = excluded.notify_students, site_url = excluded.site_url, updated_at = now()`);
    return this.settings();
  }
  async test(to: string) {
    const [s] = await this.rows(sql`SELECT * FROM mail_smtp_config()`);
    if (!s?.host) throw new BadRequestException('Save the mail server settings first');
    try {
      await this.mailer.sendNow({ ...s, enabled: true }, { to: [to], subject: 'Test email from Knowledge Gate', text: 'If you can read this, email copies are working. 🎉', html: this.mailer.html(s, 'Email is working 🎉', 'If you can read this, copies of mail, meeting invites and notifications will reach your users’ email.', '/') });
    } catch (e: any) { throw new BadRequestException(`The mail server said: ${String(e?.message ?? e).slice(0, 300)}`); }
    return { ok: true };
  }
}

/** Calendar invitation so the meeting lands in Outlook / Gmail / phone calendars. */
function ics(id: string, subject: string, body: string, m: { startsAt: string; durationMin: number; location?: string; url?: string }, organiser: string, fromEmail: string) {
  const f = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const start = new Date(m.startsAt); const end = new Date(start.getTime() + m.durationMin * 60_000);
  const t = (s: string) => s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, (c) => `\\${c}`);
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Knowledge Gate//Mail//EN', 'METHOD:REQUEST', 'BEGIN:VEVENT', `UID:${id}@knowledge-gate`, `DTSTAMP:${f(new Date())}`,
    `DTSTART:${f(start)}`, `DTEND:${f(end)}`, `SUMMARY:${t(subject)}`, `DESCRIPTION:${t([body, m.url ? `Join: ${m.url}` : ''].filter(Boolean).join('\n'))}`,
    m.location || m.url ? `LOCATION:${t(m.location || m.url || '')}` : '', `ORGANIZER;CN=${t(organiser)}:mailto:${fromEmail}`, 'END:VEVENT', 'END:VCALENDAR'].filter(Boolean).join('\r\n');
}

@ApiTags('mail')
@Controller()
export class MailController {
  constructor(private readonly svc: MailService) {}
  @Roles(...ALL) @Get('mail') list(@Query() q: FolderQuery) { return this.svc.list(q); }
  @Roles(...ALL) @Get('mail/unread') unread() { return this.svc.unread(); }
  @Roles(...SENDERS) @Get('mail/groups') groups() { return this.svc.groups(); }
  @Roles(...SENDERS) @Get('mail/people') people(@Query() q: PeopleQuery) { return this.svc.people(q.q); }
  @Roles(...SENDERS) @Post('mail') compose(@Body() d: ComposeDto) { return this.svc.compose(d); }
  @Roles(...ALL) @Get('mail/:id') get(@Param('id', Id()) id: string) { return this.svc.get(id); }
  @Roles(...ALL) @Post('mail/:id/reply') reply(@Param('id', Id()) id: string, @Body() d: ReplyDto) { return this.svc.reply(id, d); }
  @Roles(...ALL) @Post('mail/:id/rsvp') @HttpCode(200) rsvp(@Param('id', Id()) id: string, @Body() d: RsvpDto) { return this.svc.rsvp(id, d); }
  @Roles(...ALL) @Post('mail/:id/archive') @HttpCode(200) archive(@Param('id', Id()) id: string) { return this.svc.archive(id, true); }
  @Roles(...ALL) @Post('mail/:id/unarchive') @HttpCode(200) unarchive(@Param('id', Id()) id: string) { return this.svc.archive(id, false); }
  @Roles('PUBLISHER_ADMIN') @Get('admin/mail-settings') settings(@Req() req: any) { return this.svc.settings(siteOf(req)); }
  @Roles('PUBLISHER_ADMIN') @Put('admin/mail-settings') save(@Body() d: SettingsDto, @Req() req: any) { return this.svc.saveSettings(d, siteOf(req)); }
  @Roles('PUBLISHER_ADMIN') @Post('admin/mail-settings/test') @HttpCode(200) test(@Body() d: TestDto) { return this.svc.test(d.to); }
}
/** The site address as the super admin uses it (for links in emails). */
const siteOf = (req: any) => { const host = String(req.headers['x-forwarded-host'] ?? req.headers.host ?? '').split(',')[0].trim(); const proto = String(req.headers['x-forwarded-proto'] ?? req.protocol ?? 'https').split(',')[0].trim(); return host ? `${proto}://${host}` : ''; };

@Module({ imports: [LmsModule], controllers: [MailController], providers: [MailService] })
export class MailModule {}
