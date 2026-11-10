import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { qc } from '../db/qualify';
import { academicYears, classTeachers, classes, enrolments, grades, subjects, users } from '../db/schema';
import { AuditService } from '../audit/audit.service';
import { AccessService } from '../lms/access.service';

@Injectable()
export class ClassesService {
  constructor(private readonly db: DbService, private readonly audit: AuditService, private readonly access: AccessService) {}
  private get q() { return this.db.q; }
  private get sid() { return this.db.ctx.schoolId!; }

  async list(f: { academicYearId?: string; mine?: boolean }) {
    const w = [eq(classes.schoolId, this.sid), eq(classes.archived, false)];
    if (f.academicYearId) w.push(eq(classes.academicYearId, f.academicYearId));
    if (f.mine) {
      const ids = await this.access.teacherClassIds();
      if (!ids.length) return [];
      w.push(inArray(classes.id, ids));
    }
    return this.q.select({
      id: classes.id, name: classes.name, section: classes.section, academicYearId: classes.academicYearId, academicYear: academicYears.name,
      gradeId: classes.gradeId, gradeName: grades.name,
      students: sql<number>`(SELECT count(*)::int FROM enrolments e WHERE e.class_id = ${qc(classes.id)})`,
      teachers: sql<any[]>`(SELECT coalesce(json_agg(json_build_object('id', u.id, 'displayName', u.display_name, 'subject', s.name, 'subjectId', ct.subject_id) ORDER BY u.display_name), '[]')
        FROM class_teachers ct JOIN users u ON u.id = ct.user_id LEFT JOIN subjects s ON s.id = ct.subject_id WHERE ct.class_id = ${qc(classes.id)})`,
    }).from(classes).innerJoin(academicYears, eq(academicYears.id, classes.academicYearId)).leftJoin(grades, eq(grades.id, classes.gradeId))
      .where(and(...w)).orderBy(asc(grades.sort), asc(classes.name), asc(classes.section));
  }

  async create(d: { academicYearId: string; gradeId?: string; name: string; section?: string }) {
    const [ay] = await this.q.select().from(academicYears).where(and(eq(academicYears.id, d.academicYearId), eq(academicYears.schoolId, this.sid)));
    if (!ay) throw new BadRequestException('Choose one of your academic years');
    const [c] = await this.q.insert(classes).values({
      publisherId: this.db.ctx.publisherId, schoolId: this.sid, academicYearId: ay.id, gradeId: d.gradeId || null, name: d.name.trim(), section: (d.section ?? '').trim(),
    }).returning();
    await this.audit.log('school.class.create', 'class', c.id, `Created class ${c.name}${c.section ? ` ${c.section}` : ''} (${ay.name})`);
    return c;
  }

  async get(id: string) {
    await this.access.assertTeaches(id);
    const [c] = (await this.list({})).filter((x) => x.id === id);
    if (!c) throw new NotFoundException('Class not found');
    const roster = await this.q.select({ id: users.id, displayName: users.displayName, username: users.username, status: users.status })
      .from(enrolments).innerJoin(users, eq(users.id, enrolments.studentId)).where(eq(enrolments.classId, id)).orderBy(asc(users.displayName));
    return { ...c, roster };
  }

  async update(id: string, d: { name?: string; section?: string; gradeId?: string | null; archived?: boolean }) {
    const [c] = await this.q.select().from(classes).where(eq(classes.id, id));
    if (!c) throw new NotFoundException('Class not found');
    await this.q.update(classes).set(d).where(eq(classes.id, id));
    await this.audit.log('school.class.update', 'class', id, `Updated class ${d.name ?? c.name}`, c, d);
    return { ok: true };
  }

  async setTeachers(id: string, list: { userId: string; subjectId?: string | null }[]) {
    const [c] = await this.q.select().from(classes).where(eq(classes.id, id));
    if (!c) throw new NotFoundException('Class not found');
    const valid = await this.access.schoolUserIds(list.map((t) => t.userId), 'TEACHER');
    if (valid.length !== new Set(list.map((t) => t.userId)).size) throw new BadRequestException('Only teachers of this school can be assigned');
    await this.q.delete(classTeachers).where(eq(classTeachers.classId, id));
    if (list.length) await this.q.insert(classTeachers).values(list.map((t) => ({ classId: id, userId: t.userId, subjectId: t.subjectId || null, publisherId: c.publisherId, schoolId: c.schoolId })));
    await this.audit.log('school.class.teachers', 'class', id, `Set ${list.length} teacher(s) for ${c.name}`);
    return { ok: true };
  }

  async enrol(id: string, studentIds: string[]) {
    const [c] = await this.q.select().from(classes).where(eq(classes.id, id));
    if (!c) throw new NotFoundException('Class not found');
    const ids = [...new Set(studentIds)];
    const valid = await this.access.schoolUserIds(ids, 'STUDENT');
    if (valid.length !== ids.length) throw new BadRequestException('Only students of this school can be enrolled');
    const { rows } = await this.q.execute(sql`SELECT u.display_name AS n, c.name AS c FROM enrolments e JOIN users u ON u.id = e.student_id JOIN classes c ON c.id = e.class_id
      WHERE e.student_id IN ${ids} AND e.academic_year_id = ${c.academicYearId} AND e.class_id <> ${id}`);
    if (rows.length) throw new ConflictException(`${(rows as any[]).map((r) => `${r.n} (already in ${r.c})`).join(', ')} — a student can be in one class per academic year. Remove them there first.`);
    if (ids.length) await this.q.insert(enrolments).values(ids.map((studentId) => ({ classId: id, studentId, academicYearId: c.academicYearId, publisherId: c.publisherId, schoolId: c.schoolId })))
      .onConflictDoNothing();
    await this.audit.log('school.class.enrol', 'class', id, `Enrolled ${ids.length} student(s) in ${c.name}`);
    return { ok: true };
  }

  async unenrol(id: string, studentId: string) {
    await this.q.delete(enrolments).where(and(eq(enrolments.classId, id), eq(enrolments.studentId, studentId)));
    await this.audit.log('school.class.unenrol', 'class', id, `Removed a student from the class`, undefined, { studentId });
    return { ok: true };
  }

  /** Students of the school not yet in a class this academic year. */
  async unplaced(id: string) {
    const [c] = await this.q.select().from(classes).where(eq(classes.id, id));
    if (!c) throw new NotFoundException('Class not found');
    const { rows } = await this.q.execute(sql`SELECT u.id, u.display_name AS "displayName", u.username FROM users u JOIN user_roles r ON r.user_id = u.id AND r.role = 'STUDENT'
      WHERE u.school_id = ${this.sid} AND u.status = 'ACTIVE' AND NOT EXISTS (SELECT 1 FROM enrolments e WHERE e.student_id = u.id AND e.academic_year_id = ${c.academicYearId})
      ORDER BY u.display_name`);
    return rows;
  }
  subjects() { return this.q.select({ id: subjects.id, name: subjects.name }).from(subjects).orderBy(asc(subjects.sort)); }
  grades() { return this.q.select({ id: grades.id, name: grades.name }).from(grades).orderBy(asc(grades.sort)); }
}
