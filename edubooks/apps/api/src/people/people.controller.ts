import { BadRequestException, Body, ConflictException, Controller, Delete, ForbiddenException, Get, HttpCode, Injectable, Module, NotFoundException, Param, ParseUUIDPipe, Post, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { IsEmail, IsIn, IsOptional, IsString, Length, Matches, MaxLength, MinLength } from 'class-validator';
import { randomBytes } from 'crypto';
import { Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { sql } from 'drizzle-orm';
import { Ctx, Roles } from '../common/decorators';
import { DbService } from '../db/db.service';
import { AuditService } from '../audit/audit.service';
import { AssetsService } from '../storage/assets.service';
import { appTmp } from '../common/tmp';
import { open as unseal, seal } from '../common/secret-box';
import { hashPassword } from '../auth/password';
import { friendlyPassword } from '../common/creds';
import { SchoolsService } from '../schools/schools.service';
import { SchoolsModule } from '../schools/schools.module';

const ANY = ['PUBLISHER_ADMIN', 'PUBLISHER_EDITOR', 'PUBLISHER_SALES', 'SCHOOL_ADMIN', 'TEACHER', 'STUDENT', 'PARENT'];
const PHOTO = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/;
const MAGIC: Record<string, (b: Buffer) => boolean> = {
  jpeg: (b) => b[0] === 0xff && b[1] === 0xd8,
  png: (b) => b.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])),
  webp: (b) => b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP',
};
/** Notifications that matter most come first in the welcome window. */
const IMPORTANT = ['DATA', 'LICENCE_EXPIRY', 'DEMO_EXPIRY', 'TEST', 'RESULT', 'HOMEWORK', 'ATTENDANCE'];

class PhotoDto { @IsString() @MaxLength(700_000) image!: string; }
class StaffDto {
  @IsString() @Length(2, 120) displayName!: string;
  @Matches(/^[a-z0-9._-]{3,40}$/, { message: 'Username: 3–40 small letters, digits, dot, dash or underscore' }) username!: string;
  @IsOptional() @IsEmail() email?: string;
  @IsIn(['PUBLISHER_SALES', 'PUBLISHER_EDITOR', 'PUBLISHER_ADMIN']) role!: string;
  @IsOptional() @IsString() @MinLength(8) @MaxLength(100) password?: string;
}
class StatusDto { @IsIn(['ACTIVE', 'SUSPENDED']) status!: string; }

@Injectable()
export class PeopleService {
  constructor(private readonly db: DbService, private readonly assets: AssetsService, private readonly audit: AuditService, private readonly schools: SchoolsService) {}
  private async rows(q: ReturnType<typeof sql>) { return (await this.db.q.execute(q)).rows as any[]; }
  private get ctx() { return this.db.ctx; }

  // ---------- profile photo ----------
  async setPhoto(image: string) {
    const m = PHOTO.exec(image); if (!m) throw new BadRequestException('Send a JPEG, PNG or WebP picture');
    const buf = Buffer.from(m[2], 'base64');
    if (buf.length < 100 || buf.length > 500_000) throw new BadRequestException('The picture must be smaller than 500 KB');
    if (!MAGIC[m[1]](buf)) throw new BadRequestException('This is not a picture');
    const key = `${this.ctx.publisherId}/photos/${this.ctx.userId}-${randomBytes(6).toString('hex')}.${m[1] === 'jpeg' ? 'jpg' : m[1]}`;
    const tmp = path.join(appTmp('uploads'), randomBytes(12).toString('hex'));
    await fs.promises.writeFile(tmp, buf);
    try { await this.assets.driver.putFile(key, tmp, `image/${m[1]}`); } finally { fs.promises.rm(tmp, { force: true }).catch(() => undefined); }
    const [r] = await this.rows(sql`SELECT * FROM set_my_photo(${key}, ${`image/${m[1]}`})`);
    if (r?.old_key) this.assets.driver.remove(r.old_key).catch(() => undefined);
    return this.photoInfo(this.ctx.userId);
  }
  async removePhoto() {
    const [r] = await this.rows(sql`SELECT * FROM set_my_photo(NULL, NULL)`);
    if (r?.old_key) this.assets.driver.remove(r.old_key).catch(() => undefined);
    return { photoUrl: null };
  }
  async photoInfo(id: string) {
    const [u] = await this.rows(sql`SELECT photo_at FROM users WHERE id = ${id}`);
    return { photoUrl: u?.photo_at ? `/api/users/${id}/photo?v=${new Date(u.photo_at).getTime()}` : null };
  }
  /** Only people the viewer may see (row security): the same school, or publisher staff. */
  async readPhoto(id: string) {
    const [u] = await this.rows(sql`SELECT photo_key, photo_mime FROM users WHERE id = ${id}`);
    if (!u?.photo_key) throw new NotFoundException('No photo');
    return { stream: await this.assets.driver.read(u.photo_key), mime: u.photo_mime as string };
  }

