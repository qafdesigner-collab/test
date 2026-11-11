import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Injectable, Module, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiTags, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Length, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { sql } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { Roles } from '../common/decorators';
import { AccessService } from '../lms/access.service';
import { LmsModule } from '../lms/lms.module';

const Id = () => new ParseUUIDPipe();
const TYPES = ['MCQ', 'TRUE_FALSE', 'FILL_BLANK', 'SHORT', 'LONG'] as const;
const arr = (ids: string[]) => `{${ids.join(',')}}`;

class ExamDto {
  @IsUUID() classId!: string;
  @IsString() @Length(2, 160) title!: string;
  @IsOptional() @IsUUID() subjectId?: string | null;
  @IsOptional() @IsUUID() editionId?: string | null;
  @IsOptional() @IsString() @MaxLength(60) term?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) examDate?: string | null;
  @IsOptional() @IsInt() @Min(5) @Max(600) durationMin?: number;
  @IsOptional() @IsString() @MaxLength(2000) instructions?: string;
}
class UpdateExamDto extends PartialType(ExamDto) { @IsOptional() @IsIn(['DRAFT', 'READY']) status?: 'DRAFT' | 'READY'; }
class ItemDto {
  @IsOptional() @IsString() @MaxLength(60) section?: string;
  @IsIn(TYPES as unknown as string[]) type!: (typeof TYPES)[number];
  @IsString() @Length(1, 2000) prompt!: string;
  @IsOptional() @IsArray() @ArrayMaxSize(6) @IsString({ each: true }) @MaxLength(300, { each: true }) options?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(10) answer?: unknown[];
  @Type(() => Number) @IsNumber() @Min(0.5) @Max(100) marks!: number;
  @IsOptional() @IsInt() @Min(0) @Max(40) lines?: number;
}
class ItemsDto { @IsArray() @ArrayMaxSize(150) @ValidateNested({ each: true }) @Type(() => ItemDto) items!: ItemDto[]; }
class FromBankDto {
  @IsArray() @ArrayMaxSize(100) @IsUUID('all', { each: true }) questionIds!: string[];
  @IsOptional() @IsString() @MaxLength(60) section?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0.5) @Max(100) marks?: number;
}
class GenerateDto {
  @IsOptional() @IsUUID() editionId?: string; @IsOptional() @IsUUID() lessonId?: string;
  @IsArray() @ArrayMaxSize(5) @ValidateNested({ each: true }) @Type(() => GenPart) parts!: GenPart[];
}
class GenPart {
  @IsIn(['MCQ', 'TRUE_FALSE', 'FILL_BLANK', 'SHORT']) type!: string;
  @IsInt() @Min(1) @Max(50) count!: number;
  @Type(() => Number) @IsNumber() @Min(0.5) @Max(100) marks!: number;
  @IsOptional() @IsString() @MaxLength(60) section?: string;
}
class MarkDto { @IsUUID() studentId!: string; @IsOptional() @Type(() => Number) @IsNumber() @Min(0) marks?: number | null; @IsOptional() @IsBoolean() absent?: boolean; @IsOptional() @IsString() @MaxLength(300) remarks?: string; }
class MarksDto { @IsArray() @ArrayMaxSize(300) @ValidateNested({ each: true }) @Type(() => MarkDto) marks!: MarkDto[]; }

@Injectable()
export class ExamsService {
  constructor(private readonly db: DbService, private readonly access: AccessService, private readonly audit: AuditService, private readonly notifications: NotificationsService) {}
  private get ctx() { return this.db.ctx; }
  private async rows(s: ReturnType<typeof sql>) { return (await this.db.q.execute(s)).rows as any[]; }
  private async one(s: ReturnType<typeof sql>) { return (await this.rows(s))[0]; }

