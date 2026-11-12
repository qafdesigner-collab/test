import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Injectable, Module, NotFoundException, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Max, MaxLength, Min } from 'class-validator';
import { sql } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { NotificationsService } from '../notifications/notifications.service';
import { Roles } from '../common/decorators';
import { checkUrl } from '../common/urls';
import { timezone } from '../common/region';
import { AccessService } from '../lms/access.service';
import { LmsModule } from '../lms/lms.module';

const Id = () => new ParseUUIDPipe();
const arr = (ids: string[]) => `{${ids.join(',')}}`;
const NONE = '00000000-0000-0000-0000-000000000000';

class StartDto { @IsUUID() studentId!: string; @IsUUID() withId!: string; }
class SendDto { @IsString() @Length(1, 2000) body!: string; }
class AnnouncementDto {
  @IsOptional() @IsUUID() classId?: string | null;
  @IsString() @Length(2, 160) title!: string;
  @IsOptional() @IsString() @MaxLength(4000) body?: string;
  @IsOptional() @IsIn(['STUDENTS', 'PARENTS', 'BOTH']) audience?: 'STUDENTS' | 'PARENTS' | 'BOTH';
  @IsOptional() @IsBoolean() pinned?: boolean;
}
class LiveDto {
  @IsUUID() classId!: string;
  @IsString() @Length(2, 160) title!: string;
  @IsDateString() startsAt!: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(5) @Max(300) durationMin?: number;
  @IsString() @MaxLength(500) url!: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}

@Injectable()
export class MessagingService {
  constructor(private readonly db: DbService, private readonly access: AccessService, private readonly notifications: NotificationsService) {}
  private get ctx() { return this.db.ctx; }
  private async rows(s: ReturnType<typeof sql>) { return (await this.db.q.execute(s)).rows as any[]; }
  private async one(s: ReturnType<typeof sql>) { return (await this.rows(s))[0]; }
  private isParent() { return this.access.is('PARENT') && !this.access.is('TEACHER') && !this.access.is('SCHOOL_ADMIN'); }
  private async childIds() { return (await this.rows(sql`SELECT student_id FROM parent_students WHERE parent_id = ${this.ctx.userId}`)).map((r) => r.student_id as string); }
  /** Classes whose pupils this user may address: a teacher's own classes, every class for a school admin, a parent's children's classes. */
  private async myClassIds(): Promise<string[] | 'ALL'> {
    if (this.access.is('SCHOOL_ADMIN')) return 'ALL';
    if (this.access.is('TEACHER')) return this.access.teacherClassIds();
    if (this.isParent()) { const kids = await this.childIds(); return kids.length ? (await this.rows(sql`SELECT DISTINCT class_id FROM enrolments WHERE student_id = ANY(${arr(kids)}::uuid[])`)).map((r) => r.class_id) : []; }
    return this.access.studentClassIds();
  }

  // ------------------------------------------------------------ contacts & conversations
  /** Parents see their children's teachers and the school office; staff see the parents of their pupils. */
  async contacts() {
    if (this.isParent()) {
      return this.rows(sql`SELECT k.id AS "studentId", k.display_name AS "studentName", u.id, u.display_name AS "displayName",
          CASE WHEN r.role = 'SCHOOL_ADMIN' THEN 'School office' ELSE coalesce((SELECT string_agg(DISTINCT s.name, ', ') FROM class_teachers ct2 LEFT JOIN subjects s ON s.id = ct2.subject_id
            JOIN enrolments e2 ON e2.class_id = ct2.class_id WHERE ct2.user_id = u.id AND e2.student_id = k.id), 'Teacher') END AS role
        FROM parent_students ps JOIN users k ON k.id = ps.student_id
        JOIN users u ON u.school_id = k.school_id AND u.status = 'ACTIVE'
        JOIN user_roles r ON r.user_id = u.id AND r.role IN ('TEACHER', 'SCHOOL_ADMIN')
        WHERE ps.parent_id = ${this.ctx.userId} AND (r.role = 'SCHOOL_ADMIN' OR EXISTS (SELECT 1 FROM class_teachers ct JOIN enrolments e ON e.class_id = ct.class_id WHERE ct.user_id = u.id AND e.student_id = k.id))
        ORDER BY k.display_name, r.role DESC, u.display_name`);
    }
    const cls = await this.myClassIds();
    if (cls !== 'ALL' && !cls.length) return [];
    return this.rows(sql`SELECT DISTINCT k.id AS "studentId", k.display_name AS "studentName", p.id, p.display_name AS "displayName", ps.relation AS role
      FROM enrolments e JOIN users k ON k.id = e.student_id JOIN parent_students ps ON ps.student_id = k.id JOIN users p ON p.id = ps.parent_id AND p.status = 'ACTIVE'
      WHERE ${cls === 'ALL' ? sql`true` : sql`e.class_id = ANY(${arr(cls)}::uuid[])`} ORDER BY k.display_name, p.display_name`);
  }

