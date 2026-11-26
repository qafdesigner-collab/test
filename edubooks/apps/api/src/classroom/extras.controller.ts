import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Injectable, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { sql } from 'drizzle-orm';
import { Roles } from '../common/decorators';
import { DbService } from '../db/db.service';
import { AccessService } from '../lms/access.service';
import { AVATARS, pictureUrl } from '../people/avatars';
import { mondayOf } from './classroom.controller';

// =========================== weekly lesson plans made by hand ===========================
class EntryDto {
  @Type(() => Number) @IsInt() @Min(1) @Max(7) day!: number;
  @IsOptional() @IsUUID() editionId?: string | null;
  @IsOptional() @IsUUID() componentId?: string | null;
  @IsOptional() @IsUUID() lessonId?: string | null;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(5000) pageFrom?: number | null;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(5000) pageTo?: number | null;
  @IsOptional() @IsArray() @ArrayMaxSize(10) @IsUUID('all', { each: true }) resourceIds?: string[];
  @IsOptional() @IsString() @MaxLength(200) title?: string;
  @IsOptional() @IsString() @MaxLength(1000) activity?: string;
  @IsOptional() @IsString() @MaxLength(500) homework?: string;
}
class WeeklyDto {
  @IsOptional() @IsUUID() classId?: string | null;
  @Matches(/^\d{4}-\d{2}-\d{2}$/) weekStart!: string;
  @IsOptional() @IsString() @MaxLength(160) title?: string;
  @IsOptional() @IsString() @MaxLength(3000) notes?: string;
  @IsArray() @ArrayMaxSize(80) @ValidateNested({ each: true }) @Type(() => EntryDto) entries!: EntryDto[];
}

@Injectable()
export class WeeklyPlansService {
  constructor(private readonly db: DbService, private readonly access: AccessService) {}
  private get ctx() { return this.db.ctx; }
  private async rows(q: ReturnType<typeof sql>) { return (await this.db.q.execute(q)).rows as any[]; }