  private async exam(id: string) {
    const e = await this.one(sql`SELECT e.*, (SELECT coalesce(sum(marks), 0) FROM exam_items i WHERE i.exam_id = e.id)::float AS total FROM exams e WHERE e.id = ${id}`);
    if (!e) throw new NotFoundException('Exam not found');
    await this.access.assertTeaches(e.class_id);
    return e;
  }
  private editable(e: any) { if (e.status === 'PUBLISHED') throw new BadRequestException('Results are published. Unpublish them before changing the paper.'); }

  async list(classId?: string) {
    const classIds = this.access.is('SCHOOL_ADMIN') ? null : await this.access.teacherClassIds();
    if (classIds && !classIds.length) return [];
    return this.rows(sql`SELECT e.id, e.title, e.term, e.exam_date AS "examDate", e.duration_min AS "durationMin", e.status, e.class_id AS "classId", c.name AS "className", c.section,
        s.name AS subject, (SELECT count(*) FROM exam_items i WHERE i.exam_id = e.id)::int AS questions,
        (SELECT coalesce(sum(marks), 0) FROM exam_items i WHERE i.exam_id = e.id)::float AS total,
        (SELECT count(*) FROM exam_marks m WHERE m.exam_id = e.id AND (m.marks IS NOT NULL OR m.absent))::int AS marked,
        (SELECT count(*) FROM enrolments en WHERE en.class_id = e.class_id)::int AS students
      FROM exams e JOIN classes c ON c.id = e.class_id LEFT JOIN subjects s ON s.id = e.subject_id
      WHERE ${classId ? sql`e.class_id = ${classId}` : sql`true`} AND ${classIds ? sql`e.class_id = ANY(${arr(classIds)}::uuid[])` : sql`true`}
      ORDER BY e.exam_date DESC NULLS FIRST, e.created_at DESC`);
  }

  async create(d: ExamDto) {
    await this.access.assertTeaches(d.classId);
    const e = await this.one(sql`INSERT INTO exams (publisher_id, school_id, class_id, subject_id, edition_id, created_by, title, term, exam_date, duration_min, instructions)
      VALUES (${this.ctx.publisherId}, ${this.ctx.schoolId}, ${d.classId}, ${d.subjectId ?? null}, ${d.editionId ?? null}, ${this.ctx.userId}, ${d.title.trim()}, ${d.term ?? ''},
        ${d.examDate ?? null}, ${d.durationMin ?? 60}, ${d.instructions ?? 'Answer all questions. Write neatly.'}) RETURNING id`);
    await this.audit.log('school.exam.create', 'exam', e.id, `Created exam ${d.title.trim()}`);
    return e;
  }

  async get(id: string) {
    const e = await this.exam(id);
    const items = await this.rows(sql`SELECT id, section, position, type, prompt, options, answer, marks::float AS marks, lines FROM exam_items WHERE exam_id = ${id} ORDER BY section, position`);
    const meta = await this.one(sql`SELECT c.name AS "className", c.section AS "classSection", s.name AS subject, sc.name AS school, y.name AS "academicYear"
      FROM classes c JOIN schools sc ON sc.id = c.school_id JOIN academic_years y ON y.id = c.academic_year_id LEFT JOIN subjects s ON s.id = ${e.subject_id} WHERE c.id = ${e.class_id}`);
    return { id: e.id, classId: e.class_id, subjectId: e.subject_id, editionId: e.edition_id, title: e.title, term: e.term, examDate: e.exam_date, durationMin: e.duration_min,
      instructions: e.instructions, status: e.status, total: e.total, ...meta, items };
  }

  async update(id: string, d: UpdateExamDto) {
    const e = await this.exam(id);
    if (d.classId && d.classId !== e.class_id) { await this.access.assertTeaches(d.classId); if ((await this.one(sql`SELECT 1 FROM exam_marks WHERE exam_id = ${id} LIMIT 1`))) throw new BadRequestException('Marks are entered for this class; the class cannot change'); }
    if (d.status === 'DRAFT' || d.status === 'READY') this.editable(e);
    await this.db.q.execute(sql`UPDATE exams SET class_id = coalesce(${d.classId ?? null}, class_id), title = coalesce(${d.title?.trim() ?? null}, title),
      subject_id = ${d.subjectId !== undefined ? d.subjectId : e.subject_id}, edition_id = ${d.editionId !== undefined ? d.editionId : e.edition_id},
      term = coalesce(${d.term ?? null}, term), exam_date = ${d.examDate !== undefined ? d.examDate : e.exam_date}, duration_min = coalesce(${d.durationMin ?? null}::int, duration_min),
      instructions = coalesce(${d.instructions ?? null}, instructions), status = coalesce(${d.status ?? null}, status), updated_at = now() WHERE id = ${id}`);
    return this.get(id);
  }