  async start(d: StartDto) {
    const ok = (await this.contacts()).some((c: any) => c.studentId === d.studentId && c.id === d.withId);
    if (!ok) throw new ForbiddenException('You can only message the parents of your pupils, or your child’s teachers and school office');
    const [parentId, staffId] = this.isParent() ? [this.ctx.userId, d.withId] : [d.withId, this.ctx.userId];
    const c = await this.one(sql`INSERT INTO conversations (publisher_id, school_id, parent_id, staff_id, student_id) VALUES (${this.ctx.publisherId}, ${this.ctx.schoolId}, ${parentId}, ${staffId}, ${d.studentId})
      ON CONFLICT (parent_id, staff_id, student_id) DO UPDATE SET parent_id = excluded.parent_id RETURNING id`);
    return c;
  }

  async list(all = false) {
    if (all && !this.access.is('SCHOOL_ADMIN')) throw new ForbiddenException('Only the school admin can see every conversation');
    const me = this.ctx.userId;
    return this.rows(sql`SELECT c.id, c.last_message_at AS "lastMessageAt", k.display_name AS "studentName",
        p.id AS "parentId", p.display_name AS "parentName", s.id AS "staffId", s.display_name AS "staffName",
        (SELECT body FROM messages m WHERE m.conversation_id = c.id ORDER BY created_at DESC LIMIT 1) AS "lastMessage",
        (SELECT count(*) FROM messages m WHERE m.conversation_id = c.id AND m.sender_id <> ${me}
           AND m.created_at > coalesce((SELECT last_read_at FROM conversation_reads r WHERE r.conversation_id = c.id AND r.user_id = ${me}), '-infinity'))::int AS unread
      FROM conversations c JOIN users k ON k.id = c.student_id JOIN users p ON p.id = c.parent_id JOIN users s ON s.id = c.staff_id
      WHERE ${all ? sql`true` : sql`(c.parent_id = ${me} OR c.staff_id = ${me})`} ORDER BY c.last_message_at DESC LIMIT 300`);
  }

  async unread() {
    const r = await this.one(sql`SELECT count(*)::int AS n FROM messages m JOIN conversations c ON c.id = m.conversation_id
      WHERE (c.parent_id = ${this.ctx.userId} OR c.staff_id = ${this.ctx.userId}) AND m.sender_id <> ${this.ctx.userId}
        AND m.created_at > coalesce((SELECT last_read_at FROM conversation_reads r WHERE r.conversation_id = c.id AND r.user_id = ${this.ctx.userId}), '-infinity')`);
    return { unread: r.n };
  }

  private async conv(id: string, write: boolean) {
    const c = await this.one(sql`SELECT * FROM conversations WHERE id = ${id}`);
    if (!c) throw new NotFoundException('Conversation not found');
    const mine = c.parent_id === this.ctx.userId || c.staff_id === this.ctx.userId;
    if (!mine && (write || !this.access.is('SCHOOL_ADMIN'))) throw new ForbiddenException('Not your conversation');
    return { ...c, mine };
  }