  async list() {
    return this.rows(sql`SELECT w.id, w.title, w.week_start::text AS "weekStart", w.updated_at AS "updatedAt", jsonb_array_length(w.entries) AS entries,
        CASE WHEN c.id IS NOT NULL THEN c.name || CASE WHEN c.section <> '' THEN ' ' || c.section ELSE '' END END AS "className"
      FROM weekly_plans w LEFT JOIN classes c ON c.id = w.class_id WHERE w.teacher_id = ${this.ctx.userId} ORDER BY w.week_start DESC, w.updated_at DESC LIMIT 100`);
  }
  private async own(id: string) {
    const [w] = await this.rows(sql`SELECT * FROM weekly_plans WHERE id = ${id}`);
    if (!w) throw new NotFoundException('Weekly plan not found');
    if (w.teacher_id !== this.ctx.userId && !this.access.is('SCHOOL_ADMIN')) throw new ForbiddenException('This is another teacher’s plan');
    return w;
  }
  /** The plan with names filled in (book, part, lesson, resources) for showing and printing. */
  async get(id: string) {
    const w = await this.own(id);
    const e = w.entries as any[];
    const ids = (k: string) => [...new Set(e.map((x) => x[k]).filter(Boolean))] as string[];
    const many = (xs: string[]) => (xs.length ? sql`${xs}` : sql`(NULL::uuid)`);
    const books = await this.rows(sql`SELECT e.id, p.title || ' (' || e.label || ')' AS name FROM book_editions e JOIN book_packages p ON p.id = e.package_id WHERE e.id IN ${many(ids('editionId'))}`);
    const parts = await this.rows(sql`SELECT id, title AS name, type FROM book_components WHERE id IN ${many(ids('componentId'))}`);
    const lessons = await this.rows(sql`SELECT l.id, 'Unit ' || u.number || ' · Lesson ' || l.number || ': ' || l.title AS name FROM book_lessons l JOIN book_units u ON u.id = l.unit_id WHERE l.id IN ${many(ids('lessonId'))}`);
    const resIds = [...new Set(e.flatMap((x) => x.resourceIds ?? []))] as string[];
    const res = await this.rows(sql`SELECT id, title AS name, resource_type AS type FROM teaching_resources WHERE id IN ${many(resIds)}`);
    const name = (list: any[], id?: string) => list.find((x) => x.id === id)?.name ?? null;
    const [cls] = w.class_id ? await this.rows(sql`SELECT name || CASE WHEN section <> '' THEN ' ' || section ELSE '' END AS name FROM classes WHERE id = ${w.class_id}`) : [];
    return {
      id: w.id, classId: w.class_id, className: cls?.name ?? null, weekStart: String(w.week_start instanceof Date ? w.week_start.toISOString().slice(0, 10) : w.week_start).slice(0, 10),
      title: w.title, notes: w.notes, updatedAt: w.updated_at, canEdit: w.teacher_id === this.ctx.userId,
      entries: e.map((x) => ({ ...x, book: name(books, x.editionId), part: name(parts, x.componentId), partType: parts.find((p) => p.id === x.componentId)?.type ?? null,
        lesson: name(lessons, x.lessonId), resources: (x.resourceIds ?? []).map((r: string) => ({ id: r, title: name(res, r), type: res.find((y) => y.id === r)?.type })) })),
    };
  }
  /** Checks every book, part, lesson and resource belongs together and to a book the school may use. */
  private async clean(d: WeeklyDto) {
    if (d.classId) await this.access.assertTeaches(d.classId);
    const out: any[] = [];
    for (const [i, x] of d.entries.entries()) {
      if (!x.editionId && !x.title?.trim() && !x.activity?.trim()) throw new BadRequestException(`Entry ${i + 1}: choose a book or write what you will do`);
      if (x.editionId) await this.access.assertEdition(x.editionId);
      if (x.componentId) {
        const [c] = await this.rows(sql`SELECT edition_id FROM book_components WHERE id = ${x.componentId}`);
        if (!c || c.edition_id !== x.editionId) throw new BadRequestException(`Entry ${i + 1}: that part is not in this book`);
      }
      if (x.lessonId) {
        const [l] = await this.rows(sql`SELECT c.id FROM book_lessons l JOIN book_units u ON u.id = l.unit_id JOIN book_components c ON c.id = u.component_id WHERE l.id = ${x.lessonId}`);
        if (!l || l.id !== x.componentId) throw new BadRequestException(`Entry ${i + 1}: that lesson is not in this part`);
      }
      if (x.resourceIds?.length) {
        const r = await this.rows(sql`SELECT id FROM teaching_resources WHERE id IN ${x.resourceIds} AND edition_id = ${x.editionId ?? null}`);
        if (r.length !== new Set(x.resourceIds).size) throw new BadRequestException(`Entry ${i + 1}: a resource is not in this book`);
      }
      const from = x.pageFrom ?? null; const to = x.pageTo ?? from;
      if (from && to && to < from) throw new BadRequestException(`Entry ${i + 1}: the last page is before the first page`);
      out.push({ day: x.day, editionId: x.editionId ?? null, componentId: x.componentId ?? null, lessonId: x.lessonId ?? null, pageFrom: from, pageTo: from ? to : null,
        resourceIds: [...new Set(x.resourceIds ?? [])], title: (x.title ?? '').trim(), activity: (x.activity ?? '').trim(), homework: (x.homework ?? '').trim() });
    }
    return out;
  }
  async create(d: WeeklyDto) {
    const entries = await this.clean(d);
    const [w] = await this.rows(sql`INSERT INTO weekly_plans (publisher_id, school_id, teacher_id, class_id, week_start, title, notes, entries)
      VALUES (${this.ctx.publisherId}, ${this.ctx.schoolId}, ${this.ctx.userId}, ${d.classId ?? null}, ${mondayOf(d.weekStart)}::date, ${(d.title ?? '').trim()}, ${(d.notes ?? '').trim()}, ${JSON.stringify(entries)}::jsonb) RETURNING id`);
    return this.get(w.id);
  }
  async update(id: string, d: WeeklyDto) {
    const w = await this.own(id); if (w.teacher_id !== this.ctx.userId) throw new ForbiddenException('Only the teacher who made it can change it');
    const entries = await this.clean(d);
    await this.rows(sql`UPDATE weekly_plans SET class_id = ${d.classId ?? null}, week_start = ${mondayOf(d.weekStart)}::date, title = ${(d.title ?? '').trim()}, notes = ${(d.notes ?? '').trim()},
      entries = ${JSON.stringify(entries)}::jsonb, updated_at = now() WHERE id = ${id}`);
    return this.get(id);
  }
  async remove(id: string) {
    const w = await this.own(id); if (w.teacher_id !== this.ctx.userId) throw new ForbiddenException('Only the teacher who made it can delete it');
    await this.rows(sql`DELETE FROM weekly_plans WHERE id = ${id}`); return { ok: true };
  }
}