  async remove(id: string) {
    const e = await this.exam(id);
    if ((await this.one(sql`SELECT 1 FROM exam_marks WHERE exam_id = ${id} AND (marks IS NOT NULL OR absent) LIMIT 1`))) throw new BadRequestException('Marks are already entered for this exam');
    await this.db.q.execute(sql`DELETE FROM exams WHERE id = ${id}`);
    await this.audit.log('school.exam.delete', 'exam', id, `Deleted exam ${e.title}`);
    return { ok: true };
  }

  private checkItem(i: ItemDto, n: number) {
    const opts = i.options ?? []; const ans = i.answer ?? [];
    if (i.type === 'MCQ' && (opts.length < 2 || typeof ans[0] !== 'number' || (ans[0] as number) >= opts.length)) throw new BadRequestException(`Question ${n}: give at least two choices and mark the right one`);
    if (i.type === 'TRUE_FALSE' && typeof ans[0] !== 'boolean') throw new BadRequestException(`Question ${n}: choose true or false as the answer`);
  }

  /** Replace the whole paper (the editor saves it in one go). */
  async setItems(id: string, d: ItemsDto) {
    const e = await this.exam(id); this.editable(e);
    d.items.forEach((i, n) => this.checkItem(i, n + 1));
    await this.db.q.execute(sql`DELETE FROM exam_items WHERE exam_id = ${id}`);
    let pos = 0;
    for (const i of d.items) {
      await this.db.q.execute(sql`INSERT INTO exam_items (publisher_id, school_id, exam_id, section, position, type, prompt, options, answer, marks, lines)
        VALUES (${this.ctx.publisherId}, ${this.ctx.schoolId}, ${id}, ${(i.section ?? 'A').trim() || 'A'}, ${pos++}, ${i.type}, ${i.prompt.trim()},
          ${JSON.stringify(i.type === 'MCQ' ? i.options ?? [] : [])}::jsonb, ${JSON.stringify(i.answer ?? [])}::jsonb, ${i.marks},
          ${i.lines ?? (i.type === 'LONG' ? 8 : i.type === 'SHORT' ? 3 : 0)})`);
    }
    await this.db.q.execute(sql`UPDATE exams SET updated_at = now() WHERE id = ${id}`);
    return this.get(id);
  }

  private visibleBank() { return sql`(q.shared OR q.owner_id = ${this.ctx.userId})`; }

  async fromBank(id: string, d: FromBankDto) {
    const e = await this.exam(id); this.editable(e);
    const qs = await this.rows(sql`SELECT q.id, q.type, q.prompt, q.options, q.answer FROM question_bank q WHERE q.id = ANY(${arr(d.questionIds)}::uuid[]) AND ${this.visibleBank()}`);
    if (qs.length !== d.questionIds.length) throw new BadRequestException('Some questions were not found');
    return this.append(id, qs.map((q) => ({ ...q, section: d.section, marks: d.marks ?? 1 })));
  }