  async read(id: string) {
    const c = await this.conv(id, false);
    const messages = await this.rows(sql`SELECT m.id, m.body, m.created_at AS "createdAt", m.sender_id AS "senderId", u.display_name AS "senderName"
      FROM messages m LEFT JOIN users u ON u.id = m.sender_id WHERE m.conversation_id = ${id} ORDER BY m.created_at`);
    if (c.mine) await this.db.q.execute(sql`INSERT INTO conversation_reads (conversation_id, user_id, publisher_id, school_id) VALUES (${id}, ${this.ctx.userId}, ${this.ctx.publisherId}, ${this.ctx.schoolId})
      ON CONFLICT (conversation_id, user_id) DO UPDATE SET last_read_at = now()`);
    const names = await this.one(sql`SELECT k.display_name AS "studentName", p.display_name AS "parentName", s.display_name AS "staffName" FROM users k, users p, users s WHERE k.id = ${c.student_id} AND p.id = ${c.parent_id} AND s.id = ${c.staff_id}`);
    return { id, ...names, readOnly: !c.mine, me: this.ctx.userId, messages };
  }

  async send(id: string, d: SendDto) {
    const c = await this.conv(id, true);
    const body = d.body.trim(); if (!body) throw new BadRequestException('Write a message');
    const to = c.parent_id === this.ctx.userId ? c.staff_id : c.parent_id;
    // Phone only for parents, and only when they have no unread message in this conversation yet (no flood of texts).
    const pending = await this.one(sql`SELECT count(*)::int AS n FROM messages m WHERE m.conversation_id = ${id} AND m.sender_id <> ${to}
      AND m.created_at > coalesce((SELECT last_read_at FROM conversation_reads r WHERE r.conversation_id = ${id} AND r.user_id = ${to}), '-infinity')`);
    await this.db.q.execute(sql`INSERT INTO messages (publisher_id, school_id, conversation_id, sender_id, body) VALUES (${this.ctx.publisherId}, ${this.ctx.schoolId}, ${id}, ${this.ctx.userId}, ${body})`);
    await this.db.q.execute(sql`UPDATE conversations SET last_message_at = now() WHERE id = ${id}`);
    await this.db.q.execute(sql`INSERT INTO conversation_reads (conversation_id, user_id, publisher_id, school_id) VALUES (${id}, ${this.ctx.userId}, ${this.ctx.publisherId}, ${this.ctx.schoolId})
      ON CONFLICT (conversation_id, user_id) DO UPDATE SET last_read_at = now()`);
    const sender = await this.one(sql`SELECT display_name FROM users WHERE id = ${this.ctx.userId}`);
    const toParent = to === c.parent_id;
    const target = await this.one(sql`SELECT id, phone FROM users WHERE id = ${to}`);
    await this.notifications.notify([target], { kind: 'MESSAGE', title: `New message from ${sender.display_name}`, body: body.slice(0, 140), link: toParent ? `/parent/messages?c=${id}` : `/messages?c=${id}` },
      { phone: toParent && !pending.n });
    return this.read(id);
  }

  // ------------------------------------------------------------ announcements
  async announcements() {
    const cls = await this.myClassIds();
    const staff = this.access.is('TEACHER') || this.access.is('SCHOOL_ADMIN');
    const audience = staff ? sql`true` : this.isParent() ? sql`a.audience IN ('PARENTS','BOTH')` : sql`a.audience IN ('STUDENTS','BOTH')`;
    return this.rows(sql`SELECT a.id, a.title, a.body, a.audience, a.pinned, a.created_at AS "createdAt", a.class_id AS "classId", c.name AS "className", c.section,
        u.display_name AS author, a.author_id = ${this.ctx.userId} AS mine
      FROM announcements a LEFT JOIN classes c ON c.id = a.class_id LEFT JOIN users u ON u.id = a.author_id
      WHERE ${audience} AND (a.class_id IS NULL OR ${cls === 'ALL' ? sql`true` : sql`a.class_id = ANY(${arr(cls.length ? cls : [NONE])}::uuid[])`} OR a.author_id = ${this.ctx.userId})
        AND a.created_at > now() - interval '120 days'
      ORDER BY a.pinned DESC, a.created_at DESC LIMIT 50`);
  }

