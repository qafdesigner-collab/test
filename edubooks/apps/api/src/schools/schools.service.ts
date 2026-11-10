import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, count, desc, eq, ilike, inArray, or, sql, SQL } from 'drizzle-orm';
import { randomInt } from 'crypto';
import { DbService } from '../db/db.service';
import { qc } from '../db/qualify';
import { academicYears, productVersions, products, schools, sessions, users } from '../db/schema';
import { AuditService } from '../audit/audit.service';
import { LicensingService } from '../licensing/licensing.service';
import { SchoolUsersService } from './school-users.service';

@Injectable()
export class SchoolsService {
  constructor(private readonly db: DbService, private readonly audit: AuditService, private readonly users: SchoolUsersService, private readonly licensing: LicensingService) {}
  private get q() { return this.db.q; }

  async list(f: { search?: string; status?: string; demo?: string; page: number; pageSize: number }) {
    const w: SQL[] = [];
    if (f.search) w.push(or(ilike(schools.name, `%${f.search}%`), ilike(schools.code, `%${f.search}%`), ilike(schools.city, `%${f.search}%`))!);
    if (f.status) w.push(eq(schools.status, f.status as any));
    if (f.demo) w.push(eq(schools.isDemo, f.demo === 'true'));
    const where = w.length ? and(...w) : undefined;
    const items = await this.q.select({
      id: schools.id, name: schools.name, code: schools.code, city: schools.city, status: schools.status, isDemo: schools.isDemo, demoExpiresAt: schools.demoExpiresAt,
      createdAt: schools.createdAt,
      students: sql<number>`(SELECT count(*)::int FROM users u JOIN user_roles r ON r.user_id = u.id AND r.role = 'STUDENT' WHERE u.school_id = ${qc(schools.id)})`,
      teachers: sql<number>`(SELECT count(*)::int FROM users u JOIN user_roles r ON r.user_id = u.id AND r.role = 'TEACHER' WHERE u.school_id = ${qc(schools.id)})`,
      seats: sql<number>`(SELECT coalesce(sum(quantity),0)::int FROM license_pools p WHERE p.school_id = ${qc(schools.id)} AND p.status = 'ACTIVE' AND p.valid_until > now() AND p.seat_type = 'STUDENT')`,
      assigned: sql<number>`(SELECT count(*)::int FROM license_assignments a JOIN license_pools p ON p.id = a.pool_id
        WHERE a.school_id = ${qc(schools.id)} AND a.status = 'ACTIVE' AND p.status = 'ACTIVE' AND p.valid_until > now() AND p.seat_type = 'STUDENT')`,
    }).from(schools).where(where).orderBy(asc(schools.name)).limit(f.pageSize).offset((f.page - 1) * f.pageSize);
    const [{ n }] = await this.q.select({ n: count() }).from(schools).where(where);
    return { items, total: n, page: f.page, pageSize: f.pageSize };
  }

  async create(d: { name: string; code: string; city?: string; phone?: string; address?: string; adminName: string; adminUsername: string; adminPassword: string }) {
    const code = d.code.toUpperCase();
    const [dup] = await this.q.execute(sql`SELECT 1 FROM schools WHERE code = ${code}`).then((r) => r.rows);
    if (dup) throw new ConflictException(`School code ${code} is already taken`);
    const [s] = await this.q.insert(schools).values({
      publisherId: this.db.ctx.publisherId, name: d.name.trim(), code, city: d.city, phone: d.phone, address: d.address, createdBy: this.db.ctx.userId,
    }).returning();
    const [admin] = await this.users.create(s.id, 'SCHOOL_ADMIN', [{ displayName: d.adminName, username: d.adminUsername, password: d.adminPassword }]);
    await this.audit.log('school.create', 'school', s.id, `Registered school ${s.name} (${code})`, undefined, s, s.id);
    return { ...s, admin: { username: admin.username } };
  }

