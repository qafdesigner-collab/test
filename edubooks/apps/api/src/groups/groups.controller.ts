import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Module, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsIn, IsOptional, IsString, IsUUID, Length, MaxLength } from 'class-validator';
import { sql } from 'drizzle-orm';
import { Roles } from '../common/decorators';
import { DbService } from '../db/db.service';
import { AuditService } from '../audit/audit.service';
import { AccessService } from '../lms/access.service';
import { LmsModule } from '../lms/lms.module';

const COLORS = ['violet', 'sky', 'emerald', 'amber', 'rose', 'slate'] as const;
class GroupDto {
  @IsString() @Length(1, 80) name!: string;
  @IsOptional() @IsIn(COLORS as unknown as string[]) color?: string;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(200) @IsUUID('all', { each: true }) studentIds?: string[];
}
class UpdateGroupDto {
  @IsOptional() @IsString() @Length(1, 80) name?: string;
  @IsOptional() @IsIn(COLORS as unknown as string[]) color?: string;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(200) @IsUUID('all', { each: true }) studentIds?: string[];
}
const Id = () => new ParseUUIDPipe();
const arr = (ids: string[]) => `{${ids.join(',')}}`;
type Metrics = { students: number; homeworkAverage: number | null; handedIn: number | null; examAverage: number | null; attendance: number | null; pagesRead: number | null; stars: number | null; activeWeek: number | null };

/**
 * Groups of students inside a class, and comparing classes (sections and grades) on the same measures:
 * homework average and hand-in rate, exam average, attendance, pages read, stars and who was active this week.
 */
@ApiTags('groups')
@Controller()
export class GroupsController {
  constructor(private readonly db: DbService, private readonly access: AccessService, private readonly audit: AuditService) {}
  private async rows(q: any) { return (await this.db.q.execute(q)).rows as any[]; }

  private async enrolledIn(classId: string, ids: string[]) {
    if (!ids.length) return [];
    const ok = await this.rows(sql`SELECT student_id AS id FROM enrolments WHERE class_id = ${classId} AND student_id = ANY(${arr(ids)}::uuid[])`);
    if (ok.length !== new Set(ids).size) throw new BadRequestException('Some of these students are not in this class');
    return ok.map((r) => r.id as string);
  }
  private async group(id: string) {
    const [g] = await this.rows(sql`SELECT id, class_id AS "classId", name FROM student_groups WHERE id = ${id}`);
    if (!g) throw new NotFoundException('Group not found');
    await this.access.assertTeaches(g.classId); return g;
  }

