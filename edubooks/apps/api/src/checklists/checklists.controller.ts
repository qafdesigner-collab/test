import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Injectable, Module, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsObject, IsOptional, IsString, IsUUID, Length, MaxLength, ValidateNested } from 'class-validator';
import { randomUUID } from 'crypto';
import { sql } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { Roles } from '../common/decorators';
import { AccessService } from '../lms/access.service';
import { LmsModule } from '../lms/lms.module';

/**
 * Evaluation checklists. A teacher lists the skills or criteria for a class (from a ready-made template, from a
 * book unit's lessons, or typed in), then marks every student on a simple scale and adds a comment.
 * Shared checklists are shown to the student and their parents.
 */
const SCALES = ['THREE', 'FOUR', 'YESNO'] as const;
const TEACHING = ['TEACHER', 'SCHOOL_ADMIN'];
const Id = () => new ParseUUIDPipe();
/** Highest level of each scale (levels go 1..max; missing = not marked yet). */
const MAX: Record<string, number> = { THREE: 3, FOUR: 4, YESNO: 2 };

class ItemDto {
  @IsOptional() @IsString() @MaxLength(40) id?: string;
  @IsOptional() @IsString() @MaxLength(80) area?: string;
  @IsString() @Length(1, 300) label!: string;
}
class CreateDto {
  @IsUUID() classId!: string;
  @IsString() @Length(1, 160) title!: string;
  @IsOptional() @IsString() @MaxLength(60) term?: string;
  @IsOptional() @IsIn(SCALES as unknown as string[]) scale?: (typeof SCALES)[number];
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(80) @ValidateNested({ each: true }) @Type(() => ItemDto) items!: ItemDto[];
  @IsOptional() @IsUUID() editionId?: string | null;
  @IsOptional() @IsUUID() unitId?: string | null;
}
class UpdateDto {
  @IsOptional() @IsString() @Length(1, 160) title?: string;
  @IsOptional() @IsString() @MaxLength(60) term?: string;
  @IsOptional() @IsIn(SCALES as unknown as string[]) scale?: (typeof SCALES)[number];
  @IsOptional() @IsArray() @ArrayMinSize(1) @ArrayMaxSize(80) @ValidateNested({ each: true }) @Type(() => ItemDto) items?: ItemDto[];
  @IsOptional() @IsBoolean() shared?: boolean;
}
class StudentMarksDto {
  @IsUUID() studentId!: string;
  @IsObject() marks!: Record<string, number | null>;
  @IsOptional() @IsString() @MaxLength(1000) comment?: string;
}
class MarksDto { @IsArray() @ArrayMaxSize(300) @ValidateNested({ each: true }) @Type(() => StudentMarksDto) students!: StudentMarksDto[]; }