  async announce(d: AnnouncementDto) {
    if (!d.classId && !this.access.is('SCHOOL_ADMIN')) throw new ForbiddenException('Teachers post to one of their classes');
    if (d.classId) await this.access.assertTeaches(d.classId);
    const audience = d.audience ?? 'BOTH';
    const a = await this.one(sql`INSERT INTO announcements (publisher_id, school_id, class_id, author_id, title, body, audience, pinned)
      VALUES (${this.ctx.publisherId}, ${this.ctx.schoolId}, ${d.classId ?? null}, ${this.ctx.userId}, ${d.title.trim()}, ${d.body ?? ''}, ${audience}, ${!!d.pinned}) RETURNING id`);
    const kids = d.classId ? await this.access.studentIdsOf(d.classId)
      : (await this.rows(sql`SELECT r.user_id FROM user_roles r JOIN users u ON u.id = r.user_id AND u.status = 'ACTIVE' WHERE r.role = 'STUDENT' AND r.school_id = ${this.ctx.schoolId}`)).map((r) => r.user_id);
    const m = { kind: 'ANNOUNCEMENT', title: d.title.trim(), body: (d.body ?? '').slice(0, 300) };
    if (audience !== 'PARENTS' && kids.length) await this.notifications.notify(kids.map((id: string) => ({ id })), { ...m, link: '/learn' });
    if (audience !== 'STUDENTS' && kids.length) {
      const parents = await this.rows(sql`SELECT DISTINCT u.id, u.phone FROM parent_students ps JOIN users u ON u.id = ps.parent_id AND u.status = 'ACTIVE' WHERE ps.student_id = ANY(${arr(kids)}::uuid[])`);
      if (parents.length) await this.notifications.notify(parents, { ...m, link: '/parent' }, { phone: true });
    }
    return a;
  }

  async removeAnnouncement(id: string) {
    const a = await this.one(sql`SELECT author_id FROM announcements WHERE id = ${id}`);
    if (!a) throw new NotFoundException('Announcement not found');
    if (a.author_id !== this.ctx.userId && !this.access.is('SCHOOL_ADMIN')) throw new ForbiddenException('Only the author or the school admin can remove it');
    await this.db.q.execute(sql`DELETE FROM announcements WHERE id = ${id}`);
    return { ok: true };
  }

  // ------------------------------------------------------------ live lessons
  async live() {
    const cls = await this.myClassIds();
    if (cls !== 'ALL' && !cls.length) return [];
    return this.rows(sql`SELECT l.id, l.title, l.starts_at AS "startsAt", l.duration_min AS "durationMin", l.url, l.notes, l.class_id AS "classId", c.name AS "className", c.section,
        u.display_name AS teacher, l.teacher_id = ${this.ctx.userId} AS mine,
        (now() BETWEEN l.starts_at - interval '10 minutes' AND l.starts_at + make_interval(mins => l.duration_min)) AS joinable
      FROM live_sessions l JOIN classes c ON c.id = l.class_id LEFT JOIN users u ON u.id = l.teacher_id
      WHERE l.starts_at + make_interval(mins => l.duration_min) > now() AND ${cls === 'ALL' ? sql`true` : sql`l.class_id = ANY(${arr(cls)}::uuid[])`}
      ORDER BY l.starts_at LIMIT 50`);
  }

