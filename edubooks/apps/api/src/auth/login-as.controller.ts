import { BadRequestException, Body, Controller, ForbiddenException, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Query, Req, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { randomBytes } from 'crypto';
import { Request, Response } from 'express';
import { sql } from 'drizzle-orm';
import { Ctx, Roles } from '../common/decorators';
import { PageQuery } from '../common/pagination';
import { DbService } from '../db/db.service';
import { AuditService } from '../audit/audit.service';
import { config } from '../config';
import { hashToken, SESSION_COOKIE } from './auth.guard';

/** Holds the super admin's own session while they are signed in as someone else. */
export const RETURN_COOKIE = 'eb_return';
const LOGIN_AS_HOURS = 2;
const ROLES = ['SCHOOL_ADMIN', 'TEACHER', 'STUDENT', 'PARENT'] as const;

class UsersQuery extends PageQuery {
  @IsUUID() schoolId!: string;
  @IsOptional() @IsIn(ROLES as unknown as string[]) role?: string;
  @IsOptional() @IsString() @MaxLength(100) search?: string;
}

const HOME: Record<string, string> = { SCHOOL_ADMIN: '/school', TEACHER: '/teacher', STUDENT: '/learn', PARENT: '/parent' };

/** Super admin → Users: browse every school's accounts by folder and sign in as any of them. */
@ApiTags('users')
@Controller()
export class LoginAsController {
  constructor(private readonly db: DbService, private readonly audit: AuditService) {}
  private async rows(q: ReturnType<typeof sql>) { return (await this.db.q.execute(q)).rows as any[]; }

  @Roles('PUBLISHER_ADMIN') @Get('admin/users/schools')
  schools() {
    return this.rows(sql`SELECT s.id, s.name, s.code::text AS code, s.city, s.status, s.is_demo AS "isDemo",
        count(DISTINCT r.user_id) FILTER (WHERE r.role = 'SCHOOL_ADMIN')::int AS admins,
        count(DISTINCT r.user_id) FILTER (WHERE r.role = 'TEACHER')::int AS teachers,
        count(DISTINCT r.user_id) FILTER (WHERE r.role = 'STUDENT')::int AS students,
        count(DISTINCT r.user_id) FILTER (WHERE r.role = 'PARENT')::int AS parents
      FROM schools s LEFT JOIN user_roles r ON r.school_id = s.id
      GROUP BY s.id ORDER BY s.status = 'ACTIVE' DESC, s.name`);
  }

  @Roles('PUBLISHER_ADMIN') @Get('admin/users')
  async users(@Query() q: UsersQuery) {
    const [school] = await this.rows(sql`SELECT id, name, code::text AS code, status FROM schools WHERE id = ${q.schoolId}`);
    if (!school) throw new NotFoundException('School not found');
    const role = q.role ?? 'STUDENT';
    const search = q.search?.trim() ? `%${q.search.trim()}%` : null;
    const where = sql`u.school_id = ${q.schoolId} AND EXISTS (SELECT 1 FROM user_roles r WHERE r.user_id = u.id AND r.role = ${role})
      ${search ? sql`AND (u.display_name ILIKE ${search} OR u.username::text ILIKE ${search} OR coalesce(u.email::text, '') ILIKE ${search})` : sql``}`;
    const items = await this.rows(sql`SELECT u.id, u.username::text AS username, u.display_name AS "displayName", u.email::text AS email, u.designation, u.status, u.last_login_at AS "lastLoginAt",
        (SELECT string_agg(c.name || CASE WHEN c.section <> '' THEN ' ' || c.section ELSE '' END, ', ') FROM enrolments e JOIN classes c ON c.id = e.class_id AND NOT c.archived WHERE e.student_id = u.id) AS classes
      FROM users u WHERE ${where} ORDER BY u.display_name LIMIT ${q.pageSize} OFFSET ${(q.page - 1) * q.pageSize}`);
    const [{ n }] = await this.rows(sql`SELECT count(*)::int AS n FROM users u WHERE ${where}`);
    return { school, role, items, total: n, page: q.page, pageSize: q.pageSize };
  }

  /** Opens a short session as the chosen school user; the super admin's own session is kept to come back to. */
  @Roles('PUBLISHER_ADMIN') @Post('admin/users/:id/login-as') @HttpCode(200)
  async loginAs(@Param('id', ParseUUIDPipe) id: string, @Ctx() ctx: any, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    if (ctx.impersonatorId) throw new BadRequestException('Go back to your own account first.');
    const own = req.cookies?.[SESSION_COOKIE];
    if (!own) throw new ForbiddenException('Sign in again first.');
    const [u] = await this.rows(sql`SELECT u.id, u.display_name AS name, u.status, s.name AS school, s.status AS "schoolStatus",
        (SELECT array_agg(role::text) FROM user_roles r WHERE r.user_id = u.id) AS roles
      FROM users u JOIN schools s ON s.id = u.school_id WHERE u.id = ${id}`);
    if (!u) throw new NotFoundException('Account not found');
    if (u.status !== 'ACTIVE') throw new BadRequestException(`${u.name}'s account is suspended. Reactivate it first.`);
    if (u.schoolStatus !== 'ACTIVE') throw new BadRequestException(`${u.school} is suspended, so nobody there can sign in.`);
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + LOGIN_AS_HOURS * 3600_000);
    await this.db.q.execute(sql`SELECT start_impersonation(${id}, ${hashToken(token)}, ${expiresAt}, ${req.ip ?? null}, ${req.headers['user-agent'] ?? ''})`);
    const role = ['SCHOOL_ADMIN', 'TEACHER', 'STUDENT', 'PARENT'].find((r) => u.roles?.includes(r)) ?? 'STUDENT';
    await this.audit.log('auth.login_as', 'user', id, `Signed in as ${u.name} (${role.toLowerCase().replace('_', ' ')}, ${u.school})`, undefined, undefined, null);
    const opts = { httpOnly: true, sameSite: 'lax' as const, secure: config.cookieSecure, path: '/' };
    res.cookie(RETURN_COOKIE, own, { ...opts, expires: new Date(Date.now() + 12 * 3600_000) });
    res.cookie(SESSION_COOKIE, token, { ...opts, expires: expiresAt });
    return { ok: true, home: HOME[role] ?? '/' };
  }

  /** Ends "Log in as" and returns to the super admin's own session. */
  @Post('auth/return') @HttpCode(200)
  async back(@Ctx() ctx: any, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    if (!ctx.impersonatorId) throw new BadRequestException('You are signed in with your own account.');
    await this.db.q.execute(sql`UPDATE sessions SET revoked_at = now() WHERE id = ${ctx.sessionId}`);
    const back = req.cookies?.[RETURN_COOKIE];
    const opts = { httpOnly: true, sameSite: 'lax' as const, secure: config.cookieSecure, path: '/' };
    res.clearCookie(RETURN_COOKIE, { path: '/' });
    if (!back) { res.clearCookie(SESSION_COOKIE, { path: '/' }); return { ok: true, home: '/login' }; }
    res.cookie(SESSION_COOKIE, back, { ...opts, expires: new Date(Date.now() + config.sessionTtlHours * 3600_000) });
    return { ok: true, home: '/admin/users' };
  }
}