/** Ready-made lists (early years / primary). Teachers can change every line after choosing one. */
export const TEMPLATES: { id: string; title: string; items: { area: string; label: string }[] }[] = [
  { id: 'kg-language', title: 'Language & literacy', items: [
    { area: 'Listening', label: 'Listens to a story and answers simple questions' }, { area: 'Listening', label: 'Follows two-step instructions' },
    { area: 'Speaking', label: 'Speaks in full sentences' }, { area: 'Speaking', label: 'Retells a short story in order' },
    { area: 'Reading', label: 'Recognises the letters of the alphabet' }, { area: 'Reading', label: 'Knows the sound of each letter' }, { area: 'Reading', label: 'Reads simple sight words' },
    { area: 'Writing', label: 'Holds the pencil correctly' }, { area: 'Writing', label: 'Writes own name' }, { area: 'Writing', label: 'Forms letters correctly' } ] },
  { id: 'kg-maths', title: 'Early maths', items: [
    { area: 'Numbers', label: 'Counts objects up to 20' }, { area: 'Numbers', label: 'Recognises and writes numbers 1–20' }, { area: 'Numbers', label: 'Compares more / less' },
    { area: 'Operations', label: 'Adds within 10 using objects' }, { area: 'Operations', label: 'Takes away within 10 using objects' },
    { area: 'Shapes & measures', label: 'Names basic 2D shapes' }, { area: 'Shapes & measures', label: 'Sorts by size, colour and shape' }, { area: 'Shapes & measures', label: 'Continues a simple pattern' } ] },
  { id: 'kg-motor', title: 'Physical & motor skills', items: [
    { area: 'Fine motor', label: 'Cuts along a line with scissors' }, { area: 'Fine motor', label: 'Colours within the lines' }, { area: 'Fine motor', label: 'Buttons / zips independently' },
    { area: 'Gross motor', label: 'Hops, jumps and balances' }, { area: 'Gross motor', label: 'Throws and catches a ball' } ] },
  { id: 'kg-social', title: 'Personal, social & emotional', items: [
    { area: 'Behaviour', label: 'Follows class rules' }, { area: 'Behaviour', label: 'Takes turns and shares' }, { area: 'Relationships', label: 'Plays well with others' },
    { area: 'Self-care', label: 'Takes care of own belongings' }, { area: 'Confidence', label: 'Tries new activities with confidence' }, { area: 'Confidence', label: 'Expresses feelings with words' } ] },
  { id: 'primary-work', title: 'Learning habits (primary)', items: [
    { area: 'Class work', label: 'Completes class work on time' }, { area: 'Class work', label: 'Work is neat and organised' }, { area: 'Homework', label: 'Hands in homework regularly' },
    { area: 'Participation', label: 'Takes part in class discussions' }, { area: 'Participation', label: 'Works well in a group' }, { area: 'Attitude', label: 'Shows effort and perseverance' } ] },
];

@Injectable()
export class ChecklistsService {
  constructor(private readonly db: DbService, private readonly access: AccessService) {}
  private get q() { return this.db.q; }
  private get ctx() { return this.db.ctx; }
  private async rows(s: ReturnType<typeof sql>) { return (await this.q.execute(s)).rows as any[]; }
  private items(list: ItemDto[]) { return list.map((i) => ({ id: i.id && /^[\w-]{1,40}$/.test(i.id) ? i.id : randomUUID().slice(0, 8), area: (i.area ?? '').trim(), label: i.label.trim() })); }

  private async get(id: string) {
    const [c] = await this.rows(sql`SELECT * FROM checklists WHERE id = ${id}`);
    if (!c) throw new NotFoundException('Checklist not found');
    return c;
  }
  private async own(id: string) { const c = await this.get(id); await this.access.assertTeaches(c.class_id); return c; }

  async list(classId?: string) {
    const classIds = this.access.is('SCHOOL_ADMIN') ? null : await this.access.teacherClassIds();
    if (classId) await this.access.assertTeaches(classId);
    return this.rows(sql`SELECT k.id, k.title, k.term, k.scale, k.shared, k.class_id AS "classId", c.name AS "className", c.section, k.updated_at AS "updatedAt",
        jsonb_array_length(k.items) AS "itemCount",
        (SELECT count(*)::int FROM enrolments e WHERE e.class_id = k.class_id) AS students,
        (SELECT count(*)::int FROM checklist_marks m WHERE m.checklist_id = k.id AND m.marks <> '{}'::jsonb) AS marked
      FROM checklists k JOIN classes c ON c.id = k.class_id
      WHERE ${classId ? sql`k.class_id = ${classId}` : classIds ? (classIds.length ? sql`k.class_id IN ${classIds}` : sql`false`) : sql`true`}
      ORDER BY k.updated_at DESC`);
  }