  // ---------- the welcome window: what matters today ----------
  async welcome() {
    const me = this.ctx.userId; const roles: string[] = this.ctx.roles ?? [];
    const notes = await this.rows(sql`SELECT id, kind, title, body, link, created_at AS "createdAt" FROM notifications
      WHERE user_id = ${me} AND read_at IS NULL
      ORDER BY array_position(${`{${IMPORTANT.join(',')}}`}::text[], kind) NULLS LAST, created_at DESC LIMIT 6`);
    const [{ n: unread }] = await this.rows(sql`SELECT count(*)::int AS n FROM notifications WHERE user_id = ${me} AND read_at IS NULL`);
    const todo: { key: string; n: number; link: string }[] = [];
    const add = (key: string, n: number, link: string) => { if (n > 0) todo.push({ key, n, link }); };
    if (roles.includes('STUDENT')) {
      const [r] = await this.rows(sql`SELECT count(*)::int AS n FROM assessments a JOIN enrolments e ON e.class_id = a.class_id AND e.student_id = ${me}
        WHERE a.status = 'PUBLISHED' AND (a.due_at IS NULL OR a.due_at > now() - interval '1 day')
          AND NOT EXISTS (SELECT 1 FROM submissions s WHERE s.assessment_id = a.id AND s.student_id = ${me})`);
      add('homework', r.n, '/learn');
      const [d] = await this.rows(sql`SELECT count(*)::int AS n FROM assessments a JOIN enrolments e ON e.class_id = a.class_id AND e.student_id = ${me}
        WHERE a.status = 'PUBLISHED' AND a.due_at BETWEEN now() AND now() + interval '2 days'
          AND NOT EXISTS (SELECT 1 FROM submissions s WHERE s.assessment_id = a.id AND s.student_id = ${me})`);
      add('dueSoon', d.n, '/learn');
    }
    if (roles.includes('TEACHER')) {
      const [r] = await this.rows(sql`SELECT count(*)::int AS n FROM submissions s JOIN assessments a ON a.id = s.assessment_id WHERE a.teacher_id = ${me} AND s.status = 'SUBMITTED'`);
      add('toMark', r.n, '/teacher');
    }
    if (roles.includes('SCHOOL_ADMIN') && this.ctx.schoolId) {
      const [r] = await this.rows(sql`SELECT count(*)::int AS n FROM license_pools WHERE school_id = ${this.ctx.schoolId} AND status = 'ACTIVE' AND valid_until BETWEEN now() AND now() + interval '30 days'`);
      add('licences', r.n, '/school');
    }
    if (roles.includes('PUBLISHER_SALES') || roles.includes('PUBLISHER_ADMIN')) {
      const mine = roles.includes('PUBLISHER_ADMIN') ? sql`TRUE` : sql`(created_by = ${me} OR demo_owner_id = ${me})`;
      const [r] = await this.rows(sql`SELECT count(*)::int AS n FROM schools WHERE is_demo AND status = 'ACTIVE' AND demo_expires_at BETWEEN now() AND now() + interval '7 days' AND ${mine}`);
      add('demos', r.n, '/admin/sales');
    }
    return { notifications: notes, unread, todo, ...(await this.photoInfo(me)) };
  }