  @Roles('TEACHER', 'SCHOOL_ADMIN') @Get('classes/:id/groups')
  async list(@Param('id', Id()) classId: string) {
    await this.access.assertTeaches(classId);
    const groups = await this.rows(sql`SELECT g.id, g.name, g.color, g.note, coalesce(array_agg(m.student_id) FILTER (WHERE m.student_id IS NOT NULL), '{}') AS "studentIds"
      FROM student_groups g LEFT JOIN student_group_members m ON m.group_id = g.id WHERE g.class_id = ${classId} GROUP BY g.id ORDER BY g.created_at`);
    // how each group is doing, on the same measures as the class
    for (const g of groups) g.metrics = await this.metrics([classId], g.studentIds);
    return { groups, class: await this.metrics([classId], null) };
  }
  @Roles('TEACHER', 'SCHOOL_ADMIN') @Post('classes/:id/groups')
  async create(@Param('id', Id()) classId: string, @Body() d: GroupDto) {
    const c = await this.access.assertTeaches(classId);
    const ids = await this.enrolledIn(classId, d.studentIds ?? []);
    const [g] = await this.rows(sql`INSERT INTO student_groups (publisher_id, school_id, class_id, name, color, note, created_by)
      VALUES (${this.db.ctx.publisherId}, ${c.schoolId}, ${classId}, ${d.name.trim()}, ${d.color ?? 'violet'}, ${d.note ?? ''}, ${this.db.ctx.userId}) RETURNING id`);
    for (const s of ids) await this.db.q.execute(sql`INSERT INTO student_group_members (group_id, student_id, publisher_id, school_id) VALUES (${g.id}, ${s}, ${this.db.ctx.publisherId}, ${c.schoolId})`);
    await this.audit.log('class.group.create', 'student_group', g.id, `Group “${d.name.trim()}” with ${ids.length} student(s)`, undefined, undefined, c.schoolId);
    return { id: g.id };
  }
  @Roles('TEACHER', 'SCHOOL_ADMIN') @Patch('groups/:id')
  async update(@Param('id', Id()) id: string, @Body() d: UpdateGroupDto) {
    const g = await this.group(id);
    await this.db.q.execute(sql`UPDATE student_groups SET name = coalesce(${d.name?.trim() ?? null}, name), color = coalesce(${d.color ?? null}, color), note = coalesce(${d.note ?? null}, note), updated_at = now() WHERE id = ${id}`);
    if (d.studentIds) {
      const ids = await this.enrolledIn(g.classId, d.studentIds);
      await this.db.q.execute(sql`DELETE FROM student_group_members WHERE group_id = ${id}`);
      const [c] = await this.rows(sql`SELECT school_id AS "schoolId" FROM classes WHERE id = ${g.classId}`);
      for (const s of ids) await this.db.q.execute(sql`INSERT INTO student_group_members (group_id, student_id, publisher_id, school_id) VALUES (${id}, ${s}, ${this.db.ctx.publisherId}, ${c.schoolId})`);
    }
    return { ok: true };
  }
  @Roles('TEACHER', 'SCHOOL_ADMIN') @Delete('groups/:id')
  async remove(@Param('id', Id()) id: string) { const g = await this.group(id); await this.db.q.execute(sql`DELETE FROM student_groups WHERE id = ${id}`); await this.audit.log('class.group.delete', 'student_group', id, `Removed group “${g.name}”`); return { ok: true }; }

  // ---------- comparing sections and grades ----------
  /** The school's classes this year (teachers compare at class level only: no student names). */
  @Roles('TEACHER', 'SCHOOL_ADMIN') @Get('compare/classes')
  async compareClasses() {
    const mine = this.access.is('SCHOOL_ADMIN') ? null : await this.access.teacherClassIds();
    const list = await this.rows(sql`SELECT c.id, c.name, c.section, g.id AS "gradeId", g.name AS grade, coalesce(g.sort, 999) AS gsort
      FROM classes c LEFT JOIN grades g ON g.id = c.grade_id
      WHERE c.school_id = ${this.db.ctx.schoolId} AND NOT c.archived AND c.academic_year_id = (SELECT academic_year_id FROM classes WHERE school_id = ${this.db.ctx.schoolId} AND NOT archived GROUP BY academic_year_id ORDER BY count(*) DESC LIMIT 1)
      ORDER BY gsort, g.name, c.name, c.section`);
    return list.map((c) => ({ ...c, mine: !mine || mine.includes(c.id) }));
  }
  @Roles('TEACHER', 'SCHOOL_ADMIN') @Get('compare')
  async compare(@Query('classIds') classIdsQ: string, @Query('by') by = 'section') {
    const all = await this.compareClasses();
    const ids = String(classIdsQ ?? '').split(',').filter((x) => all.some((c) => c.id === x)).slice(0, 40);
    if (!ids.length) throw new BadRequestException('Choose classes to compare');
    if (by === 'grade') {
      const grades = [...new Map(all.filter((c) => ids.includes(c.id)).map((c) => [c.gradeId ?? 'none', c.grade ?? 'No grade'])).entries()];
      const out = [];
      for (const [gid, name] of grades) {
        const cls = all.filter((c) => ids.includes(c.id) && (c.gradeId ?? 'none') === gid);
        out.push({ key: gid, label: name, sections: cls.length, metrics: await this.metrics(cls.map((c) => c.id), null) });
      }
      return { by: 'grade', rows: out };
    }
    const out = [];
    for (const id of ids) { const c = all.find((x) => x.id === id)!; out.push({ key: id, label: `${c.name}${c.section ? ` ${c.section}` : ''}`, grade: c.grade, mine: c.mine, metrics: await this.metrics([id], null) }); }
    return { by: 'section', rows: out };
  }

