import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, count, eq, ilike, or, sql, SQL } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { qc } from '../db/qualify';
import { sessions, userRoles, users } from '../db/schema';
import { AuditService } from '../audit/audit.service';
import { hashPassword } from '../auth/password';
import { friendlyPassword, slugUser } from '../common/creds';

export type SchoolRole = 'SCHOOL_ADMIN' | 'TEACHER' | 'STUDENT';
export interface NewUser { displayName: string; username?: string; password?: string }

/** Accounts inside one school. Used by publisher staff (school setup) and by school admins. */
@Injectable()
export class SchoolUsersService {
  constructor(private readonly db: DbService, private readonly audit: AuditService) {}
  private get q() { return this.db.q; }

  private async freeUsername(schoolId: string, base: string) {
    const b = slugUser(base);
    const { rows } = await this.q.execute(sql`SELECT username::text AS u FROM users WHERE school_id = ${schoolId} AND username::text ~ ${`^${b}[0-9]*$`}`);
    const taken = new Set(rows.map((r: any) => r.u.toLowerCase()));
    if (!taken.has(b)) return b;
    for (let i = 2; ; i++) if (!taken.has(`${b}${i}`)) return `${b}${i}`;
  }

  /** Creates accounts; returns the initial passwords ONCE (they are only stored hashed). */
  async create(schoolId: string, role: SchoolRole, list: NewUser[]) {
    if (!list.length) throw new BadRequestException('Nothing to create');
    if (list.length > 1000) throw new BadRequestException('At most 1000 accounts at a time');
    const pub = this.db.ctx.publisherId;
    const out: { id: string; displayName: string; username: string; password: string }[] = [];
    const seen = new Set<string>();
    for (const u of list) {
      const displayName = u.displayName.trim();
      if (!displayName) throw new BadRequestException('Every account needs a name');
      let username = u.username?.trim().toLowerCase();
      if (username) {
        if (!/^[a-z0-9._-]{3,40}$/.test(username)) throw new BadRequestException(`Username “${username}”: 3–40 letters, digits, dot, dash or underscore`);
        const [exists] = await this.q.select({ id: users.id }).from(users).where(and(eq(users.schoolId, schoolId), eq(users.username, username)));
        if (exists || seen.has(username)) throw new ConflictException(`Username “${username}” is already used in this school`);
      } else username = await this.freeUsername(schoolId, displayName);
      seen.add(username);
      const password = u.password || friendlyPassword();
      if (password.length < 6) throw new BadRequestException('Passwords need at least 6 characters');
      const [row] = await this.q.insert(users).values({
        publisherId: pub, schoolId, username, displayName, passwordHash: await hashPassword(password), mustChangePassword: role !== 'STUDENT' && !u.password,
      }).returning({ id: users.id });
      await this.q.insert(userRoles).values({ userId: row.id, role, publisherId: pub, schoolId });
      out.push({ id: row.id, displayName, username, password });
    }
    await this.audit.log(`school.user.create`, 'school', schoolId, `Created ${out.length} ${role.toLowerCase().replace('_', ' ')} account(s)`, undefined,
      out.map(({ id, username }) => ({ id, username })), schoolId);
    return out;
  }