  async get(id: string) {
    const [s] = await this.q.select().from(schools).where(eq(schools.id, id));
    if (!s) throw new NotFoundException('School not found');
    const years = await this.q.select().from(academicYears).where(eq(academicYears.schoolId, id)).orderBy(desc(academicYears.startsOn));
    const admins = await this.q.select({ id: users.id, username: users.username, displayName: users.displayName, status: users.status, lastLoginAt: users.lastLoginAt })
      .from(users).where(and(eq(users.schoolId, id), sql`EXISTS (SELECT 1 FROM user_roles r WHERE r.user_id = ${qc(users.id)} AND r.role = 'SCHOOL_ADMIN')`));
    const roleCounts = await this.q.execute(sql`SELECT r.role::text AS role, count(*)::int AS n FROM users u JOIN user_roles r ON r.user_id = u.id WHERE u.school_id = ${id} GROUP BY r.role`);
    const licences = await this.licensing.dashboard(id);
    return { ...s, academicYears: years, admins, counts: Object.fromEntries(roleCounts.rows.map((r: any) => [r.role, r.n])), licences };
  }

  async update(id: string, d: { name?: string; city?: string; phone?: string; address?: string }) {
    const [before] = await this.q.select().from(schools).where(eq(schools.id, id));
    if (!before) throw new NotFoundException('School not found');
    const [row] = await this.q.update(schools).set({ ...d, updatedAt: new Date() }).where(eq(schools.id, id)).returning();
    await this.audit.log('school.update', 'school', id, `Updated profile of ${row.name}`, before, row, id);
    return row;
  }

  async setStatus(id: string, status: 'ACTIVE' | 'SUSPENDED', reason?: string) {
    const [s] = await this.q.select().from(schools).where(eq(schools.id, id));
    if (!s) throw new NotFoundException('School not found');
    await this.q.update(schools).set({ status, updatedAt: new Date() }).where(eq(schools.id, id));
    // Session lookups already refuse suspended schools; revoking also cleans up existing sessions.
    if (status === 'SUSPENDED') await this.q.execute(sql`UPDATE sessions SET revoked_at = now() WHERE revoked_at IS NULL AND user_id IN (SELECT id FROM users WHERE school_id = ${id})`);
    await this.audit.log(status === 'SUSPENDED' ? 'school.suspend' : 'school.reactivate', 'school', id, `${status === 'SUSPENDED' ? 'Suspended' : 'Reactivated'} ${s.name}${reason ? `: ${reason}` : ''}`, undefined, undefined, id);
    return { ok: true };
  }

  async addAcademicYear(schoolId: string, d: { name: string; startsOn: string; endsOn: string }) {
    const [s] = await this.q.select().from(schools).where(eq(schools.id, schoolId));
    if (!s) throw new NotFoundException('School not found');
    const startsOn = new Date(d.startsOn); const endsOn = new Date(d.endsOn);
    if (!(endsOn > startsOn)) throw new BadRequestException('The end date must be after the start date');
    if (endsOn.getTime() - startsOn.getTime() > 400 * 864e5) throw new BadRequestException('An academic year can be at most ~13 months long');
    const [y] = await this.q.insert(academicYears).values({ publisherId: s.publisherId, schoolId, name: d.name.trim(), startsOn, endsOn }).returning();
    await this.audit.log('school.academic_year.create', 'school', schoolId, `Added academic year ${y.name}`, undefined, y, schoolId);
    return y;
  }

  async resetAdminPassword(schoolId: string, userId: string) { return this.users.resetPassword(schoolId, userId); }