  /** Pick random questions from the bank by type, e.g. 10 MCQ × 1 mark + 5 short × 2 marks. */
  async generate(id: string, d: GenerateDto) {
    const e = await this.exam(id); this.editable(e);
    const editionId = d.editionId ?? e.edition_id;
    const picked: any[] = []; const short: string[] = [];
    for (const p of d.parts) {
      const qs = await this.rows(sql`SELECT q.id, q.type, q.prompt, q.options, q.answer FROM question_bank q WHERE q.type = ${p.type} AND ${this.visibleBank()}
        AND ${editionId ? sql`q.edition_id = ${editionId}` : sql`true`} AND ${d.lessonId ? sql`q.lesson_id = ${d.lessonId}` : sql`true`} ORDER BY random() LIMIT ${p.count}`);
      if (qs.length < p.count) short.push(`${p.type.replace('_', ' ').toLowerCase()}: ${qs.length} of ${p.count}`);
      picked.push(...qs.map((q) => ({ ...q, section: p.section, marks: p.marks })));
    }
    if (!picked.length) throw new BadRequestException('No matching questions in the question bank for this book');
    const res = await this.append(id, picked);
    return { ...res, notEnough: short };
  }

  private async append(id: string, qs: { type: string; prompt: string; options: any; answer: any; section?: string; marks: number }[]) {
    const { n } = await this.one(sql`SELECT coalesce(max(position), -1) + 1 AS n FROM exam_items WHERE exam_id = ${id}`);
    let pos = Number(n);
    for (const q of qs) {
      const sec = (q.section ?? '').trim() || ({ MCQ: 'A', TRUE_FALSE: 'A', FILL_BLANK: 'B', SHORT: 'C' } as any)[q.type] || 'A';
      await this.db.q.execute(sql`INSERT INTO exam_items (publisher_id, school_id, exam_id, section, position, type, prompt, options, answer, marks, lines)
        VALUES (${this.ctx.publisherId}, ${this.ctx.schoolId}, ${id}, ${sec}, ${pos++}, ${q.type}, ${q.prompt}, ${JSON.stringify(q.options ?? [])}::jsonb,
          ${JSON.stringify(q.answer ?? [])}::jsonb, ${q.marks}, ${q.type === 'SHORT' ? 3 : 0})`);
    }
    return this.get(id);
  }

  // ------------------------------------------------------------ marks
  async marks(id: string) {
    const e = await this.exam(id);
    const roster = await this.rows(sql`SELECT u.id, u.display_name AS "displayName", u.username, m.marks::float AS marks, coalesce(m.absent, false) AS absent, coalesce(m.remarks, '') AS remarks
      FROM enrolments en JOIN users u ON u.id = en.student_id LEFT JOIN exam_marks m ON m.exam_id = ${id} AND m.student_id = u.id
      WHERE en.class_id = ${e.class_id} AND u.status = 'ACTIVE' ORDER BY u.display_name`);
    const got = roster.filter((r) => r.marks !== null && !r.absent).map((r) => r.marks);
    return { id: e.id, title: e.title, total: e.total, status: e.status, roster,
      stats: got.length ? { count: got.length, average: Math.round((got.reduce((a, b) => a + b, 0) / got.length) * 10) / 10, highest: Math.max(...got), lowest: Math.min(...got) } : null };
  }

  async saveMarks(id: string, d: MarksDto) {
    const e = await this.exam(id);
    if (!e.total) throw new BadRequestException('Add questions to the paper first, so the total is known');
    const enrolled = new Set(await this.access.studentIdsOf(e.class_id));
    for (const m of d.marks) {
      if (!enrolled.has(m.studentId)) throw new BadRequestException('Some students are not in this class');
      if (m.marks !== null && m.marks !== undefined && m.marks > e.total) throw new BadRequestException(`Marks cannot be more than the total (${e.total})`);
    }
    for (const m of d.marks) {
      await this.db.q.execute(sql`INSERT INTO exam_marks (exam_id, student_id, publisher_id, school_id, marks, absent, remarks, entered_by)
        VALUES (${id}, ${m.studentId}, ${this.ctx.publisherId}, ${this.ctx.schoolId}, ${m.absent ? null : m.marks ?? null}, ${!!m.absent}, ${m.remarks ?? ''}, ${this.ctx.userId})
        ON CONFLICT (exam_id, student_id) DO UPDATE SET marks = excluded.marks, absent = excluded.absent, remarks = excluded.remarks, entered_by = excluded.entered_by, updated_at = now()`);
    }
    return this.marks(id);
  }