  // ---------- the publisher's own team (super admin) ----------
  async team() {
    return this.rows(sql`SELECT u.id, u.username::text AS username, u.display_name AS "displayName", u.email::text AS email, u.status, u.last_login_at AS "lastLoginAt",
        u.issued_password AS issued, (SELECT array_agg(r.role::text) FROM user_roles r WHERE r.user_id = u.id) AS roles,
        (SELECT json_build_object('name', s.name, 'code', s.code::text, 'expiresAt', s.demo_expires_at) FROM schools s WHERE s.demo_owner_id = u.id) AS demo
      FROM users u WHERE u.school_id IS NULL ORDER BY u.status = 'ACTIVE' DESC, u.display_name`)
      .then((list) => list.map(({ issued, ...u }) => ({ ...u, password: issued ? unseal(issued) : null })));
  }
  async addStaff(d: StaffDto) {
    const [dup] = await this.rows(sql`SELECT 1 FROM users WHERE school_id IS NULL AND username = ${d.username}`);
    if (dup) throw new ConflictException(`The username “${d.username}” is already used`);
    const password = d.password || `${friendlyPassword()}!K`;
    const [u] = await this.rows(sql`INSERT INTO users (publisher_id, username, display_name, email, password_hash, issued_password, must_change_password)
      VALUES (${this.ctx.publisherId}, ${d.username}, ${d.displayName.trim()}, ${d.email?.toLowerCase() || null}, ${await hashPassword(password)}, ${seal(password)}, true) RETURNING id`);
    await this.rows(sql`INSERT INTO user_roles (user_id, role, publisher_id) VALUES (${u.id}, ${d.role}::role, ${this.ctx.publisherId})`);
    await this.audit.log('team.add', 'user', u.id, `Added ${d.displayName} (${d.username}) to the team as ${d.role.replace('PUBLISHER_', '').toLowerCase()}`);
    return { id: u.id, username: d.username, password };
  }
  private async staff(id: string) {
    const [u] = await this.rows(sql`SELECT id, display_name AS name, username::text AS username FROM users WHERE id = ${id} AND school_id IS NULL`);
    if (!u) throw new NotFoundException('Team member not found'); return u;
  }
  async resetStaff(id: string) {
    const u = await this.staff(id); const password = `${friendlyPassword()}!K`;
    await this.rows(sql`UPDATE users SET password_hash = ${await hashPassword(password)}, issued_password = ${seal(password)}, must_change_password = true, failed_logins = 0, locked_until = NULL WHERE id = ${id}`);
    await this.rows(sql`UPDATE sessions SET revoked_at = now() WHERE user_id = ${id} AND revoked_at IS NULL`);
    await this.audit.log('team.reset_password', 'user', id, `Reset the password of ${u.name}`);
    return { username: u.username, password };
  }
  async staffStatus(id: string, status: string) {
    if (id === this.ctx.userId) throw new BadRequestException('You cannot suspend your own account.');
    const u = await this.staff(id);
    await this.rows(sql`UPDATE users SET status = ${status}::account_status WHERE id = ${id}`);
    if (status === 'SUSPENDED') await this.rows(sql`UPDATE sessions SET revoked_at = now() WHERE user_id = ${id} AND revoked_at IS NULL`);
    await this.audit.log(`team.${status.toLowerCase()}`, 'user', id, `${status === 'ACTIVE' ? 'Reactivated' : 'Suspended'} ${u.name}`);
    return { status };
  }

  // ---------- a sales person's own demo school ----------
  async myDemo() {
    const me = this.ctx.userId;
    const [s] = await this.rows(sql`SELECT id, name, code::text AS code, demo_expires_at AS "expiresAt", status FROM schools WHERE demo_owner_id = ${me}`);
    const logins = s ? (await this.rows(sql`SELECT u.id, u.username::text AS username, u.display_name AS "displayName", u.issued_password AS issued, u.status,
        (SELECT r.role::text FROM user_roles r WHERE r.user_id = u.id LIMIT 1) AS role
      FROM users u WHERE u.school_id = ${s.id} ORDER BY array_position(ARRAY['SCHOOL_ADMIN','TEACHER','STUDENT','PARENT'], (SELECT r.role::text FROM user_roles r WHERE r.user_id = u.id LIMIT 1)), u.username`))
      .map(({ issued, ...u }) => ({ ...u, password: issued ? unseal(issued) : null })) : [];
    const others = await this.rows(sql`SELECT id, name, code::text AS code, demo_expires_at AS "expiresAt", status FROM schools
      WHERE is_demo AND created_by = ${me} AND demo_owner_id IS NULL ORDER BY created_at DESC LIMIT 50`);
    return { school: s ?? null, logins, others };
  }
  async createMyDemo() {
    const [has] = await this.rows(sql`SELECT 1 FROM schools WHERE demo_owner_id = ${this.ctx.userId}`);
    if (has) throw new ConflictException('You already have your demo school.');
    const [me] = await this.rows(sql`SELECT display_name FROM users WHERE id = ${this.ctx.userId}`);
    await this.schools.createDemo({ name: `Demo – ${me.display_name}`, productVersionIds: [], days: 365 }, { ownerId: this.ctx.userId });
    return this.myDemo();
  }
  async renewMyDemo() {
    const r = await this.rows(sql`UPDATE schools SET demo_expires_at = now() + interval '365 days', status = 'ACTIVE' WHERE demo_owner_id = ${this.ctx.userId} RETURNING id`);
    if (!r.length) throw new NotFoundException('You have no demo school yet.');
    await this.rows(sql`UPDATE license_pools SET valid_until = (now() + interval '365 days')::date WHERE school_id = ${r[0].id}`);
    return this.myDemo();
  }
  /** Fresh passwords for all accounts of my demo school (e.g. after a customer tried them). */
  async resetMyDemo() {
    const d = await this.myDemo(); if (!d.school) throw new NotFoundException('You have no demo school yet.');
    for (const l of d.logins) {
      const pw = friendlyPassword();
      await this.rows(sql`UPDATE users SET password_hash = ${await hashPassword(pw)}, issued_password = ${seal(pw)}, must_change_password = false, failed_logins = 0, locked_until = NULL, status = 'ACTIVE' WHERE id = ${l.id}`);
      await this.rows(sql`UPDATE sessions SET revoked_at = now() WHERE user_id = ${l.id} AND revoked_at IS NULL AND impersonator_id IS NULL`);
    }
    return this.myDemo();
  }
}