  /**
   * Sales demo: a ready-to-use trial school. Trial seats come from a TRIAL adjustment (traceable licence source),
   * logins are generated and returned once, and the school stops working at the demo expiry date.
   */
  async createDemo(d: { name: string; city?: string; contact?: string; productVersionIds: string[]; days: number }) {
    const vs = await this.q.select({ id: productVersions.id, status: productVersions.status, name: products.name }).from(productVersions)
      .innerJoin(products, eq(products.id, productVersions.productId)).where(inArray(productVersions.id, d.productVersionIds));
    if (!vs.length || vs.length !== new Set(d.productVersionIds).size || vs.some((v) => v.status !== 'ACTIVE')) throw new BadRequestException('Choose active products to demo');
    let code: string;
    do { code = `DEMO${randomInt(10000, 99999)}`; } while ((await this.q.execute(sql`SELECT 1 FROM schools WHERE code = ${code}`)).rows.length);
    const expires = new Date(Date.now() + d.days * 864e5);
    const [s] = await this.q.insert(schools).values({
      publisherId: this.db.ctx.publisherId, name: d.name.trim(), code, city: d.city, phone: d.contact, isDemo: true, demoExpiresAt: expires, createdBy: this.db.ctx.userId,
    }).returning();
    const [ay] = await this.q.insert(academicYears).values({ publisherId: s.publisherId, schoolId: s.id, name: `Trial ${new Date().toISOString().slice(0, 10)}`, startsOn: new Date(), endsOn: expires }).returning();
    const logins = [
      ...(await this.users.create(s.id, 'SCHOOL_ADMIN', [{ displayName: 'Principal (demo)', username: 'principal' }])).map((x) => ({ ...x, role: 'School admin' })),
      ...(await this.users.create(s.id, 'TEACHER', [{ displayName: 'Demo Teacher', username: 'teacher' }])).map((x) => ({ ...x, role: 'Teacher' })),
      ...(await this.users.create(s.id, 'STUDENT', [{ displayName: 'Demo Student 1', username: 'student1' }, { displayName: 'Demo Student 2', username: 'student2' }])).map((x) => ({ ...x, role: 'Student' })),
    ];
    const teacher = logins.find((l) => l.role === 'Teacher')!; const students = logins.filter((l) => l.role === 'Student');
    for (const v of vs) {
      for (const [seatType, quantity, holders] of [['STUDENT', 5, students], ['TEACHER', 1, [teacher]]] as const) {
        const { poolId } = await this.licensing.createAdjustment({ schoolId: s.id, academicYearId: ay.id, productVersionId: v.id, seatType, quantity, kind: 'TRIAL',
          reason: `Sales demo for ${s.name}`, validUntil: expires.toISOString() });
        await this.licensing.assign(poolId, holders.map((h) => h.id));
      }
    }
    await this.audit.log('school.demo.create', 'school', s.id, `Created demo school ${s.name} (${code}) until ${expires.toISOString().slice(0, 10)} with ${vs.map((v) => v.name).join(', ')}`, undefined, undefined, s.id);
    return { schoolId: s.id, code, expiresAt: expires, logins: logins.map(({ role, displayName, username, password }) => ({ role, displayName, username, password })) };
  }

  async convertDemo(id: string) {
    const [s] = await this.q.select().from(schools).where(eq(schools.id, id));
    if (!s) throw new NotFoundException('School not found');
    if (!s.isDemo) throw new ConflictException('This school is already a customer.');
    await this.q.update(schools).set({ isDemo: false, demoExpiresAt: null, updatedAt: new Date() }).where(eq(schools.id, id));
    await this.audit.log('school.demo.convert', 'school', id, `Converted demo ${s.name} into a customer school (trial seats keep their own expiry)`, undefined, undefined, id);
    return { ok: true };
  }

  async extendDemo(id: string, days: number) {
    const [s] = await this.q.select().from(schools).where(eq(schools.id, id));
    if (!s?.isDemo) throw new ConflictException('Not a demo school');
    const base = Math.max(Date.now(), s.demoExpiresAt?.getTime() ?? 0);
    const until = new Date(base + days * 864e5);
    await this.q.update(schools).set({ demoExpiresAt: until }).where(eq(schools.id, id));
    await this.audit.log('school.demo.extend', 'school', id, `Extended demo until ${until.toISOString().slice(0, 10)} (trial licences are not extended automatically)`, undefined, undefined, id);
    return { demoExpiresAt: until };
  }
}