  async create(d: CreateDto) {
    await this.access.assertTeaches(d.classId);
    const [r] = await this.rows(sql`INSERT INTO checklists (publisher_id, school_id, class_id, title, term, scale, items, edition_id, unit_id, created_by)
      VALUES (${this.ctx.publisherId}, ${this.ctx.schoolId}, ${d.classId}, ${d.title.trim()}, ${(d.term ?? '').trim()}, ${d.scale ?? 'THREE'}, ${JSON.stringify(this.items(d.items))}::jsonb,
        ${d.editionId ?? null}, ${d.unitId ?? null}, ${this.ctx.userId}) RETURNING id`);
    return { id: r.id };
  }

  async update(id: string, d: UpdateDto) {
    const c = await this.own(id);
    await this.q.execute(sql`UPDATE checklists SET title = ${d.title?.trim() ?? c.title}, term = ${d.term?.trim() ?? c.term}, scale = ${d.scale ?? c.scale},
      items = ${JSON.stringify(d.items ? this.items(d.items) : c.items)}::jsonb, shared = ${d.shared ?? c.shared}, updated_at = now() WHERE id = ${id}`);
    return this.detail(id);
  }

  async remove(id: string) { await this.own(id); await this.q.execute(sql`DELETE FROM checklists WHERE id = ${id}`); return { ok: true }; }

  /** The checklist with every student of the class and their marks. */
  async detail(id: string) {
    const c = await this.own(id);
    const [cls] = await this.rows(sql`SELECT c.name, c.section, y.name AS year FROM classes c LEFT JOIN academic_years y ON y.id = c.academic_year_id WHERE c.id = ${c.class_id}`);
    const roster = await this.rows(sql`SELECT u.id, u.display_name AS "displayName", u.username, coalesce(m.marks, '{}'::jsonb) AS marks, coalesce(m.comment, '') AS comment
      FROM enrolments e JOIN users u ON u.id = e.student_id LEFT JOIN checklist_marks m ON m.checklist_id = ${id} AND m.student_id = u.id
      WHERE e.class_id = ${c.class_id} AND u.status = 'ACTIVE' ORDER BY u.display_name`);
    return { id: c.id, title: c.title, term: c.term, scale: c.scale, items: c.items, shared: c.shared, classId: c.class_id, className: cls ? `${cls.name}${cls.section ? ` ${cls.section}` : ''}` : '', year: cls?.year ?? '',
      updatedAt: c.updated_at, roster };
  }

  async saveMarks(id: string, d: MarksDto) {
    const c = await this.own(id);
    const enrolled = new Set(await this.access.studentIdsOf(c.class_id));
    const itemIds = new Set((c.items as any[]).map((i) => i.id)); const max = MAX[c.scale];
    for (const s of d.students) {
      if (!enrolled.has(s.studentId)) throw new BadRequestException('Some students are not in this class');
      const marks: Record<string, number> = {};
      for (const [k, v] of Object.entries(s.marks ?? {})) {
        if (!itemIds.has(k) || v === null || v === undefined) continue;
        if (!Number.isInteger(v) || v < 1 || v > max) throw new BadRequestException('A mark is outside the scale');
        marks[k] = v;
      }
      await this.q.execute(sql`INSERT INTO checklist_marks (checklist_id, student_id, publisher_id, school_id, marks, comment, updated_by)
        VALUES (${id}, ${s.studentId}, ${this.ctx.publisherId}, ${this.ctx.schoolId}, ${JSON.stringify(marks)}::jsonb, ${(s.comment ?? '').trim()}, ${this.ctx.userId})
        ON CONFLICT (checklist_id, student_id) DO UPDATE SET marks = EXCLUDED.marks, comment = EXCLUDED.comment, updated_by = EXCLUDED.updated_by, updated_at = now()`);
    }
    await this.q.execute(sql`UPDATE checklists SET updated_at = now() WHERE id = ${id}`);
    return { saved: d.students.length };
  }