@ApiTags('people')
@Controller()
export class PeopleController {
  constructor(private readonly svc: PeopleService) {}
  @Roles(...ANY) @Get('me/photo') myPhoto(@Ctx() c: any) { return this.svc.photoInfo(c.userId); }
  @Roles(...ANY) @Post('me/photo') @HttpCode(200) setPhoto(@Ctx() c: any, @Body() d: PhotoDto) {
    if (c.impersonatorId) throw new ForbiddenException('You are signed in as this person; only they can change their photo.');
    return this.svc.setPhoto(d.image);
  }
  @Roles(...ANY) @Delete('me/photo') removePhoto(@Ctx() c: any) {
    if (c.impersonatorId) throw new ForbiddenException('You are signed in as this person; only they can change their photo.');
    return this.svc.removePhoto();
  }
  @SkipThrottle() @Roles(...ANY) @Get('users/:id/photo')
  async photo(@Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const p = await this.svc.readPhoto(id);
    res.setHeader('Content-Type', p.mime); res.setHeader('Cache-Control', 'private, max-age=604800'); res.setHeader('X-Content-Type-Options', 'nosniff');
    p.stream.on('error', () => res.destroy()).pipe(res);
  }
  @Roles(...ANY) @Get('me/welcome') welcome() { return this.svc.welcome(); }

  @Roles('PUBLISHER_ADMIN') @Get('admin/team') team() { return this.svc.team(); }
  @Roles('PUBLISHER_ADMIN') @Post('admin/team') add(@Body() d: StaffDto) { return this.svc.addStaff(d); }
  @Roles('PUBLISHER_ADMIN') @Post('admin/team/:id/reset-password') @HttpCode(200) reset(@Param('id', ParseUUIDPipe) id: string) { return this.svc.resetStaff(id); }
  @Roles('PUBLISHER_ADMIN') @Post('admin/team/:id/status') @HttpCode(200) status(@Param('id', ParseUUIDPipe) id: string, @Body() d: StatusDto) { return this.svc.staffStatus(id, d.status); }

  @Roles('PUBLISHER_SALES', 'PUBLISHER_ADMIN') @Get('sales/my-demo') myDemo() { return this.svc.myDemo(); }
  @Roles('PUBLISHER_SALES', 'PUBLISHER_ADMIN') @Post('sales/my-demo') createMyDemo() { return this.svc.createMyDemo(); }
  @Roles('PUBLISHER_SALES', 'PUBLISHER_ADMIN') @Post('sales/my-demo/renew') @HttpCode(200) renew() { return this.svc.renewMyDemo(); }
  @Roles('PUBLISHER_SALES', 'PUBLISHER_ADMIN') @Post('sales/my-demo/reset-passwords') @HttpCode(200) resetDemo() { return this.svc.resetMyDemo(); }
}

@Module({ imports: [SchoolsModule], controllers: [PeopleController], providers: [PeopleService] })
export class PeopleModule {}
