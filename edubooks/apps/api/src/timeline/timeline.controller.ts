import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, HttpCode, Injectable, Module, NotFoundException, Param, ParseIntPipe, ParseUUIDPipe, Patch, Post, Query, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';
import { randomBytes } from 'crypto';
import { Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { sql } from 'drizzle-orm';
import { Roles } from '../common/decorators';
import { appTmp } from '../common/tmp';
import { DbService } from '../db/db.service';
import { AuditService } from '../audit/audit.service';
import { AssetsService } from '../storage/assets.service';
import { AccessService } from '../lms/access.service';
import { LmsModule } from '../lms/lms.module';
import { NotificationsModule } from '../notifications/notifications.controller';
import { NotificationsService } from '../notifications/notifications.service';
import { pictureUrl } from '../people/avatars';

const READERS = ['SCHOOL_ADMIN', 'TEACHER', 'STUDENT', 'PARENT'];
const WRITERS = ['SCHOOL_ADMIN', 'TEACHER'];
const MAX_IMAGES = 8;
const IMAGE = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/;
const REACTIONS = ['❤️', '👏', '😊', '🎉', '⭐'];

class UploadDto { @IsString() @MaxLength(1_400_000) image!: string; }
class PostDto {
  @IsOptional() @IsUUID() classId?: string | null;
  @IsOptional() @IsIn(['POST', 'EVENT']) kind?: 'POST' | 'EVENT';
  @IsOptional() @IsString() @MaxLength(200) title?: string;
  @IsOptional() @IsString() @MaxLength(5000) body?: string;
  @IsOptional() @IsDateString() eventAt?: string | null;
  @IsOptional() @IsString() @MaxLength(200) place?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(MAX_IMAGES) @Matches(/^[\w./-]{10,300}$/, { each: true }) images?: string[];
  @IsOptional() @IsBoolean() pinned?: boolean;
}
class EditDto {
  @IsOptional() @IsString() @MaxLength(200) title?: string;
  @IsOptional() @IsString() @MaxLength(5000) body?: string;
  @IsOptional() @IsDateString() eventAt?: string | null;
  @IsOptional() @IsString() @MaxLength(200) place?: string;
  @IsOptional() @IsBoolean() pinned?: boolean;
}
class ReactDto { @IsOptional() @IsIn(REACTIONS) emoji?: string; }
class FeedQuery {
  @IsOptional() @IsUUID() classId?: string;
  @IsOptional() @IsDateString() before?: string;
  @IsOptional() @Type(() => Number) limit?: number;
}

/**
 * The school timeline: teachers and the school admin post news, photos and events — for the whole school or one class.
 * Students see the school's posts and their own classes'; parents see the school's and their children's classes'.
 */
@Injectable()
export class TimelineService {
  constructor(private readonly db: DbService, private readonly assets: AssetsService, private readonly audit: AuditService,
    private readonly access: AccessService, private readonly notifications: NotificationsService) {}
  private get ctx() { return this.db.ctx; }
  private async rows(q: ReturnType<typeof sql>) { return (await this.db.q.execute(q)).rows as any[]; }
  private is(r: string) { return (this.ctx.roles ?? []).includes(r); }

  /** The classes whose posts I may see; null = every class of the school (staff). */
  private async myClasses(): Promise<string[] | null> {
    if (this.is('SCHOOL_ADMIN') || this.is('TEACHER')) return null;
    if (this.is('STUDENT')) return this.access.studentClassIds();
    const r = await this.rows(sql`SELECT DISTINCT e.class_id FROM parent_students ps JOIN enrolments e ON e.student_id = ps.student_id WHERE ps.parent_id = ${this.ctx.userId}`);
    return r.map((x) => x.class_id);
  }
  private seen(classes: string[] | null) {
    return classes === null ? sql`TRUE` : classes.length ? sql`(p.class_id IS NULL OR p.class_id IN ${classes})` : sql`p.class_id IS NULL`;
  }

  async feed(q: FeedQuery) {
    const classes = await this.myClasses(); const limit = Math.min(Math.max(q.limit ?? 15, 1), 50);
    const list = await this.rows(sql`SELECT p.id, p.kind, p.title, p.body, p.event_at AS "eventAt", p.place, p.images, p.pinned, p.created_at AS "createdAt", p.updated_at AS "updatedAt",
        p.author_id AS "authorId", u.display_name AS "authorName", u.photo_at AS "authorPhotoAt", u.photo_key IS NOT NULL AS "authorHasPhoto", u.avatar AS "authorAvatar",
        CASE WHEN EXISTS (SELECT 1 FROM user_roles r WHERE r.user_id = u.id AND r.role = 'SCHOOL_ADMIN') THEN 'School admin' ELSE coalesce(nullif(u.designation, ''), 'Teacher') END AS "authorRole",
        p.class_id AS "classId", CASE WHEN c.id IS NOT NULL THEN c.name || CASE WHEN c.section <> '' THEN ' ' || c.section ELSE '' END END AS "className",
        (SELECT coalesce(json_object_agg(emoji, n), '{}') FROM (SELECT emoji, count(*)::int AS n FROM timeline_likes l WHERE l.post_id = p.id GROUP BY emoji) x) AS reactions,
        (SELECT emoji FROM timeline_likes l WHERE l.post_id = p.id AND l.user_id = ${this.ctx.userId}) AS "myReaction"
      FROM timeline_posts p JOIN users u ON u.id = p.author_id LEFT JOIN classes c ON c.id = p.class_id
      WHERE ${this.seen(classes)} ${q.classId ? sql`AND p.class_id = ${q.classId}` : sql``} ${q.before ? sql`AND p.created_at < ${q.before}` : sql``}
      ORDER BY ${q.before ? sql`` : sql`p.pinned DESC,`} p.created_at DESC LIMIT ${limit + 1}`);
    if (!q.before && !q.classId && limit > 3 && !(this.ctx as any).impersonatorId) await this.rows(sql`SELECT mark_timeline_seen()`);
    const more = list.length > limit; const items = list.slice(0, limit);
    const admin = this.is('SCHOOL_ADMIN');
    return {
      items: items.map(({ authorPhotoAt, authorHasPhoto, authorAvatar, images, ...p }) => ({
        ...p, images: (images as string[]).map((_k, i) => `/api/timeline/${p.id}/images/${i}?v=${new Date(p.updatedAt).getTime()}`),
        authorPhoto: pictureUrl(p.authorId, authorHasPhoto, authorPhotoAt, authorAvatar),
        canEdit: admin || p.authorId === this.ctx.userId, canPin: admin,
      })),
      more, next: more ? items[items.length - 1].createdAt : null,
    };
  }

  /** Posts by others that I can see and have not seen yet (since I last opened the timeline; at most the last 14 days). */
  async newCount() {
    const classes = await this.myClasses();
    const [r] = await this.rows(sql`SELECT count(*)::int AS n FROM timeline_posts p, users me WHERE me.id = ${this.ctx.userId}
      AND p.author_id <> me.id AND p.created_at > greatest(coalesce(me.timeline_seen_at, now() - interval '14 days'), now() - interval '14 days') AND ${this.seen(classes)}`);
    return r.n as number;
  }

  /** Upcoming events (next 60 days) for the top of the timeline. */
  async events() {
    const classes = await this.myClasses();
    return this.rows(sql`SELECT p.id, p.title, p.event_at AS "eventAt", p.place, CASE WHEN c.id IS NOT NULL THEN c.name || CASE WHEN c.section <> '' THEN ' ' || c.section ELSE '' END END AS "className"
      FROM timeline_posts p LEFT JOIN classes c ON c.id = p.class_id
      WHERE p.kind = 'EVENT' AND p.event_at BETWEEN now() - interval '6 hours' AND now() + interval '60 days' AND ${this.seen(classes)}
      ORDER BY p.event_at LIMIT 10`);
  }

  /** Classes I may post to (teachers: their own; the school admin: all). */
  async audiences() {
    const mine = this.is('SCHOOL_ADMIN') ? null : await this.access.teacherClassIds();
    return this.rows(sql`SELECT c.id, c.name || CASE WHEN c.section <> '' THEN ' ' || c.section ELSE '' END AS name FROM classes c
      WHERE NOT c.archived ${mine === null ? sql`` : mine.length ? sql`AND c.id IN ${mine}` : sql`AND FALSE`} ORDER BY c.name, c.section`);
  }

  /** One photo, made small on the device; kept until it is used in a post. */
  async upload(image: string) {
    const m = IMAGE.exec(image); if (!m) throw new BadRequestException('Send a JPEG, PNG or WebP picture');
    const buf = Buffer.from(m[2], 'base64');
    if (buf.length < 100 || buf.length > 1_000_000) throw new BadRequestException('Each picture must be smaller than 1 MB');
    const ok = m[1] === 'jpeg' ? buf[0] === 0xff && buf[1] === 0xd8 : m[1] === 'png' ? buf[0] === 0x89 && buf[1] === 0x50 : buf.subarray(8, 12).toString() === 'WEBP';
    if (!ok) throw new BadRequestException('This is not a picture');
    const key = `${this.ctx.publisherId}/timeline/${this.ctx.schoolId}/${this.ctx.userId}-${randomBytes(8).toString('hex')}.${m[1] === 'jpeg' ? 'jpg' : m[1]}`;
    const tmp = path.join(appTmp('uploads'), randomBytes(12).toString('hex'));
    await fs.promises.writeFile(tmp, buf);
    try { await this.assets.driver.putFile(key, tmp, `image/${m[1]}`); } finally { fs.promises.rm(tmp, { force: true }).catch(() => undefined); }
    return { key };
  }
  /** Only pictures this person uploaded, for this school, may be attached. */
  private checkImages(keys: string[] = []) {
    const prefix = `${this.ctx.publisherId}/timeline/${this.ctx.schoolId}/${this.ctx.userId}-`;
    for (const k of keys) if (!k.startsWith(prefix) || k.includes('..')) throw new BadRequestException('Unknown picture');
    return [...new Set(keys)];
  }

  async create(d: PostDto) {
    const images = this.checkImages(d.images);
    const body = (d.body ?? '').trim(); const title = (d.title ?? '').trim(); const kind = d.kind ?? 'POST';
    if (!body && !title && !images.length) throw new BadRequestException('Write something or add a photo');
    if (kind === 'EVENT' && !d.eventAt) throw new BadRequestException('Choose the date and time of the event');
    if (kind === 'EVENT' && !title) throw new BadRequestException('Give the event a name');
    let cls: any = null;
    if (d.classId) cls = await this.access.assertTeaches(d.classId);
    else if (!this.is('SCHOOL_ADMIN') && !this.is('TEACHER')) throw new ForbiddenException();
    const [p] = await this.rows(sql`INSERT INTO timeline_posts (publisher_id, school_id, author_id, class_id, kind, title, body, event_at, place, images, pinned)
      VALUES (${this.ctx.publisherId}, ${this.ctx.schoolId}, ${this.ctx.userId}, ${d.classId ?? null}, ${kind}, ${title}, ${body}, ${kind === 'EVENT' ? d.eventAt : null},
        ${(d.place ?? '').trim()}, ${JSON.stringify(images)}::jsonb, ${!!d.pinned && this.is('SCHOOL_ADMIN')}) RETURNING id`);
    await this.audit.log('timeline.post', 'timeline_post', p.id, `Posted on the timeline${cls ? ` for ${cls.name}` : ' for the whole school'}: ${title || body.slice(0, 60)}`);
    await this.tell(p.id, kind, title || body.slice(0, 80) || '📷 New photos', d.classId ?? null);
    return { id: p.id };
  }

  /** Class posts and events are announced to the students and parents they are for (and events to staff too). */
  private async tell(id: string, kind: string, what: string, classId: string | null) {
    if (!classId && kind !== 'EVENT') return;
    const [me] = await this.rows(sql`SELECT display_name FROM users WHERE id = ${this.ctx.userId}`);
    const kids = await this.rows(classId
      ? sql`SELECT u.id FROM enrolments e JOIN users u ON u.id = e.student_id AND u.status = 'ACTIVE' WHERE e.class_id = ${classId}`
      : sql`SELECT u.id FROM users u JOIN user_roles r ON r.user_id = u.id AND r.role = 'STUDENT' WHERE u.school_id = ${this.ctx.schoolId} AND u.status = 'ACTIVE'`);
    const parents = kids.length ? await this.rows(sql`SELECT DISTINCT ps.parent_id AS id FROM parent_students ps WHERE ps.student_id IN ${kids.map((k) => k.id)}`) : [];
    const title = `${kind === 'EVENT' ? '📅 Event' : '📰 New post'} from ${me.display_name}: ${what}`.slice(0, 200);
    await this.notifications.notify(kids, { kind: 'TIMELINE', title, link: '/learn/timeline' });
    await this.notifications.notify(parents, { kind: 'TIMELINE', title, link: '/parent/timeline' });
    if (!classId) {
      for (const [role, link] of [['TEACHER', '/teacher/timeline'], ['SCHOOL_ADMIN', '/school/timeline']] as const) {
        const staff = await this.rows(sql`SELECT DISTINCT u.id FROM users u JOIN user_roles r ON r.user_id = u.id AND r.role = ${role}::role
          WHERE u.school_id = ${this.ctx.schoolId} AND u.status = 'ACTIVE' AND u.id <> ${this.ctx.userId}`);
        await this.notifications.notify(staff, { kind: 'TIMELINE', title, link });
      }
    }
  }

  private async own(id: string) {
    const [p] = await this.rows(sql`SELECT id, author_id, images, class_id FROM timeline_posts WHERE id = ${id}`);
    if (!p) throw new NotFoundException('Post not found');
    if (p.author_id !== this.ctx.userId && !this.is('SCHOOL_ADMIN')) throw new ForbiddenException('Only the writer or the school admin can change this post');
    return p;
  }
  async edit(id: string, d: EditDto) {
    await this.own(id);
    if (d.pinned !== undefined && !this.is('SCHOOL_ADMIN')) throw new ForbiddenException('Only the school admin can pin posts');
    await this.rows(sql`UPDATE timeline_posts SET
        title = coalesce(${d.title?.trim() ?? null}, title), body = coalesce(${d.body?.trim() ?? null}, body), place = coalesce(${d.place?.trim() ?? null}, place),
        event_at = CASE WHEN ${d.eventAt !== undefined} THEN ${d.eventAt ?? null}::timestamptz ELSE event_at END,
        pinned = coalesce(${d.pinned ?? null}::boolean, pinned), updated_at = now()
      WHERE id = ${id}`);
    return { ok: true };
  }
  async remove(id: string) {
    const p = await this.own(id);
    await this.rows(sql`DELETE FROM timeline_posts WHERE id = ${id}`);
    for (const k of p.images as string[]) this.assets.driver.remove(k).catch(() => undefined);
    await this.audit.log('timeline.delete', 'timeline_post', id, 'Deleted a timeline post');
    return { ok: true };
  }
  async react(id: string, emoji?: string) {
    const classes = await this.myClasses();
    const [p] = await this.rows(sql`SELECT p.id FROM timeline_posts p WHERE p.id = ${id} AND ${this.seen(classes)}`);
    if (!p) throw new NotFoundException('Post not found');
    const [cur] = await this.rows(sql`SELECT emoji FROM timeline_likes WHERE post_id = ${id} AND user_id = ${this.ctx.userId}`);
    if (cur && (!emoji || cur.emoji === emoji)) await this.rows(sql`DELETE FROM timeline_likes WHERE post_id = ${id} AND user_id = ${this.ctx.userId}`);
    else await this.rows(sql`INSERT INTO timeline_likes (post_id, user_id, publisher_id, school_id, emoji) VALUES (${id}, ${this.ctx.userId}, ${this.ctx.publisherId}, ${this.ctx.schoolId}, ${emoji ?? '❤️'})
      ON CONFLICT (post_id, user_id) DO UPDATE SET emoji = EXCLUDED.emoji, created_at = now()`);
    const r = await this.rows(sql`SELECT coalesce(json_object_agg(emoji, n), '{}') AS reactions FROM (SELECT emoji, count(*)::int AS n FROM timeline_likes WHERE post_id = ${id} GROUP BY emoji) x`);
    const [mine] = await this.rows(sql`SELECT emoji FROM timeline_likes WHERE post_id = ${id} AND user_id = ${this.ctx.userId}`);
    return { reactions: r[0].reactions, myReaction: mine?.emoji ?? null };
  }
  async image(id: string, n: number) {
    const classes = await this.myClasses();
    const [p] = await this.rows(sql`SELECT p.images FROM timeline_posts p WHERE p.id = ${id} AND ${this.seen(classes)}`);
    const key = (p?.images as string[] | undefined)?.[n];
    if (!key) throw new NotFoundException('Picture not found');
    const ext = key.split('.').pop();
    return { stream: await this.assets.driver.read(key), mime: ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : ext === 'svg' ? 'image/svg+xml' : 'image/jpeg' };
  }
}

@ApiTags('timeline')
@Controller('timeline')
export class TimelineController {
  constructor(private readonly svc: TimelineService) {}
  @Roles(...READERS) @Get() feed(@Query() q: FeedQuery) { return this.svc.feed(q); }
  @Roles(...READERS) @Get('events') events() { return this.svc.events(); }
  @Roles(...WRITERS) @Get('audiences') audiences() { return this.svc.audiences(); }
  @Roles(...WRITERS) @Post('uploads') @HttpCode(200) upload(@Body() d: UploadDto) { return this.svc.upload(d.image); }
  @Roles(...WRITERS) @Post() create(@Body() d: PostDto) { return this.svc.create(d); }
  @Roles(...WRITERS) @Patch(':id') edit(@Param('id', ParseUUIDPipe) id: string, @Body() d: EditDto) { return this.svc.edit(id, d); }
  @Roles(...WRITERS) @Delete(':id') remove(@Param('id', ParseUUIDPipe) id: string) { return this.svc.remove(id); }
  @Roles(...READERS) @Post(':id/react') @HttpCode(200) react(@Param('id', ParseUUIDPipe) id: string, @Body() d: ReactDto) { return this.svc.react(id, d.emoji); }
  @SkipThrottle() @Roles(...READERS) @Get(':id/images/:n')
  async image(@Param('id', ParseUUIDPipe) id: string, @Param('n', ParseIntPipe) n: number, @Res() res: Response) {
    const f = await this.svc.image(id, n);
    res.setHeader('Content-Type', f.mime); res.setHeader('Cache-Control', 'private, max-age=604800'); res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'");
    f.stream.on('error', () => res.destroy()).pipe(res);
  }
}

@Module({ imports: [LmsModule, NotificationsModule], controllers: [TimelineController], providers: [TimelineService], exports: [TimelineService] })
export class TimelineModule {}