  /** Publishing makes results visible on report cards and to pupils and parents (who are told). */
  async publish(id: string, on: boolean) {
    const e = await this.exam(id);
    if (on) {
      const m = await this.one(sql`SELECT count(*)::int AS n FROM exam_marks WHERE exam_id = ${id} AND (marks IS NOT NULL OR absent)`);
      if (!m.n) throw new BadRequestException('Enter some marks first');
    }
    await this.db.q.execute(sql`UPDATE exams SET status = ${on ? 'PUBLISHED' : 'READY'}, results_published_at = ${on ? new Date() : null}, updated_at = now() WHERE id = ${id}`);
    await this.audit.log(on ? 'school.exam.publish' : 'school.exam.unpublish', 'exam', id, `${on ? 'Published' : 'Withdrew'} results of ${e.title}`);
    if (on && e.status !== 'PUBLISHED') {
      const kids = await this.rows(sql`SELECT student_id FROM exam_marks WHERE exam_id = ${id} AND marks IS NOT NULL`);
      const ids = kids.map((k) => k.student_id);
      if (ids.length) {
        const parents = await this.rows(sql`SELECT DISTINCT u.id, u.phone FROM parent_students ps JOIN users u ON u.id = ps.parent_id WHERE ps.student_id = ANY(${arr(ids)}::uuid[]) AND u.status = 'ACTIVE'`);
        await this.notifications.notify(ids.map((x) => ({ id: x })), { kind: 'EXAM', title: `Exam results: ${e.title}`, body: 'Your marks are ready.', link: '/learn/me' });
        if (parents.length) await this.notifications.notify(parents, { kind: 'EXAM', title: `Exam results: ${e.title}`, body: 'Results are ready in the parent portal.', link: '/parent' }, { phone: true });
      }
    }
    return this.get(id);
  }
}

const T = ['SCHOOL_ADMIN', 'TEACHER'];
@ApiTags('exams')
@Controller('exams')
export class ExamsController {
  constructor(private readonly svc: ExamsService) {}
  @Roles(...T) @Get() list(@Query('classId', new ParseUUIDPipe({ optional: true })) classId?: string) { return this.svc.list(classId); }
  @Roles(...T) @Post() create(@Body() d: ExamDto) { return this.svc.create(d); }
  @Roles(...T) @Get(':id') get(@Param('id', Id()) id: string) { return this.svc.get(id); }
  @Roles(...T) @Patch(':id') update(@Param('id', Id()) id: string, @Body() d: UpdateExamDto) { return this.svc.update(id, d); }
  @Roles(...T) @Delete(':id') remove(@Param('id', Id()) id: string) { return this.svc.remove(id); }
  @Roles(...T) @Put(':id/items') items(@Param('id', Id()) id: string, @Body() d: ItemsDto) { return this.svc.setItems(id, d); }
  @Roles(...T) @Post(':id/from-bank') fromBank(@Param('id', Id()) id: string, @Body() d: FromBankDto) { return this.svc.fromBank(id, d); }
  @Roles(...T) @Post(':id/generate') generate(@Param('id', Id()) id: string, @Body() d: GenerateDto) { return this.svc.generate(id, d); }
  @Roles(...T) @Get(':id/marks') marks(@Param('id', Id()) id: string) { return this.svc.marks(id); }
  @Roles(...T) @Put(':id/marks') saveMarks(@Param('id', Id()) id: string, @Body() d: MarksDto) { return this.svc.saveMarks(id, d); }
  @Roles(...T) @Post(':id/publish') publish(@Param('id', Id()) id: string) { return this.svc.publish(id, true); }
  @Roles(...T) @Post(':id/unpublish') unpublish(@Param('id', Id()) id: string) { return this.svc.publish(id, false); }
}

@Module({ imports: [LmsModule], controllers: [ExamsController], providers: [ExamsService] })
export class ExamsModule {}