  async scheduleLive(d: LiveDto) {
    await this.access.assertTeaches(d.classId);
    const url = checkUrl('LINK', d.url)!;
    if (new Date(d.startsAt).getTime() < Date.now() - 3600_000) throw new BadRequestException('The start time is in the past');
    const l = await this.one(sql`INSERT INTO live_sessions (publisher_id, school_id, class_id, teacher_id, title, starts_at, duration_min, url, notes)
      VALUES (${this.ctx.publisherId}, ${this.ctx.schoolId}, ${d.classId}, ${this.ctx.userId}, ${d.title.trim()}, ${d.startsAt}, ${d.durationMin ?? 40}, ${url}, ${d.notes ?? ''}) RETURNING id`);
    const kids = await this.access.studentIdsOf(d.classId);
    const when = new Date(d.startsAt).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: timezone() });
    const m = { kind: 'LIVE', title: `Live lesson: ${d.title.trim()}`, body: `${when}. Open the app to join.` };
    if (kids.length) {
      await this.notifications.notify(kids.map((id) => ({ id })), { ...m, link: '/learn' });
      const parents = await this.rows(sql`SELECT DISTINCT u.id, u.phone FROM parent_students ps JOIN users u ON u.id = ps.parent_id AND u.status = 'ACTIVE' WHERE ps.student_id = ANY(${arr(kids)}::uuid[])`);
      if (parents.length) await this.notifications.notify(parents, { ...m, link: '/parent' }, { phone: true });
    }
    return l;
  }

  async cancelLive(id: string) {
    const l = await this.one(sql`SELECT class_id, teacher_id FROM live_sessions WHERE id = ${id}`);
    if (!l) throw new NotFoundException('Live lesson not found');
    await this.access.assertTeaches(l.class_id);
    await this.db.q.execute(sql`DELETE FROM live_sessions WHERE id = ${id}`);
    return { ok: true };
  }
}

const SCHOOL = ['SCHOOL_ADMIN', 'TEACHER', 'PARENT'];
const ALLIN = ['SCHOOL_ADMIN', 'TEACHER', 'PARENT', 'STUDENT'];
@ApiTags('messaging')
@Controller()
export class MessagingController {
  constructor(private readonly svc: MessagingService) {}
  @Roles(...SCHOOL) @Get('messages/contacts') contacts() { return this.svc.contacts(); }
  @Roles(...SCHOOL) @Get('messages/conversations') list(@Query('all') all?: string) { return this.svc.list(all === '1'); }
  @Roles(...SCHOOL) @Get('messages/unread') unread() { return this.svc.unread(); }
  @Roles(...SCHOOL) @Post('messages/conversations') start(@Body() d: StartDto) { return this.svc.start(d); }
  @Roles(...SCHOOL) @Get('messages/conversations/:id') read(@Param('id', Id()) id: string) { return this.svc.read(id); }
  @Roles(...SCHOOL) @Post('messages/conversations/:id') send(@Param('id', Id()) id: string, @Body() d: SendDto) { return this.svc.send(id, d); }
  @Roles(...ALLIN) @Get('announcements') announcements() { return this.svc.announcements(); }
  @Roles('SCHOOL_ADMIN', 'TEACHER') @Post('announcements') announce(@Body() d: AnnouncementDto) { return this.svc.announce(d); }
  @Roles('SCHOOL_ADMIN', 'TEACHER') @Delete('announcements/:id') removeA(@Param('id', Id()) id: string) { return this.svc.removeAnnouncement(id); }
  @Roles(...ALLIN) @Get('live') live() { return this.svc.live(); }
  @Roles('SCHOOL_ADMIN', 'TEACHER') @Post('live') schedule(@Body() d: LiveDto) { return this.svc.scheduleLive(d); }
  @Roles('SCHOOL_ADMIN', 'TEACHER') @Delete('live/:id') cancel(@Param('id', Id()) id: string) { return this.svc.cancelLive(id); }
}

@Module({ imports: [LmsModule], controllers: [MessagingController], providers: [MessagingService] })
export class MessagingModule {}
