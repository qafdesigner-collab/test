import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Injectable, Module, NotFoundException, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, Length, MaxLength } from 'class-validator';
import { sql } from 'drizzle-orm';
import { Roles } from '../common/decorators';
import { DbService } from '../db/db.service';
import { AuditService } from '../audit/audit.service';
import { SchoolUsersService } from '../schools/school-users.service';
import { LmsService } from '../lms/lms.service';
import { LmsModule } from '../lms/lms.module';
import { SchoolsModule } from '../schools/schools.module';
import { BADGES } from '../games/engines';
import { StudentImportController, StudentImportService } from './import';

class AddParentDto {
  /** Link an existing parent account (e.g. a sibling's parent) instead of creating one. */
  @IsOptional() @IsUUID() parentId?: string;
  @IsOptional() @IsString() @Length(1, 120) displayName?: string;
  @IsOptional() @IsString() @MaxLength(40) username?: string;
  @IsOptional() @IsString() @Length(6, 200) password?: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
  @IsOptional() @IsString() @MaxLength(40) relation?: string;
}

@Injectable()
export class ParentsService {
  constructor(private readonly db: DbService, private readonly audit: AuditService, private readonly users: SchoolUsersService, private readonly lms: LmsService) {}
  private get q() { return this.db.q; }
  private get school() { return this.db.ctx.schoolId!; }

  private async assertRole(userId: string, role: 'STUDENT' | 'PARENT') {
    const { rows } = await this.q.execute(sql`SELECT u.id, u.display_name AS name FROM users u JOIN user_roles r ON r.user_id = u.id AND r.role::text = ${role} WHERE u.id = ${userId} AND u.school_id = ${this.school}`);
    if (!rows.length) throw new NotFoundException(role === 'STUDENT' ? 'Student not found in this school' : 'Parent not found in this school');
    return rows[0] as { id: string; name: string };
  }

  // ---------------- school admin
  async parentsOf(studentId: string) {
    await this.assertRole(studentId, 'STUDENT');
    const { rows } = await this.q.execute(sql`SELECT u.id, u.display_name AS "displayName", u.username, u.phone, u.status, u.last_login_at AS "lastLoginAt", ps.relation
      FROM parent_students ps JOIN users u ON u.id = ps.parent_id WHERE ps.student_id = ${studentId} ORDER BY u.display_name`);
    return rows;
  }

  async add(studentId: string, d: AddParentDto) {
    const kid = await this.assertRole(studentId, 'STUDENT');
    let parentId = d.parentId; let creds: any = null;
    if (parentId) await this.assertRole(parentId, 'PARENT');
    else {
      if (!d.displayName?.trim()) throw new BadRequestException('Enter the parent’s name');
      const [u] = await this.users.create(this.school, 'PARENT', [{ displayName: d.displayName, username: d.username, password: d.password, phone: d.phone }]);
      parentId = u.id; creds = u;
    }
    await this.q.execute(sql`INSERT INTO parent_students (parent_id, student_id, publisher_id, school_id, relation)
      VALUES (${parentId}, ${studentId}, ${this.db.ctx.publisherId}, ${this.school}, ${d.relation?.trim() || 'Parent'}) ON CONFLICT DO NOTHING`);
    await this.audit.log('school.parent.link', 'user', studentId, `Linked a parent account to ${kid.name}`, undefined, { parentId }, this.school);
    return { parentId, credentials: creds };
  }

  async unlink(studentId: string, parentId: string) {
    const kid = await this.assertRole(studentId, 'STUDENT');
    const r = await this.q.execute(sql`DELETE FROM parent_students WHERE student_id = ${studentId} AND parent_id = ${parentId} RETURNING parent_id`);
    if (!r.rows.length) throw new NotFoundException('Not linked');
    await this.audit.log('school.parent.unlink', 'user', studentId, `Removed a parent link from ${kid.name}`, { parentId }, undefined, this.school);
    return { ok: true };
  }

  async list(search = '') {
    const { rows } = await this.q.execute(sql`SELECT u.id, u.display_name AS "displayName", u.username, u.phone, u.status, u.last_login_at AS "lastLoginAt",
        coalesce(json_agg(json_build_object('id', k.id, 'displayName', k.display_name, 'relation', ps.relation) ORDER BY k.display_name) FILTER (WHERE k.id IS NOT NULL), '[]') AS children
      FROM users u JOIN user_roles r ON r.user_id = u.id AND r.role::text = 'PARENT'
      LEFT JOIN parent_students ps ON ps.parent_id = u.id LEFT JOIN users k ON k.id = ps.student_id
      WHERE u.school_id = ${this.school} AND (${search} = '' OR u.display_name ILIKE ${'%' + search + '%'} OR u.username ILIKE ${'%' + search + '%'} OR u.phone ILIKE ${'%' + search + '%'})
      GROUP BY u.id ORDER BY u.display_name LIMIT 500`);
    return rows;
  }

