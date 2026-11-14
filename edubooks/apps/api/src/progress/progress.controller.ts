import { Body, Controller, ForbiddenException, Get, Injectable, Module, NotFoundException, Param, ParseUUIDPipe, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsNumber, IsOptional, IsString, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import { sql } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { Roles } from '../common/decorators';
import { AccessService } from '../lms/access.service';
import { LmsModule } from '../lms/lms.module';

const Id = () => new ParseUUIDPipe();
const PERIODS = ['T1', 'T2', 'T3', 'FINAL'] as const;
type Period = (typeof PERIODS)[number];
const LABEL: Record<Period, string> = { T1: 'Term 1', T2: 'Term 2', T3: 'Term 3', FINAL: 'Final' };

class OverrideDto {
  @IsIn(PERIODS as unknown as string[]) period!: Period;
  /** null = go back to the automatic score */
  @IsOptional() @ValidateIf((_o, v) => v !== null) @Type(() => Number) @IsNumber({ maxDecimalPlaces: 1 }) @Min(0) @Max(100) score?: number | null;
  @IsOptional() @IsString() @MaxLength(1000) comment?: string;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/**
 * A pupil's progress through the year, built automatically from their work:
 * exams (60%) and marked homework / tests (40%) give a term score; position is the rank in the class.
 * Reading days and attendance are shown alongside. Teachers can adjust a term's score and add a comment.
 */
@Injectable()
export class ProgressService {
  constructor(private readonly db: DbService, private readonly access: AccessService) {}
  private async rows(q: ReturnType<typeof sql>) { return (await this.db.q.execute(q)).rows as any[]; }

  async classProgress(classId: string) {
    const c = await this.access.assertTeaches(classId);
    const [y] = await this.rows(sql`SELECT to_char(y.starts_on, 'YYYY-MM-DD') AS start, to_char(y.ends_on, 'YYYY-MM-DD') AS end, y.name FROM classes c JOIN academic_years y ON y.id = c.academic_year_id WHERE c.id = ${classId}`);
    if (!y) throw new NotFoundException('This class has no academic year');
    const s = new Date(`${y.start}T00:00:00Z`).getTime(); const e = new Date(`${y.end}T23:59:59Z`).getTime(); const third = (e - s) / 3;
    const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
    const bounds: Record<Period, [string, string]> = { T1: [iso(s), iso(s + third)], T2: [iso(s + third + 864e5), iso(s + 2 * third)], T3: [iso(s + 2 * third + 864e5), iso(e)], FINAL: [iso(s), iso(e)] };
    const termOf = (date: string, label = ''): Period => {
      const m = /term\s*([123])/i.exec(label); if (m) return (`T${m[1]}`) as Period;
      return date <= bounds.T1[1] ? 'T1' : date <= bounds.T2[1] ? 'T2' : 'T3';
    };
    const pupils = await this.rows(sql`SELECT u.id, u.display_name AS name FROM enrolments en JOIN users u ON u.id = en.student_id WHERE en.class_id = ${classId} AND u.status = 'ACTIVE' ORDER BY u.display_name`);
    const ids = `{${pupils.map((p) => p.id).join(',') || '00000000-0000-0000-0000-000000000000'}}`;
    // Exams (not absent), as % of the paper's total
    const exams = await this.rows(sql`SELECT m.student_id, coalesce(e.exam_date, e.created_at::date)::text AS day, e.term, e.title,
        m.marks::float / nullif((SELECT sum(marks) FROM exam_items i WHERE i.exam_id = e.id), 0) * 100 AS pct
      FROM exam_marks m JOIN exams e ON e.id = m.exam_id WHERE e.class_id = ${classId} AND m.marks IS NOT NULL AND NOT m.absent`);
    // Marked homework / quizzes / tests
    const work = await this.rows(sql`SELECT s.student_id, s.created_at::date::text AS day, s.score::float / nullif(s.max_score, 0) * 100 AS pct
      FROM submissions s JOIN assessments a ON a.id = s.assessment_id WHERE a.class_id = ${classId} AND s.score IS NOT NULL AND s.student_id = ANY(${ids}::uuid[])`);
    const reading = await this.rows(sql`SELECT user_id AS student_id, day::text AS day FROM user_activity WHERE user_id = ANY(${ids}::uuid[]) AND reading > 0 AND day BETWEEN ${y.start}::date AND ${y.end}::date`);
    const att = await this.rows(sql`SELECT student_id, day::text AS day, status FROM attendance WHERE class_id = ${classId} AND day BETWEEN ${y.start}::date AND ${y.end}::date`);
    const ovr = await this.rows(sql`SELECT student_id, period, score::float AS score, comment FROM progress_overrides WHERE class_id = ${classId}`);

    const inP = (p: Period, day: string, label?: string) => (p === 'FINAL' ? true : termOf(day, label) === p);
    const table: Record<string, Record<Period, any>> = {};
    for (const pu of pupils) {
      table[pu.id] = {} as any;
      for (const p of PERIODS) {
        const ex = exams.filter((r) => r.student_id === pu.id && inP(p, r.day, r.term)).map((r) => Number(r.pct));
        const hw = work.filter((r) => r.student_id === pu.id && inP(p, r.day)).map((r) => Number(r.pct));
        const rd = reading.filter((r) => r.student_id === pu.id && inP(p, r.day)).length;
        const at = att.filter((r) => r.student_id === pu.id && inP(p, r.day));
        const exAvg = avg(ex); const hwAvg = avg(hw);
        const auto = exAvg !== null && hwAvg !== null ? exAvg * 0.6 + hwAvg * 0.4 : exAvg ?? hwAvg;
        const o = ovr.find((r) => r.student_id === pu.id && r.period === p);
        table[pu.id][p] = {
          exam: exAvg === null ? null : round1(exAvg), exams: ex.length, homework: hwAvg === null ? null : round1(hwAvg), homeworks: hw.length,
          readingDays: rd, attendance: at.length ? Math.round((at.filter((r) => r.status === 'PRESENT' || r.status === 'LATE').length / at.length) * 100) : null,
          auto: auto === null ? null : round1(auto), override: o?.score ?? null, score: o?.score ?? (auto === null ? null : round1(auto)), comment: o?.comment ?? '',
        };
      }
    }
    // Position in class per period (by the final score, overrides included)
    for (const p of PERIODS) {
      const ranked = pupils.map((pu) => ({ id: pu.id, s: table[pu.id][p].score })).filter((x) => x.s !== null).sort((a, b) => b.s - a.s);
      for (const pu of pupils) {
        const sc = table[pu.id][p].score;
        table[pu.id][p].position = sc === null ? null : ranked.findIndex((x) => x.s === sc) + 1;
        table[pu.id][p].of = ranked.length;
      }
    }
    return { class: { id: c.id, name: c.name, section: c.section, year: y.name }, periods: PERIODS.map((p) => ({ key: p, label: LABEL[p], from: bounds[p][0], to: bounds[p][1] })), pupils, table };
  }

  async pupil(classId: string, studentId: string) {
    const all = await this.classProgress(classId);
    const pu = all.pupils.find((p) => p.id === studentId);
    if (!pu) throw new NotFoundException('This student is not in the class');
    const rows = all.periods.map((p) => ({ ...p, ...all.table[studentId][p.key as Period] }));
    const done = rows.filter((r) => r.key !== 'FINAL' && r.score !== null);
    const trend = done.length >= 2 ? round1(done[done.length - 1].score - done[0].score) : null;
    return { class: all.class, student: pu, rows, trend };
  }

  async override(classId: string, studentId: string, d: OverrideDto) {
    await this.access.assertTeaches(classId);
    const [e] = await this.rows(sql`SELECT 1 FROM enrolments WHERE class_id = ${classId} AND student_id = ${studentId}`);
    if (!e) throw new ForbiddenException('This student is not in the class');
    const ctx = this.db.ctx;
    if ((d.score === null || d.score === undefined) && !d.comment?.trim()) {
      await this.db.q.execute(sql`DELETE FROM progress_overrides WHERE class_id = ${classId} AND student_id = ${studentId} AND period = ${d.period}`);
    } else {
      await this.db.q.execute(sql`INSERT INTO progress_overrides (publisher_id, school_id, class_id, student_id, period, score, comment, updated_by)
        VALUES (${ctx.publisherId}, ${ctx.schoolId}, ${classId}, ${studentId}, ${d.period}, ${d.score ?? null}, ${d.comment?.trim() ?? ''}, ${ctx.userId})
        ON CONFLICT (class_id, student_id, period) DO UPDATE SET score = excluded.score, comment = excluded.comment, updated_by = excluded.updated_by, updated_at = now()`);
    }
    return this.pupil(classId, studentId);
  }
}

@ApiTags('progress')
@Controller('teacher/classes/:classId')
export class ProgressController {
  constructor(private readonly svc: ProgressService) {}
  @Roles('TEACHER', 'SCHOOL_ADMIN') @Get('progress') all(@Param('classId', Id()) classId: string) { return this.svc.classProgress(classId); }
  @Roles('TEACHER', 'SCHOOL_ADMIN') @Get('students/:studentId/progress') one(@Param('classId', Id()) classId: string, @Param('studentId', Id()) studentId: string) { return this.svc.pupil(classId, studentId); }
  @Roles('TEACHER', 'SCHOOL_ADMIN') @Put('students/:studentId/progress') edit(@Param('classId', Id()) classId: string, @Param('studentId', Id()) studentId: string, @Body() d: OverrideDto) { return this.svc.override(classId, studentId, d); }
}

@Module({ imports: [LmsModule], controllers: [ProgressController], providers: [ProgressService] })
export class ProgressModule {}
