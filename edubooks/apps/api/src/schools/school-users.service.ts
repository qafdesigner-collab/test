import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, count, eq, ilike, or, sql, SQL } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { qc } from '../db/qualify';
import { sessions, userRoles, users } from '../db/schema';
import { AuditService } from '../audit/audit.service';
import { hashPassword } from '../auth/password';
import { friendlyPassword, slugUser } from '../common/creds';

export type SchoolRole = 'SCHOOL_ADMIN' | 'TEACHER' | 'STUDENT' | 'PARENT';
export interface NewUser { displayName: string; username?: string; password?: string; phone?: string; email?: string; designation?: string }
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
    const out: { id: string; displayName: string; username: string; password: string; email?: string }[] = [];
    const seen = new Set<string>(); const seenEmail = new Set<string>();
    for (const [i, u] of list.entries()) {
      const displayName = (u.displayName ?? '').trim();
      if (!displayName) throw new BadRequestException(`Row ${i + 1}: every account needs a name`);
      const email = u.email?.trim().toLowerCase() || null;
      if (email) {
        if (!EMAIL.test(email)) throw new BadRequestException(`${displayName}: “${email}” is not a valid email`);
        const [dup] = await this.q.select({ id: users.id }).from(users).where(and(eq(users.schoolId, schoolId), eq(users.email, email)));
        if (dup || seenEmail.has(email)) throw new ConflictException(`${displayName}: the email “${email}” is already used in this school`);
        seenEmail.add(email);
      }
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
        publisherId: pub, schoolId, username, displayName, phone: u.phone?.trim() || null, email, designation: u.designation?.trim().slice(0, 80) ?? '', passwordHash: await hashPassword(password), mustChangePassword: !['STUDENT', 'PARENT'].includes(role) && !u.password,
      }).returning({ id: users.id });
      await this.q.insert(userRoles).values({ userId: row.id, role, publisherId: pub, schoolId });
      out.push({ id: row.id, displayName, username, password, ...(email ? { email } : {}) });
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
    // With a heading row, columns are matched by name (Name, Designation, Email, Phone, Username/Login ID, Password); without one: name, username, password.
    if (rows.length && /^(name|student|teacher|full ?name)$/i.test(rows[0][0])) {
      const keys = rows.shift()!.map((h) => h.toLowerCase().replace(/[^a-z]/g, ''));
      const col = (...names: string[]) => keys.findIndex((k) => names.includes(k));
      const c = { name: 0, username: col('username', 'login', 'loginid', 'id', 'userid'), password: col('password'), email: col('email', 'emailaddress', 'mail'),
        designation: col('designation', 'role', 'title', 'position', 'subject'), phone: col('phone', 'mobile', 'phonenumber', 'mobilenumber', 'whatsapp') };
      const at = (r: string[], k: number) => (k >= 0 ? r[k] || undefined : undefined);
      return rows.map((r) => ({ displayName: r[0], username: at(r, c.username), password: at(r, c.password), email: at(r, c.email), designation: at(r, c.designation), phone: at(r, c.phone) }));
    }
    return rows.map(([displayName, username, password]) => ({ displayName, username: username || undefined, password: password || undefined }));
  }

  async list(schoolId: string, f: { role?: SchoolRole; search?: string; page: number; pageSize: number }) {
    const w: SQL[] = [eq(users.schoolId, schoolId)];
    if (f.search) w.push(or(ilike(users.displayName, `%${f.search}%`), ilike(users.username, `%${f.search}%`))!);
    if (f.role) w.push(sql`EXISTS (SELECT 1 FROM user_roles r WHERE r.user_id = ${qc(users.id)} AND r.role = ${f.role})`);
    const where = and(...w);
    const items = await this.q.select({
      id: users.id, username: users.username, displayName: users.displayName, phone: users.phone, email: users.email, designation: users.designation, status: users.status, lastLoginAt: users.lastLoginAt, createdAt: users.createdAt,
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

  async update(schoolId: string, id: string, d: { displayName?: string; status?: 'ACTIVE' | 'SUSPENDED'; phone?: string; email?: string | null; designation?: string }) {
    const u = await this.user(schoolId, id);
    if (d.email !== undefined) {
      d.email = d.email?.trim().toLowerCase() || null;
      if (d.email && !EMAIL.test(d.email)) throw new BadRequestException(`“${d.email}” is not a valid email`);
      if (d.email) {
        const [dup] = await this.q.select({ id: users.id }).from(users).where(and(eq(users.schoolId, schoolId), eq(users.email, d.email), sql`${users.id} <> ${id}`));
        if (dup) throw new ConflictException(`The email “${d.email}” is already used in this school`);
      }
    }
    if (id === this.db.ctx.userId && d.status && d.status !== 'ACTIVE') throw new BadRequestException('You cannot suspend your own account.');
    await this.q.update(users).set({ ...d, updatedAt: new Date() }).where(eq(users.id, id));
    if (d.status === 'SUSPENDED') await this.q.update(sessions).set({ revokedAt: new Date() }).where(and(eq(sessions.userId, id), sql`revoked_at IS NULL`));
    await this.audit.log('school.user.update', 'user', id, `Updated account ${u.username}${d.status ? ` (${d.status.toLowerCase()})` : ''}`, { displayName: u.displayName, status: u.status }, d, schoolId);
    return { ok: true };
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