  /** Lines for a new checklist from the lessons of a book unit (lesson title + its objectives). */
  async fromUnit(unitId: string) {
    const [u] = await this.rows(sql`SELECT u.id, u.title, u.number, c.edition_id AS "editionId" FROM book_units u JOIN book_components c ON c.id = u.component_id WHERE u.id = ${unitId}`);
    if (!u) throw new NotFoundException('Unit not found');
    await this.access.assertEdition(u.editionId);
    const lessons = await this.rows(sql`SELECT number, title, objectives FROM book_lessons WHERE unit_id = ${unitId} ORDER BY sort, number`);
    const items: { area: string; label: string }[] = [];
    for (const l of lessons) {
      const objs = String(l.objectives ?? '').split(/\n|•|;|(?<=\.)\s+/).map((x: string) => x.replace(/^[-*\d.)\s]+/, '').trim()).filter((x: string) => x.length > 3);
      if (objs.length) objs.slice(0, 6).forEach((o: string) => items.push({ area: `Lesson ${l.number}: ${l.title}`.slice(0, 80), label: o.slice(0, 300) }));
      else items.push({ area: `Unit ${u.number}`, label: `Lesson ${l.number}: ${l.title}`.slice(0, 300) });
    }
    return { title: `Unit ${u.number}: ${u.title} — checklist`.slice(0, 160), items };
  }

  mine() { return this.forStudent(this.ctx.userId); }
  /** Shared checklists of one student (the student, or their parent). */
  async forStudent(studentId: string) {
    if (this.access.is('PARENT')) {
      const [link] = await this.rows(sql`SELECT 1 FROM parent_students WHERE parent_id = ${this.ctx.userId} AND student_id = ${studentId}`);
      if (!link) throw new ForbiddenException('This is not your child');
    } else if (studentId !== this.ctx.userId) throw new ForbiddenException();
    return this.rows(sql`SELECT k.id, k.title, k.term, k.scale, k.items, k.updated_at AS "updatedAt", c.name AS "className", c.section, m.marks, m.comment, t.display_name AS teacher
      FROM checklists k JOIN enrolments e ON e.class_id = k.class_id AND e.student_id = ${studentId} JOIN classes c ON c.id = k.class_id
      LEFT JOIN checklist_marks m ON m.checklist_id = k.id AND m.student_id = ${studentId} LEFT JOIN users t ON t.id = k.created_by
      WHERE k.shared ORDER BY k.updated_at DESC`);
  }
}

@ApiTags('checklists')
@Controller()
export class ChecklistsController {
  constructor(private readonly svc: ChecklistsService) {}
  @Roles(...TEACHING) @Get('checklists/templates') templates() { return TEMPLATES; }
  @Roles(...TEACHING) @Get('checklists/from-unit/:unitId') fromUnit(@Param('unitId', Id()) id: string) { return this.svc.fromUnit(id); }
  @Roles(...TEACHING) @Get('checklists') list(@Query('classId') classId?: string) { return this.svc.list(classId && /^[0-9a-f-]{36}$/i.test(classId) ? classId : undefined); }
  @Roles(...TEACHING) @Post('checklists') create(@Body() d: CreateDto) { return this.svc.create(d); }
  @Roles(...TEACHING) @Get('checklists/:id') detail(@Param('id', Id()) id: string) { return this.svc.detail(id); }
  @Roles(...TEACHING) @Patch('checklists/:id') update(@Param('id', Id()) id: string, @Body() d: UpdateDto) { return this.svc.update(id, d); }
  @Roles(...TEACHING) @Delete('checklists/:id') remove(@Param('id', Id()) id: string) { return this.svc.remove(id); }
  @Roles(...TEACHING) @Put('checklists/:id/marks') marks(@Param('id', Id()) id: string, @Body() d: MarksDto) { return this.svc.saveMarks(id, d); }
  @Roles('STUDENT') @Get('student/checklists') mine() { return this.svc.mine(); }
  @Roles('PARENT') @Get('parent/children/:id/checklists') child(@Param('id', Id()) id: string) { return this.svc.forStudent(id); }
}

@Module({ imports: [LmsModule], controllers: [ChecklistsController], providers: [ChecklistsService] })
export class ChecklistsModule {}
