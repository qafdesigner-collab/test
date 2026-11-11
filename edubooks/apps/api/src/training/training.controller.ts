import { BadRequestException, Body, ConflictException, Controller, Delete, Get, Injectable, Module, NotFoundException, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiTags, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsOptional, IsString, Length, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { sql } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { AuditService } from '../audit/audit.service';
import { Roles } from '../common/decorators';

const Id = () => new ParseUUIDPipe();
const PASS = 70;
const KINDS = ['VIDEO', 'TEXT', 'LINK', 'QUIZ'] as const;

class CourseDto {
  @IsString() @Length(2, 120) title!: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @IsIn(['TEACHER', 'SCHOOL_ADMIN', 'ALL']) audience?: string;
  @IsOptional() @Matches(/^#[0-9a-fA-F]{6}$/) color?: string;
}
class UpdateCourseDto extends PartialType(CourseDto) {
  @IsOptional() @IsIn(['DRAFT', 'PUBLISHED', 'ARCHIVED']) status?: string;
  @IsOptional() @IsInt() sort?: number;
}
class QuizQuestion {
  @IsString() @Length(1, 300) q!: string;
  @IsArray() @ArrayMinSize(2) @ArrayMaxSize(6) @IsString({ each: true }) @MaxLength(200, { each: true }) options!: string[];
  @IsInt() @Min(0) @Max(5) answer!: number;
}
class LessonDto {
  @IsString() @Length(1, 160) title!: string;
  @IsIn(KINDS as unknown as string[]) kind!: (typeof KINDS)[number];
  @IsOptional() @IsString() @MaxLength(20000) body?: string;
  @IsOptional() @IsString() @MaxLength(500) url?: string | null;
  @IsOptional() @IsArray() @ArrayMaxSize(30) @ValidateNested({ each: true }) @Type(() => QuizQuestion) quiz?: QuizQuestion[];
  @IsOptional() @IsInt() @Min(1) @Max(600) minutes?: number;
}
class UpdateLessonDto extends PartialType(LessonDto) {}
class ReorderDto { @IsArray() @ArrayMaxSize(200) @IsString({ each: true }) ids!: string[]; }
class AnswersDto { @IsOptional() @IsArray() @ArrayMaxSize(30) @IsInt({ each: true }) answers?: number[]; }

/** Accept YouTube / Vimeo for videos (shown embedded) and any https link otherwise. */
export function checkUrl(kind: string, url?: string | null) {
  if (kind !== 'VIDEO' && kind !== 'LINK') return null;
  if (!url) throw new BadRequestException(kind === 'VIDEO' ? 'Paste a YouTube or Vimeo link' : 'Paste a link');
  let u: URL; try { u = new URL(url); } catch { throw new BadRequestException('That link is not valid'); }
  if (u.protocol !== 'https:') throw new BadRequestException('Links must start with https://');
  if (kind === 'VIDEO' && !/(^|\.)(youtube\.com|youtu\.be|vimeo\.com)$/.test(u.hostname)) throw new BadRequestException('Videos must be on YouTube or Vimeo. For other sites, use a “Link” lesson.');
  return u.toString();
}

@Injectable()
export class TrainingService {
  constructor(private readonly db: DbService, private readonly audit: AuditService) {}
  private get q() { return this.db.q; }
  private get ctx() { return this.db.ctx; }
  private async rows(s: ReturnType<typeof sql>) { return (await this.q.execute(s)).rows as any[]; }
  private async one(s: ReturnType<typeof sql>) { return (await this.rows(s))[0]; }

  // ---------------------------------------------------------------- publisher
  adminCourses() {
    return this.rows(sql`SELECT c.id, c.title, c.description, c.audience, c.status, c.color, c.sort, c.updated_at AS "updatedAt",
        (SELECT count(*) FROM training_lessons l WHERE l.course_id = c.id)::int AS lessons,
        (SELECT coalesce(sum(minutes), 0) FROM training_lessons l WHERE l.course_id = c.id)::int AS minutes,
        (SELECT count(DISTINCT user_id) FROM training_progress p WHERE p.course_id = c.id)::int AS learners,
        (SELECT count(*) FROM (SELECT p.user_id FROM training_progress p WHERE p.course_id = c.id GROUP BY p.user_id
           HAVING count(*) >= (SELECT count(*) FROM training_lessons l WHERE l.course_id = c.id)) t)::int AS completed
      FROM training_courses c ORDER BY c.sort, c.created_at`);
  }
  async createCourse(d: CourseDto) {
    const c = await this.one(sql`INSERT INTO training_courses (publisher_id, title, description, audience, color, sort)
      VALUES (${this.ctx.publisherId}, ${d.title.trim()}, ${d.description ?? ''}, ${d.audience ?? 'TEACHER'}, ${d.color ?? '#4f46e5'}, (SELECT coalesce(max(sort), 0) + 1 FROM training_courses))
      RETURNING id, title`);
    await this.audit.log('training.course.create', 'training_course', c.id, `Created training course ${c.title}`);
    return c;
  }
  async updateCourse(id: string, d: UpdateCourseDto) {
    if (d.status === 'PUBLISHED') {
      const n = await this.one(sql`SELECT count(*)::int AS n FROM training_lessons WHERE course_id = ${id}`);
      if (!n?.n) throw new BadRequestException('Add at least one lesson before publishing');
    }
    const c = await this.one(sql`UPDATE training_courses SET title = coalesce(${d.title?.trim() ?? null}, title), description = coalesce(${d.description ?? null}, description),
        audience = coalesce(${d.audience ?? null}, audience), status = coalesce(${d.status ?? null}, status), color = coalesce(${d.color ?? null}, color),
        sort = coalesce(${d.sort ?? null}::int, sort), updated_at = now() WHERE id = ${id} RETURNING id, title, status`);
    if (!c) throw new NotFoundException('Course not found');
    if (d.status) await this.audit.log(`training.course.${d.status.toLowerCase()}`, 'training_course', id, `${d.status === 'PUBLISHED' ? 'Published' : d.status === 'ARCHIVED' ? 'Archived' : 'Unpublished'} training course ${c.title}`);
    return c;
  }
  async deleteCourse(id: string) {
    const used = await this.one(sql`SELECT 1 FROM training_progress WHERE course_id = ${id} LIMIT 1`);
    if (used) throw new ConflictException('Teachers have started this course. Archive it instead, so their progress is kept.');
    const c = await this.one(sql`DELETE FROM training_courses WHERE id = ${id} RETURNING title`);
    if (!c) throw new NotFoundException('Course not found');
    await this.audit.log('training.course.delete', 'training_course', id, `Deleted training course ${c.title}`);
    return { ok: true };
  }
  async adminCourse(id: string) {
    const c = await this.one(sql`SELECT id, title, description, audience, status, color FROM training_courses WHERE id = ${id}`);
    if (!c) throw new NotFoundException('Course not found');
    const lessons = await this.rows(sql`SELECT id, sort, title, kind, body, url, quiz, minutes FROM training_lessons WHERE course_id = ${id} ORDER BY sort, created_at`);
    return { ...c, lessons };
  }
  async addLesson(courseId: string, d: LessonDto) {
    const url = checkUrl(d.kind, d.url);
    if (d.kind === 'QUIZ' && !d.quiz?.length) throw new BadRequestException('Add at least one question');
    this.checkQuiz(d.quiz);
    const l = await this.one(sql`INSERT INTO training_lessons (publisher_id, course_id, sort, title, kind, body, url, quiz, minutes)
      SELECT ${this.ctx.publisherId}, c.id, (SELECT coalesce(max(sort), 0) + 1 FROM training_lessons WHERE course_id = c.id), ${d.title.trim()}, ${d.kind}, ${d.body ?? ''}, ${url},
        ${JSON.stringify(d.kind === 'QUIZ' ? d.quiz : [])}::jsonb, ${d.minutes ?? 5}
      FROM training_courses c WHERE c.id = ${courseId} RETURNING id`);
    if (!l) throw new NotFoundException('Course not found');
    await this.touch(courseId);
    return l;
  }
  async updateLesson(id: string, d: UpdateLessonDto) {
    const cur = await this.one(sql`SELECT kind, url, course_id FROM training_lessons WHERE id = ${id}`);
    if (!cur) throw new NotFoundException('Lesson not found');
    const kind = d.kind ?? cur.kind;
    const url = d.url !== undefined || d.kind ? checkUrl(kind, d.url !== undefined ? d.url : cur.url) : cur.url;
    this.checkQuiz(d.quiz);
    if (kind === 'QUIZ' && d.quiz && !d.quiz.length) throw new BadRequestException('Add at least one question');
    await this.q.execute(sql`UPDATE training_lessons SET title = coalesce(${d.title?.trim() ?? null}, title), kind = ${kind}, body = coalesce(${d.body ?? null}, body), url = ${url},
      quiz = coalesce(${d.quiz ? JSON.stringify(d.quiz) : null}::jsonb, quiz), minutes = coalesce(${d.minutes ?? null}::int, minutes) WHERE id = ${id}`);
    await this.touch(cur.course_id);
    return { ok: true };
  }
  async deleteLesson(id: string) {
    const l = await this.one(sql`DELETE FROM training_lessons WHERE id = ${id} RETURNING course_id`);
    if (!l) throw new NotFoundException('Lesson not found');
    await this.touch(l.course_id);
    return { ok: true };
  }
  async reorder(courseId: string, ids: string[]) {
    for (let i = 0; i < ids.length; i++) await this.q.execute(sql`UPDATE training_lessons SET sort = ${i + 1} WHERE id = ${ids[i]} AND course_id = ${courseId}`);
    return { ok: true };
  }
  private checkQuiz(quiz?: QuizQuestion[]) {
    for (const [i, x] of (quiz ?? []).entries()) if (x.answer >= x.options.length) throw new BadRequestException(`Question ${i + 1}: choose which answer is right`);
  }
  private touch(courseId: string) { return this.q.execute(sql`UPDATE training_courses SET updated_at = now() WHERE id = ${courseId}`); }

  /** Completion by school, and every learner of every course (publisher staff). */
  async report() {
    const learners = await this.rows(sql`SELECT u.id, u.display_name AS "displayName", s.id AS "schoolId", s.name AS school, s.city, c.id AS "courseId", c.title AS course,
        count(p.lesson_id)::int AS done, (SELECT count(*) FROM training_lessons l WHERE l.course_id = c.id)::int AS total, max(p.completed_at) AS "lastAt"
      FROM training_progress p JOIN users u ON u.id = p.user_id JOIN training_courses c ON c.id = p.course_id LEFT JOIN schools s ON s.id = p.school_id
      GROUP BY u.id, s.id, c.id ORDER BY max(p.completed_at) DESC LIMIT 1000`);
    const schools = await this.rows(sql`SELECT s.id, s.name, s.city,
        (SELECT count(*) FROM users u JOIN user_roles r ON r.user_id = u.id AND r.role = 'TEACHER' WHERE u.school_id = s.id AND u.status = 'ACTIVE')::int AS teachers,
        (SELECT count(DISTINCT p.user_id) FROM training_progress p WHERE p.school_id = s.id)::int AS started
      FROM schools s WHERE s.status = 'ACTIVE' ORDER BY s.name`);
    const finished = learners.filter((l) => l.done >= l.total && l.total > 0);
    return { schools: schools.map((s) => ({ ...s, completed: new Set(finished.filter((f) => f.schoolId === s.id).map((f) => f.id)).size })), learners };
  }

  // ---------------------------------------------------------------- learners
  private audienceFilter() {
    const roles = this.ctx.roles;
    const aud = ['ALL', ...(roles.includes('TEACHER') ? ['TEACHER'] : []), ...(roles.includes('SCHOOL_ADMIN') ? ['SCHOOL_ADMIN', 'TEACHER'] : [])];
    return sql`c.audience = ANY(${`{${aud.join(',')}}`}::text[])`;
  }
  courses() {
    return this.rows(sql`SELECT c.id, c.title, c.description, c.color,
        (SELECT count(*) FROM training_lessons l WHERE l.course_id = c.id)::int AS lessons,
        (SELECT coalesce(sum(minutes), 0) FROM training_lessons l WHERE l.course_id = c.id)::int AS minutes,
        (SELECT count(*) FROM training_progress p WHERE p.course_id = c.id AND p.user_id = ${this.ctx.userId})::int AS done
      FROM training_courses c WHERE c.status = 'PUBLISHED' AND ${this.audienceFilter()} ORDER BY c.sort, c.created_at`);
  }
  async course(id: string) {
    const c = await this.one(sql`SELECT id, title, description, color FROM training_courses c WHERE id = ${id} AND status = 'PUBLISHED' AND ${this.audienceFilter()}`);
    if (!c) throw new NotFoundException('Course not found');
    const lessons = await this.rows(sql`SELECT l.id, l.title, l.kind, l.body, l.url, l.minutes,
        (SELECT coalesce(jsonb_agg(jsonb_build_object('q', x->'q', 'options', x->'options')), '[]') FROM jsonb_array_elements(l.quiz) x) AS quiz,
        p.completed_at AS "completedAt", p.score
      FROM training_lessons l LEFT JOIN training_progress p ON p.lesson_id = l.id AND p.user_id = ${this.ctx.userId}
      WHERE l.course_id = ${id} ORDER BY l.sort, l.created_at`);
    const done = lessons.filter((l) => l.completedAt);
    const completedAt = lessons.length && done.length === lessons.length ? done.map((l) => l.completedAt).sort().at(-1) : null;
    return { ...c, lessons, completedAt };
  }
  async complete(lessonId: string, d: AnswersDto) {
    const l = await this.one(sql`SELECT l.id, l.kind, l.quiz, l.course_id FROM training_lessons l JOIN training_courses c ON c.id = l.course_id
      WHERE l.id = ${lessonId} AND c.status = 'PUBLISHED' AND ${this.audienceFilter()}`);
    if (!l) throw new NotFoundException('Lesson not found');
    let score: number | null = null; let correct: boolean[] = [];
    if (l.kind === 'QUIZ') {
      const quiz = l.quiz as QuizQuestion[];
      if (!d.answers || d.answers.length !== quiz.length) throw new BadRequestException('Answer every question');
      correct = quiz.map((x, i) => x.answer === d.answers![i]);
      score = Math.round((correct.filter(Boolean).length / quiz.length) * 100);
      if (score < PASS) return { passed: false, score, correct, pass: PASS };
    }
    await this.q.execute(sql`INSERT INTO training_progress (user_id, lesson_id, course_id, publisher_id, school_id, score)
      VALUES (${this.ctx.userId}, ${lessonId}, ${l.course_id}, ${this.ctx.publisherId}, ${this.ctx.schoolId}, ${score})
      ON CONFLICT (user_id, lesson_id) DO UPDATE SET score = greatest(training_progress.score, excluded.score), completed_at = training_progress.completed_at`);
    return { passed: true, score, correct, pass: PASS };
  }

  /** School admin: their teachers' progress on each published course. */
  async school() {
    const courses = await this.courses();
    const teachers = await this.rows(sql`SELECT u.id, u.display_name AS "displayName" FROM users u JOIN user_roles r ON r.user_id = u.id AND r.role = 'TEACHER'
      WHERE u.school_id = ${this.ctx.schoolId} AND u.status = 'ACTIVE' ORDER BY u.display_name`);
    const prog = await this.rows(sql`SELECT user_id, course_id, count(*)::int AS done FROM training_progress WHERE school_id = ${this.ctx.schoolId} GROUP BY 1, 2`);
    return { courses: courses.map(({ done, ...c }) => c),
      teachers: teachers.map((t) => ({ ...t, progress: Object.fromEntries(prog.filter((p) => p.user_id === t.id).map((p) => [p.course_id, p.done])) })) };
  }
}

const AUTHORS = ['PUBLISHER_ADMIN', 'PUBLISHER_EDITOR'];
const LEARNERS = ['TEACHER', 'SCHOOL_ADMIN'];
@ApiTags('training')
@Controller('training')
export class TrainingController {
  constructor(private readonly svc: TrainingService) {}
  @Roles(...AUTHORS, 'PUBLISHER_SALES') @Get('admin/courses') adminCourses() { return this.svc.adminCourses(); }
  @Roles(...AUTHORS) @Post('admin/courses') createCourse(@Body() d: CourseDto) { return this.svc.createCourse(d); }
  @Roles(...AUTHORS, 'PUBLISHER_SALES') @Get('admin/courses/:id') adminCourse(@Param('id', Id()) id: string) { return this.svc.adminCourse(id); }
  @Roles(...AUTHORS) @Patch('admin/courses/:id') updateCourse(@Param('id', Id()) id: string, @Body() d: UpdateCourseDto) { return this.svc.updateCourse(id, d); }
  @Roles(...AUTHORS) @Delete('admin/courses/:id') deleteCourse(@Param('id', Id()) id: string) { return this.svc.deleteCourse(id); }
  @Roles(...AUTHORS) @Post('admin/courses/:id/lessons') addLesson(@Param('id', Id()) id: string, @Body() d: LessonDto) { return this.svc.addLesson(id, d); }
  @Roles(...AUTHORS) @Post('admin/courses/:id/reorder') reorder(@Param('id', Id()) id: string, @Body() d: ReorderDto) { return this.svc.reorder(id, d.ids); }
  @Roles(...AUTHORS) @Patch('admin/lessons/:id') updateLesson(@Param('id', Id()) id: string, @Body() d: UpdateLessonDto) { return this.svc.updateLesson(id, d); }
  @Roles(...AUTHORS) @Delete('admin/lessons/:id') deleteLesson(@Param('id', Id()) id: string) { return this.svc.deleteLesson(id); }
  @Roles(...AUTHORS, 'PUBLISHER_SALES') @Get('admin/report') report() { return this.svc.report(); }

  @Roles(...LEARNERS) @Get('courses') courses() { return this.svc.courses(); }
  @Roles(...LEARNERS) @Get('courses/:id') course(@Param('id', Id()) id: string) { return this.svc.course(id); }
  @Roles(...LEARNERS) @Post('lessons/:id/complete') complete(@Param('id', Id()) id: string, @Body() d: AnswersDto) { return this.svc.complete(id, d); }
  @Roles('SCHOOL_ADMIN') @Get('school') school() { return this.svc.school(); }
}

@Module({ controllers: [TrainingController], providers: [TrainingService] })
export class TrainingModule {}
