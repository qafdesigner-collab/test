import { BadRequestException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { and, eq, isNull, ne, sql } from 'drizzle-orm';
import { DbService, TenantCtx } from '../db/db.service';
import { sessions, userRoles, users } from '../db/schema';
import { AuditService } from '../audit/audit.service';
import { config } from '../config';
import { dummyHash, hashPassword, verifyPassword } from './password';
import { hashToken, STAFF_ROLES } from './auth.guard';

@Injectable()
export class AuthService {
  constructor(private readonly db: DbService, private readonly audit: AuditService) {}

  async login(schoolCode: string | undefined, username: string, password: string, ip?: string, userAgent?: string) {
    const { rows } = await this.db.root.execute(sql`SELECT * FROM auth_find_login(${schoolCode?.trim() || ''}, ${username.trim()})`);
    const u = rows.length === 1 ? (rows[0] as any) : null;
    const ok = await verifyPassword(u?.password_hash ?? (await dummyHash()), password);
    if (!u || !ok) throw new UnauthorizedException('Wrong school code, username or password');
    if (u.school_id && u.school_status !== 'ACTIVE') throw new ForbiddenException('This school account is suspended. Please contact the publisher.');
    if (u.user_status !== 'ACTIVE') throw new ForbiddenException('This account is not active.');

    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + config.sessionTtlHours * 3600_000);
    const base: TenantCtx = { userId: u.user_id, publisherId: u.publisher_id, schoolId: u.school_id, roles: [], staff: false, ip };
    await this.db.withContext(base, async () => {
      const roles = (await this.db.q.select({ role: userRoles.role }).from(userRoles).where(eq(userRoles.userId, u.user_id))).map((r) => r.role);
      if (!roles.length) throw new ForbiddenException('This account has no role assigned.');
      base.roles = roles; base.staff = roles.some((r) => STAFF_ROLES.includes(r));
      await this.db.refreshContext();
      await this.db.q.insert(sessions).values({ userId: u.user_id, tokenHash: hashToken(token), expiresAt, ip, userAgent: userAgent?.slice(0, 300) });
      await this.db.q.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, u.user_id));
      await this.audit.log('auth.login', 'user', u.user_id, 'Signed in');
    });
    return { token, expiresAt };
  }

  async logout(ctx: TenantCtx & { sessionId?: string }) {
    if (ctx.sessionId) await this.db.q.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, ctx.sessionId));
  }

  async changePassword(ctx: TenantCtx & { sessionId?: string }, current: string, next: string) {
    const [u] = await this.db.q.select().from(users).where(eq(users.id, ctx.userId));
    if (!u || !(await verifyPassword(u.passwordHash, current))) throw new BadRequestException('Current password is wrong');
    if (current === next) throw new BadRequestException('Choose a different password');
    await this.db.q.update(users).set({ passwordHash: await hashPassword(next), mustChangePassword: false, updatedAt: new Date() }).where(eq(users.id, ctx.userId));
    // Sign out every other device.
    await this.db.q.update(sessions).set({ revokedAt: new Date() })
      .where(and(eq(sessions.userId, ctx.userId), isNull(sessions.revokedAt), ne(sessions.id, ctx.sessionId ?? '00000000-0000-0000-0000-000000000000')));
    await this.audit.log('auth.password_changed', 'user', ctx.userId, 'Changed password');
  }
}