// =========================== Hall of Fame ===========================
class FameDto {
  @IsIn(['STUDENT', 'LEADER']) kind!: 'STUDENT' | 'LEADER';
  @IsOptional() @IsUUID() userId?: string | null;
  @IsString() @Length(2, 120) name!: string;
  @IsOptional() @IsString() @MaxLength(120) title?: string;
  @IsOptional() @IsString() @MaxLength(600) achievement?: string;
  @IsOptional() @IsString() @MaxLength(20) year?: string;
  @IsOptional() @IsString() @MaxLength(16) emoji?: string;
  @IsOptional() @IsIn([...AVATARS, null]) avatar?: string | null;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(10000) sort?: number;
}
class FameSettingsDto {
  @IsBoolean() enabled!: boolean; @IsBoolean() teachers!: boolean; @IsBoolean() students!: boolean; @IsBoolean() parents!: boolean;
}

@Injectable()
export class FameService {
  constructor(private readonly db: DbService, private readonly access: AccessService) {}
  private get ctx() { return this.db.ctx; }
  private async rows(q: ReturnType<typeof sql>) { return (await this.db.q.execute(q)).rows as any[]; }
  private async settings() {
    const [s] = await this.rows(sql`SELECT fame_settings FROM schools WHERE id = ${this.ctx.schoolId}`);
    return (s?.fame_settings ?? { enabled: true, teachers: true, students: true, parents: true }) as { enabled: boolean; teachers: boolean; students: boolean; parents: boolean };
  }
  /** The school admin always sees it; others only when the admin shows it to them. */
  private visible(s: Awaited<ReturnType<FameService['settings']>>) {
    if (this.access.is('SCHOOL_ADMIN')) return true;
    if (!s.enabled) return false;
    return (this.access.is('TEACHER') && s.teachers) || (this.access.is('STUDENT') && s.students) || (this.access.is('PARENT') && s.parents);
  }
  async view() {
    const s = await this.settings(); const admin = this.access.is('SCHOOL_ADMIN');
    if (!this.visible(s)) return { visible: false, admin: false };
    const list = await this.rows(sql`SELECT f.*, u.photo_key IS NOT NULL AS has, u.photo_at, u.avatar AS user_avatar FROM hall_of_fame f LEFT JOIN users u ON u.id = f.user_id ORDER BY f.sort, f.created_at`);
    const shape = (f: any) => ({ id: f.id, kind: f.kind, userId: f.user_id, name: f.name, title: f.title, achievement: f.achievement, year: f.year, emoji: f.emoji, avatar: f.avatar, sort: f.sort,
      picture: f.avatar ? `/avatars/${f.avatar}.webp` : f.user_id ? pictureUrl(f.user_id, f.has, f.photo_at, f.user_avatar) : null });
    const [sc] = await this.rows(sql`SELECT name FROM schools WHERE id = ${this.ctx.schoolId}`);
    return { visible: true, admin, school: sc?.name, settings: admin ? s : undefined,
      leaders: list.filter((f) => f.kind === 'LEADER').map(shape), students: list.filter((f) => f.kind === 'STUDENT').map(shape) };
  }
  /** For the nav: is there a Hall of Fame to show me? */
  async shown() { const s = await this.settings(); return { shown: this.visible(s) }; }
  async people(role: string, q?: string) {
    const roles = role === 'STUDENT' ? ['STUDENT'] : ['TEACHER', 'SCHOOL_ADMIN'];
    return this.rows(sql`SELECT DISTINCT u.id, u.display_name AS name, u.designation FROM users u JOIN user_roles r ON r.user_id = u.id AND r.role::text IN ${roles}
      WHERE u.school_id = ${this.ctx.schoolId} AND u.status = 'ACTIVE' ${q?.trim() ? sql`AND u.display_name ILIKE ${`%${q.trim()}%`}` : sql``} ORDER BY u.display_name LIMIT 50`);
  }
  private async checkUser(userId?: string | null) {
    if (!userId) return null;
    const [u] = await this.rows(sql`SELECT id FROM users WHERE id = ${userId} AND school_id = ${this.ctx.schoolId}`);
    if (!u) throw new BadRequestException('That person is not in this school');
    return userId;
  }
  async create(d: FameDto) {
    const userId = await this.checkUser(d.userId);
    const [f] = await this.rows(sql`INSERT INTO hall_of_fame (publisher_id, school_id, kind, user_id, name, title, achievement, year, emoji, avatar, sort, created_by)
      VALUES (${this.ctx.publisherId}, ${this.ctx.schoolId}, ${d.kind}, ${userId}, ${d.name.trim()}, ${(d.title ?? '').trim()}, ${(d.achievement ?? '').trim()}, ${(d.year ?? '').trim()},
        ${(d.emoji || (d.kind === 'LEADER' ? '🎖️' : '🏆')).slice(0, 16)}, ${d.avatar ?? null}, ${d.sort ?? 0}, ${this.ctx.userId}) RETURNING id`);
    return { id: f.id };
  }
  async update(id: string, d: FameDto) {
    const userId = await this.checkUser(d.userId);
    const r = await this.rows(sql`UPDATE hall_of_fame SET kind = ${d.kind}, user_id = ${userId}, name = ${d.name.trim()}, title = ${(d.title ?? '').trim()}, achievement = ${(d.achievement ?? '').trim()},
      year = ${(d.year ?? '').trim()}, emoji = ${(d.emoji || '🏆').slice(0, 16)}, avatar = ${d.avatar ?? null}, sort = ${d.sort ?? 0} WHERE id = ${id} RETURNING id`);
    if (!r.length) throw new NotFoundException('Not found');
    return { ok: true };
  }
  async remove(id: string) { await this.rows(sql`DELETE FROM hall_of_fame WHERE id = ${id}`); return { ok: true }; }
  async saveSettings(d: FameSettingsDto) { const [r] = await this.rows(sql`SELECT set_fame_settings(${JSON.stringify(d)}::jsonb) AS s`); return r.s; }
}