  /** Minimal CSV: name[,username][,password] — header optional, quotes supported. */
  parseCsv(csv: string): NewUser[] {
    const rows = csv.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((line) => {
      const cells: string[] = []; let cur = ''; let quoted = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') { if (quoted && line[i + 1] === '"') { cur += '"'; i++; } else quoted = !quoted; } else if ((ch === ',' || ch === ';' || ch === '\t') && !quoted) { cells.push(cur.trim()); cur = ''; } else cur += ch;
      }
      cells.push(cur.trim());
      return cells;
    });
    if (rows.length && /^(name|student|full ?name)$/i.test(rows[0][0])) rows.shift();
    return rows.map(([displayName, username, password]) => ({ displayName, username: username || undefined, password: password || undefined }));
  }

  async list(schoolId: string, f: { role?: SchoolRole; search?: string; page: number; pageSize: number }) {
    const w: SQL[] = [eq(users.schoolId, schoolId)];
    if (f.search) w.push(or(ilike(users.displayName, `%${f.search}%`), ilike(users.username, `%${f.search}%`))!);
    if (f.role) w.push(sql`EXISTS (SELECT 1 FROM user_roles r WHERE r.user_id = ${qc(users.id)} AND r.role = ${f.role})`);
    const where = and(...w);
    const items = await this.q.select({
      id: users.id, username: users.username, displayName: users.displayName, status: users.status, lastLoginAt: users.lastLoginAt, createdAt: users.createdAt,
      roles: sql<string[]>`(SELECT array_agg(role::text) FROM user_roles r WHERE r.user_id = ${qc(users.id)})`,
      seats: sql<number>`(SELECT count(*)::int FROM license_assignments a WHERE a.user_id = ${qc(users.id)} AND a.status = 'ACTIVE')`,
    }).from(users).where(where).orderBy(asc(users.displayName)).limit(f.pageSize).offset((f.page - 1) * f.pageSize);
    const [{ n }] = await this.q.select({ n: count() }).from(users).where(where);
    return { items, total: n, page: f.page, pageSize: f.pageSize };
  }

  private async user(schoolId: string, id: string) {
    const [u] = await this.q.select().from(users).where(and(eq(users.id, id), eq(users.schoolId, schoolId)));
    if (!u) throw new NotFoundException('Account not found in this school');
    return u;
  }

  async update(schoolId: string, id: string, d: { displayName?: string; status?: 'ACTIVE' | 'SUSPENDED' }) {
    const u = await this.user(schoolId, id);
    if (id === this.db.ctx.userId && d.status && d.status !== 'ACTIVE') throw new BadRequestException('You cannot suspend your own account.');
    await this.q.update(users).set({ ...d, updatedAt: new Date() }).where(eq(users.id, id));
    if (d.status === 'SUSPENDED') await this.q.update(sessions).set({ revokedAt: new Date() }).where(and(eq(sessions.userId, id), sql`revoked_at IS NULL`));
    await this.audit.log('school.user.update', 'user', id, `Updated account ${u.username}${d.status ? ` (${d.status.toLowerCase()})` : ''}`, { displayName: u.displayName, status: u.status }, d, schoolId);
    return { ok: true };
  }

  /**
   * Right to erasure: permanently deletes a student's account and personal data, and frees their licence seat.
   * The caller must type the student's username to confirm. The work (and the audit entry, which holds no
   * personal data) is done by the `erase_student` SECURITY DEFINER function, which re-checks who may do it.
   */
  async eraseStudent(schoolId: string, id: string, confirmUsername: string) {
    const u = await this.user(schoolId, id);
    const [{ roles }] = (await this.q.execute(sql`SELECT coalesce(array_agg(role::text), '{}') AS roles FROM user_roles WHERE user_id = ${id}`)).rows as any[];
    if (roles.length !== 1 || roles[0] !== 'STUDENT') throw new BadRequestException('Only student accounts can be erased.');
    if (confirmUsername.trim().toLowerCase() !== String(u.username).toLowerCase()) {
      throw new BadRequestException('Type the student’s username exactly to confirm.');
    }
    const { rows } = await this.q.execute(sql`SELECT erase_student(${schoolId}, ${id}, ${confirmUsername}, ${this.db.ctx.ip ?? null}) AS removed`);
    return { ok: true, removed: (rows[0] as any).removed as Record<string, number> };
  }

  async resetPassword(schoolId: string, id: string) {
    const u = await this.user(schoolId, id);
    const password = friendlyPassword();
    await this.q.update(users).set({ passwordHash: await hashPassword(password), failedLogins: 0, lockedUntil: null, updatedAt: new Date() }).where(eq(users.id, id));
    await this.q.update(sessions).set({ revokedAt: new Date() }).where(and(eq(sessions.userId, id), sql`revoked_at IS NULL`));
    await this.audit.log('school.user.reset_password', 'user', id, `Reset password of ${u.username}`, undefined, undefined, schoolId);
    return { username: u.username, password };
  }
}
