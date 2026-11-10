import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { classTeachers, classes, enrolments } from '../db/schema';
import { LicensingService } from '../licensing/licensing.service';

/** Who may see/teach what inside a school. RLS already confines everything to the school. */
@Injectable()
export class AccessService {
  constructor(private readonly db: DbService, private readonly licensing: LicensingService) {}
  get ctx() { return this.db.ctx; }
  is(role: string) { return this.ctx.roles.includes(role); }

  async teacherClassIds(userId = this.ctx.userId) {
    return (await this.db.q.select({ id: classTeachers.classId }).from(classTeachers).where(eq(classTeachers.userId, userId))).map((r) => r.id);
  }
  async studentClassIds(userId = this.ctx.userId) {
    return (await this.db.q.select({ id: enrolments.classId }).from(enrolments).where(eq(enrolments.studentId, userId))).map((r) => r.id);
  }
  /** School admins manage every class; teachers only their own. */
  async assertTeaches(classId: string) {
    const [c] = await this.db.q.select().from(classes).where(eq(classes.id, classId));
    if (!c) throw new NotFoundException('Class not found');
    if (this.is('SCHOOL_ADMIN')) return c;
    const [t] = await this.db.q.select().from(classTeachers).where(and(eq(classTeachers.classId, classId), eq(classTeachers.userId, this.ctx.userId)));
    if (!t) throw new ForbiddenException('You do not teach this class');
    return c;
  }
  async studentIdsOf(classId: string) {
    return (await this.db.q.select({ id: enrolments.studentId }).from(enrolments).where(eq(enrolments.classId, classId))).map((r) => r.id);
  }
  /** Editions the current user may open (licence entitlements; school admins see all licensed; staff all). */
  async editions(): Promise<string[] | 'ALL'> {
    if (this.ctx.staff) return 'ALL';
    return this.licensing.entitledEditionIds(this.ctx.userId, this.is('SCHOOL_ADMIN') ? this.ctx.schoolId : null);
  }
  async assertEdition(editionId: string) {
    const eds = await this.editions();
    if (eds !== 'ALL' && !eds.includes(editionId)) throw new ForbiddenException('You do not hold a licence for this book');
  }
  async schoolUserIds(ids: string[], role: 'STUDENT' | 'TEACHER') {
    if (!ids.length) return [];
    const { rows } = await this.db.q.execute(sql`SELECT u.id FROM users u JOIN user_roles r ON r.user_id = u.id AND r.role = ${role}
      WHERE u.school_id = ${this.ctx.schoolId} AND u.id IN ${ids}`);
    return rows.map((r: any) => r.id as string);
  }
  inArray = inArray;
}