  /** The measures for some classes (optionally only some of their students). Percentages 0–100. */
  private async metrics(classIds: string[], only: string[] | null): Promise<Metrics> {
    if (this.db.ctx.roles.includes('TEACHER') && !this.access.is('SCHOOL_ADMIN')) {
      // a teacher sees the measures of other classes only as totals, never student by student
      if (only && classIds.length === 1) { const mine = await this.access.teacherClassIds(); if (!mine.includes(classIds[0])) throw new ForbiddenException('You do not teach this class'); }
    }
    const ca = arr(classIds);
    const st = await this.rows(sql`SELECT e.student_id AS id FROM enrolments e JOIN users u ON u.id = e.student_id AND u.status = 'ACTIVE' WHERE e.class_id = ANY(${ca}::uuid[])`);
    const ids = st.map((r) => r.id as string).filter((x) => !only || only.includes(x));
    const empty: Metrics = { students: ids.length, homeworkAverage: null, handedIn: null, examAverage: null, attendance: null, pagesRead: null, stars: null, activeWeek: null };
    if (!ids.length) return empty;
    const ua = arr(ids);
    const [hw] = await this.rows(sql`SELECT
        round(100 * sum(s.score) FILTER (WHERE s.status IN ('GRADED','RETURNED')) / nullif(sum(s.max_score) FILTER (WHERE s.status IN ('GRADED','RETURNED')), 0))::int AS avg,
        round(100.0 * count(s.id) / nullif(count(*), 0))::int AS handed
      FROM unnest(${ua}::uuid[]) x(id) JOIN enrolments e ON e.student_id = x.id AND e.class_id = ANY(${ca}::uuid[])
      JOIN assessments a ON a.class_id = e.class_id AND a.status <> 'DRAFT' AND (a.due_at IS NULL OR a.due_at < now())
        AND (NOT EXISTS (SELECT 1 FROM assessment_students t WHERE t.assessment_id = a.id) OR EXISTS (SELECT 1 FROM assessment_students t WHERE t.assessment_id = a.id AND t.student_id = x.id))
      LEFT JOIN submissions s ON s.assessment_id = a.id AND s.student_id = x.id`);
    const [ex] = await this.rows(sql`SELECT round(100 * avg(m.marks / nullif(t.total, 0)))::int AS avg
      FROM exam_marks m JOIN exams x ON x.id = m.exam_id AND x.class_id = ANY(${ca}::uuid[])
      JOIN (SELECT exam_id, sum(marks) AS total FROM exam_items GROUP BY exam_id) t ON t.exam_id = m.exam_id
      WHERE m.student_id = ANY(${ua}::uuid[]) AND NOT m.absent AND m.marks IS NOT NULL`);
    const [at] = await this.rows(sql`SELECT round(100.0 * count(*) FILTER (WHERE status IN ('PRESENT','LATE')) / nullif(count(*), 0))::int AS rate
      FROM attendance WHERE class_id = ANY(${ca}::uuid[]) AND student_id = ANY(${ua}::uuid[]) AND day > current_date - 30`);
    const [rd] = await this.rows(sql`SELECT coalesce(sum(max_page), 0)::float AS pages FROM reader_progress WHERE user_id = ANY(${ua}::uuid[])`);
    const [sr] = await this.rows(sql`SELECT coalesce(sum(best), 0)::float AS stars FROM (SELECT student_id, activity_id, max(stars) AS best FROM game_attempts WHERE student_id = ANY(${ua}::uuid[]) GROUP BY 1, 2) t`);
    const [ac] = await this.rows(sql`SELECT count(DISTINCT user_id)::int AS n FROM user_activity WHERE user_id = ANY(${ua}::uuid[]) AND day > current_date - 7`);
    return { students: ids.length, homeworkAverage: hw?.avg ?? null, handedIn: hw?.handed ?? null, examAverage: ex?.avg ?? null, attendance: at?.rate ?? null,
      pagesRead: Math.round(Number(rd.pages) / ids.length), stars: Math.round((Number(sr.stars) / ids.length) * 10) / 10, activeWeek: Math.round((100 * Number(ac.n)) / ids.length) };
  }
}

@Module({ imports: [LmsModule], controllers: [GroupsController] })
export class GroupsModule {}