  // ---------------- parent portal
  private async assertChild(childId: string) {
    const { rows } = await this.q.execute(sql`SELECT 1 FROM parent_students WHERE parent_id = ${this.db.ctx.userId} AND student_id = ${childId}`);
    if (!rows.length) throw new ForbiddenException('Not your child');
  }

  async children() {
    const { rows } = await this.q.execute(sql`
      SELECT k.id, k.display_name AS "displayName", ps.relation,
        (SELECT c.name || CASE WHEN c.section <> '' THEN ' — ' || c.section ELSE '' END FROM enrolments e JOIN classes c ON c.id = e.class_id
           JOIN academic_years y ON y.id = e.academic_year_id WHERE e.student_id = k.id ORDER BY y.starts_on DESC LIMIT 1) AS "className"
      FROM parent_students ps JOIN users k ON k.id = ps.student_id WHERE ps.parent_id = ${this.db.ctx.userId} AND k.status = 'ACTIVE' ORDER BY k.display_name`);
    const [school] = (await this.q.execute(sql`SELECT name, code FROM schools WHERE id = ${this.school}`)).rows as any[];
    return { school, children: rows };
  }

  async child(childId: string) {
    await this.assertChild(childId);
    const report = await this.lms.studentReport(childId);
    const { rows: [games] } = await this.q.execute(sql`
      SELECT coalesce(sum(best), 0)::int AS stars, count(*)::int AS played FROM (SELECT max(stars) AS best FROM game_attempts WHERE student_id = ${childId} GROUP BY activity_id) t`);
    const { rows: badges } = await this.q.execute(sql`SELECT badge, created_at AS "earnedAt" FROM student_badges WHERE student_id = ${childId} ORDER BY created_at DESC`);
    const { rows: reading } = await this.q.execute(sql`
      SELECT p.title AS book, c.title AS part, rp.max_page AS "pagesRead", c.page_count AS "pageCount", rp.updated_at AS "updatedAt"
      FROM reader_progress rp JOIN book_components c ON c.id = rp.component_id JOIN book_editions e ON e.id = c.edition_id JOIN book_packages p ON p.id = e.package_id
      WHERE rp.user_id = ${childId} ORDER BY rp.updated_at DESC LIMIT 20`);
    const { rows: days } = await this.q.execute(sql`
      SELECT DISTINCT d::date AS day FROM (SELECT created_at AS d FROM game_attempts WHERE student_id = ${childId}
        UNION ALL SELECT created_at FROM submissions WHERE student_id = ${childId} UNION ALL SELECT updated_at FROM reader_progress WHERE user_id = ${childId}) x
      WHERE d > now() - interval '30 days' ORDER BY 1 DESC`);
    const hasAttendance = ((await this.q.execute(sql`SELECT to_regclass('attendance') IS NOT NULL AS ok`)).rows[0] as any).ok;
    const attendance = hasAttendance
      ? (await this.q.execute(sql`SELECT status, count(*)::int AS n FROM attendance WHERE student_id = ${childId} AND day > current_date - 30 GROUP BY status`)).rows
      : null;
    return {
      student: report.student, school: report.school, class: report.class, summary: report.summary, exams: report.exams, work: report.work, evaluations: report.evaluations.map(({ mine, ...e }: any) => e), bySubject: report.bySubject,
      stars: games.stars, gamesPlayed: games.played, badges: badges.map((b: any) => ({ ...b, ...(BADGES[b.badge] ?? { label: b.badge, emoji: '🏅' }) })),
      reading, activeDays: days.map((d: any) => d.day), attendance,
    };
  }
}

@ApiTags('parents')
@Controller()
export class ParentsController {
  constructor(private readonly svc: ParentsService) {}
  @Roles('SCHOOL_ADMIN') @Get('school/parents') list(@Query('search') search?: string) { return this.svc.list((search ?? '').slice(0, 80)); }
  @Roles('SCHOOL_ADMIN') @Get('school/students/:id/parents') parentsOf(@Param('id', ParseUUIDPipe) id: string) { return this.svc.parentsOf(id); }
  @Roles('SCHOOL_ADMIN') @Post('school/students/:id/parents') add(@Param('id', ParseUUIDPipe) id: string, @Body() d: AddParentDto) { return this.svc.add(id, d); }
  @Roles('SCHOOL_ADMIN') @Delete('school/students/:id/parents/:parentId') unlink(@Param('id', ParseUUIDPipe) id: string, @Param('parentId', ParseUUIDPipe) parentId: string) { return this.svc.unlink(id, parentId); }

  @Roles('PARENT') @Get('parent/children') children() { return this.svc.children(); }
  @Roles('PARENT') @Get('parent/children/:id') child(@Param('id', ParseUUIDPipe) id: string) { return this.svc.child(id); }
}

@Module({ imports: [LmsModule, SchoolsModule], controllers: [ParentsController, StudentImportController], providers: [ParentsService, StudentImportService] })
export class ParentsModule {}