@ApiTags('classroom')
@Controller()
export class ExtrasController {
  constructor(private readonly weekly: WeeklyPlansService, private readonly fame: FameService) {}
  @Roles('TEACHER', 'SCHOOL_ADMIN') @Get('teacher/weekly-plans') list() { return this.weekly.list(); }
  @Roles('TEACHER', 'SCHOOL_ADMIN') @Get('teacher/weekly-plans/:id') get(@Param('id', ParseUUIDPipe) id: string) { return this.weekly.get(id); }
  @Roles('TEACHER', 'SCHOOL_ADMIN') @Post('teacher/weekly-plans') create(@Body() d: WeeklyDto) { return this.weekly.create(d); }
  @Roles('TEACHER', 'SCHOOL_ADMIN') @Put('teacher/weekly-plans/:id') update(@Param('id', ParseUUIDPipe) id: string, @Body() d: WeeklyDto) { return this.weekly.update(id, d); }
  @Roles('TEACHER', 'SCHOOL_ADMIN') @Delete('teacher/weekly-plans/:id') remove(@Param('id', ParseUUIDPipe) id: string) { return this.weekly.remove(id); }

  // the Hall of Fame (under /fame; parents may read it)
  @Roles('SCHOOL_ADMIN', 'TEACHER', 'STUDENT', 'PARENT') @Get('fame') view() { return this.fame.view(); }
  @Roles('SCHOOL_ADMIN', 'TEACHER', 'STUDENT', 'PARENT') @Get('fame/shown') shown() { return this.fame.shown(); }
  @Roles('SCHOOL_ADMIN') @Get('fame/people') people(@Query('role') role: string, @Query('q') q?: string) { return this.fame.people(role, q); }
  @Roles('SCHOOL_ADMIN') @Post('fame') add(@Body() d: FameDto) { return this.fame.create(d); }
  @Roles('SCHOOL_ADMIN') @Put('fame/settings') settings(@Body() d: FameSettingsDto) { return this.fame.saveSettings(d); }
  @Roles('SCHOOL_ADMIN') @Patch('fame/:id') edit(@Param('id', ParseUUIDPipe) id: string, @Body() d: FameDto) { return this.fame.update(id, d); }
  @Roles('SCHOOL_ADMIN') @Delete('fame/:id') del(@Param('id', ParseUUIDPipe) id: string) { return this.fame.remove(id); }
}
