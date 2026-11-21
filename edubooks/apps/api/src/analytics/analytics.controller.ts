import { Controller, Get, Injectable, Module, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { sql } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { Roles } from '../common/decorators';
import { AccessService } from '../lms/access.service';
import { LmsModule } from '../lms/lms.module';

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : null);
const arr = (ids: string[]) => `{${ids.join(',')}}`;

/**
 * Learning analytics from data the app already keeps: marked work, hand-ins, reading progress, game attempts
 * and the daily activity table (0022). Everything stays inside the caller's tenant through RLS.
 */
@Injectable()
export class AnalyticsService {
  constructor(private readonly db: DbService, private readonly access: AccessService) {}
  private async rows(s: ReturnType<typeof sql>) { return (await this.db.q.execute(s)).rows as any[]; }

  private trend(users: ReturnType<typeof sql>, days: number) {
    return this.rows(sql`SELECT to_char(d, 'YYYY-MM-DD') AS day, count(DISTINCT a.user_id)::int AS active
      FROM generate_series(current_date - ${days - 1}::int, current_date, interval '1 day') d
      LEFT JOIN user_activity a ON a.day = d::date AND a.user_id IN (${users}) GROUP BY d ORDER BY d`);
  }

  // ------------------------------------------------------------------ class (teacher / school admin)
  async classInsights(classId: string) {
    const c = await this.access.assertTeaches(classId);
    const roster = await this.rows(sql`SELECT u.id, u.display_name AS "displayName" FROM enrolments e JOIN users u ON u.id = e.student_id WHERE e.class_id = ${classId} AND u.status = 'ACTIVE' ORDER BY u.display_name`);
    const ids = roster.map((r) => r.id);
    const inClass = sql`SELECT student_id FROM enrolments WHERE class_id = ${classId}`;
    const trend = await this.trend(inClass, 30);
    if (!ids.length) return { class: { id: c.id, name: c.name, section: c.section }, trend, students: [], lessons: [], questions: [], games: [], summary: null };
    const ua = arr(ids);
    // Work set for this class that each student was meant to do (whole class, or assigned to them).
    const work = await this.rows(sql`SELECT st.id AS student_id,
        count(*) FILTER (WHERE a.due_at IS NULL OR a.due_at < now())::int AS due,
        count(s.id) FILTER (WHERE a.due_at IS NULL OR a.due_at < now())::int AS handed,
        count(s.id)::int AS submitted,
        coalesce(sum(s.score) FILTER (WHERE s.status IN ('GRADED','RETURNED')), 0)::float AS earned,
        coalesce(sum(s.max_score) FILTER (WHERE s.status IN ('GRADED','RETURNED')), 0)::float AS possible
      FROM unnest(${ua}::uuid[]) st(id) JOIN assessments a ON a.class_id = ${classId} AND a.status <> 'DRAFT'
        AND (NOT EXISTS (SELECT 1 FROM assessment_students t WHERE t.assessment_id = a.id) OR EXISTS (SELECT 1 FROM assessment_students t WHERE t.assessment_id = a.id AND t.student_id = st.id))
      LEFT JOIN submissions s ON s.assessment_id = a.id AND s.student_id = st.id GROUP BY st.id`);
    const act = await this.rows(sql`SELECT user_id, max(day) AS last, count(*) FILTER (WHERE day > current_date - 14)::int AS days14,
        coalesce(sum(reading) FILTER (WHERE day > current_date - 30), 0)::int AS reading30 FROM user_activity WHERE user_id = ANY(${ua}::uuid[]) GROUP BY user_id`);
    const pages = await this.rows(sql`SELECT user_id, sum(max_page)::int AS pages FROM reader_progress WHERE user_id = ANY(${ua}::uuid[]) GROUP BY user_id`);
    const stars = await this.rows(sql`SELECT student_id, coalesce(sum(best), 0)::int AS stars, count(*)::int AS games FROM (SELECT student_id, activity_id, max(stars) AS best FROM game_attempts
      WHERE student_id = ANY(${ua}::uuid[]) GROUP BY 1, 2) t GROUP BY 1`);
    const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
    const students = roster.map((s) => {
      const w = work.find((x) => x.student_id === s.id) ?? { due: 0, handed: 0, earned: 0, possible: 0 };
      const a = act.find((x) => x.user_id === s.id); const last = a?.last ? new Date(a.last).toISOString().slice(0, 10) : null;
      const avg = w.possible ? Math.round((w.earned / w.possible) * 100) : null; const missing = Math.max(0, w.due - w.handed);
      const flags = [...(avg !== null && avg < 50 ? ['Low scores'] : []), ...(missing >= 2 ? ['Missing homework'] : []), ...(!last || last < weekAgo ? ['Not active this week'] : [])];
      return { ...s, average: avg, due: w.due, handed: w.handed, missing, lastActive: last, activeDays14: a?.days14 ?? 0,
        pagesRead: pages.find((p) => p.user_id === s.id)?.pages ?? 0, stars: stars.find((x) => x.student_id === s.id)?.stars ?? 0, flags };
    });
    const lessons = await this.rows(sql`SELECT l.id, u.number AS unit, l.number AS lesson, l.title, p.title AS book,
        round(avg(s.score::float / nullif(s.max_score, 0)) * 100)::int AS average, count(s.id)::int AS marked
      FROM assessments a JOIN submissions s ON s.assessment_id = a.id AND s.status IN ('GRADED','RETURNED')
      JOIN book_lessons l ON l.id = a.lesson_id JOIN book_units u ON u.id = l.unit_id JOIN book_components bc ON bc.id = u.component_id
      JOIN book_editions be ON be.id = bc.edition_id JOIN book_packages p ON p.id = be.package_id
      WHERE a.class_id = ${classId} GROUP BY l.id, u.number, p.title ORDER BY average ASC NULLS LAST, marked DESC LIMIT 10`);
    const questions = await this.rows(sql`SELECT i.id, i.prompt, i.type, a.title AS assessment, count(*)::int AS answers,
        round(avg(CASE WHEN (x->>'correct')::boolean THEN 100 ELSE 0 END))::int AS correct
      FROM submissions s JOIN assessments a ON a.id = s.assessment_id AND a.class_id = ${classId}
      CROSS JOIN LATERAL jsonb_array_elements(s.answers) x JOIN assessment_items i ON i.id = (x->>'itemId')::uuid
      WHERE x ? 'correct' AND jsonb_typeof(x->'correct') = 'boolean' GROUP BY i.id, a.title HAVING count(*) >= 2 ORDER BY correct ASC, answers DESC LIMIT 10`);
    const games = await this.rows(sql`SELECT g.id, g.title, g.engine, count(*)::int AS plays, count(DISTINCT t.student_id)::int AS players, round(avg(t.stars), 1)::float AS stars,
        round(avg(t.score::float / nullif(t.max_score, 0)) * 100)::int AS average
      FROM game_attempts t JOIN game_activities g ON g.id = t.activity_id WHERE t.student_id = ANY(${ua}::uuid[]) GROUP BY g.id ORDER BY plays DESC LIMIT 10`);
    const marked = students.filter((s) => s.average !== null);
    const due = students.reduce((n, s) => n + s.due, 0);
    return {
      class: { id: c.id, name: c.name, section: c.section }, trend, students, lessons, questions, games,
      summary: { students: students.length, average: marked.length ? Math.round(marked.reduce((n, s) => n + s.average!, 0) / marked.length) : null,
        homeworkRate: pct(students.reduce((n, s) => n + s.handed, 0), due), activeThisWeek: students.filter((s) => s.lastActive && s.lastActive >= weekAgo).length,
        needAttention: students.filter((s) => s.flags.length).length },
    };
  }

  // ------------------------------------------------------------------ school admin
  async school() {
    const classes = await this.rows(sql`SELECT c.id, c.name, c.section,
        (SELECT count(*) FROM enrolments e WHERE e.class_id = c.id)::int AS students,
        (SELECT count(DISTINCT a.user_id) FROM user_activity a JOIN enrolments e ON e.student_id = a.user_id AND e.class_id = c.id WHERE a.day > current_date - 7)::int AS active7,
        (SELECT round(avg(s.score::float / nullif(s.max_score, 0)) * 100)::int FROM submissions s JOIN assessments a ON a.id = s.assessment_id
           WHERE a.class_id = c.id AND s.status IN ('GRADED','RETURNED')) AS average,
        (SELECT count(*) FROM submissions s JOIN assessments a ON a.id = s.assessment_id WHERE a.class_id = c.id)::int AS submissions,
        (SELECT count(*) FROM assessments a WHERE a.class_id = c.id AND a.status <> 'DRAFT')::int AS assessments,
        (SELECT coalesce(sum(p.max_page), 0) FROM reader_progress p JOIN enrolments e ON e.student_id = p.user_id AND e.class_id = c.id)::int AS "pagesRead",
        (SELECT count(*) FROM game_attempts g JOIN enrolments e ON e.student_id = g.student_id AND e.class_id = c.id WHERE g.created_at > now() - interval '30 days')::int AS "gamePlays30"
      FROM classes c JOIN academic_years y ON y.id = c.academic_year_id WHERE NOT c.archived AND current_date BETWEEN y.starts_on AND y.ends_on ORDER BY c.name, c.section`);
    const students = sql`SELECT r.user_id FROM user_roles r WHERE r.role = 'STUDENT' AND r.school_id = ${this.db.ctx.schoolId}`;
    const teachers = sql`SELECT r.user_id FROM user_roles r WHERE r.role = 'TEACHER' AND r.school_id = ${this.db.ctx.schoolId}`;
    const [st, te] = [await this.trend(students, 30), await this.trend(teachers, 30)];
    const trend = st.map((d, i) => ({ day: d.day, students: d.active, teachers: te[i]?.active ?? 0 }));
    return { classes: classes.map((c) => ({ ...c, homeworkRate: c.assessments && c.students ? Math.min(100, Math.round((c.submissions / (c.assessments * c.students)) * 100)) : null })), trend };
  }

  // ------------------------------------------------------------------ publisher
  async publisher() {
    const trend = await this.rows(sql`SELECT to_char(d, 'YYYY-MM-DD') AS day,
        count(DISTINCT a.user_id) FILTER (WHERE r.role = 'STUDENT')::int AS students, count(DISTINCT a.user_id) FILTER (WHERE r.role = 'TEACHER')::int AS teachers
      FROM generate_series(current_date - 59, current_date, interval '1 day') d
      LEFT JOIN user_activity a ON a.day = d::date LEFT JOIN user_roles r ON r.user_id = a.user_id AND r.role IN ('STUDENT', 'TEACHER') GROUP BY d ORDER BY d`);
    const schools = await this.rows(sql`SELECT s.id, s.name, s.city, s.is_demo AS "isDemo",
        (SELECT count(*) FROM user_roles r JOIN users u ON u.id = r.user_id WHERE r.role = 'STUDENT' AND r.school_id = s.id AND u.status = 'ACTIVE')::int AS students,
        (SELECT count(DISTINCT a.user_id) FROM user_activity a JOIN user_roles r ON r.user_id = a.user_id AND r.role = 'STUDENT' WHERE a.school_id = s.id AND a.day > current_date - 7)::int AS active7,
        (SELECT count(DISTINCT a.user_id) FROM user_activity a JOIN user_roles r ON r.user_id = a.user_id AND r.role = 'STUDENT' WHERE a.school_id = s.id AND a.day > current_date - 30)::int AS active30,
        (SELECT count(DISTINCT a.user_id) FROM user_activity a JOIN user_roles r ON r.user_id = a.user_id AND r.role = 'TEACHER' WHERE a.school_id = s.id AND a.day > current_date - 30)::int AS teachers30,
        (SELECT coalesce(sum(reading), 0) FROM user_activity a WHERE a.school_id = s.id AND a.day > current_date - 30)::int AS reading30,
        (SELECT coalesce(sum(games), 0) FROM user_activity a WHERE a.school_id = s.id AND a.day > current_date - 30)::int AS games30,
        (SELECT coalesce(sum(homework), 0) FROM user_activity a WHERE a.school_id = s.id AND a.day > current_date - 30)::int AS homework30,
        (SELECT max(day) FROM user_activity a WHERE a.school_id = s.id) AS "lastActive"
      FROM schools s WHERE s.status = 'ACTIVE' ORDER BY s.name`);
    const books = await this.rows(sql`SELECT p.id, p.title, count(DISTINCT rp.user_id)::int AS readers, count(DISTINCT rp.school_id)::int AS schools,
        coalesce(sum(rp.max_page), 0)::int AS pages, max(rp.updated_at) AS "lastRead"
      FROM book_packages p JOIN book_editions e ON e.package_id = p.id JOIN book_components c ON c.edition_id = e.id JOIN reader_progress rp ON rp.component_id = c.id
      GROUP BY p.id ORDER BY readers DESC, pages DESC LIMIT 30`);
    const games = await this.rows(sql`SELECT g.id, g.title, g.engine, count(*)::int AS plays, count(DISTINCT t.student_id)::int AS players, count(DISTINCT t.school_id)::int AS schools,
        round(avg(t.stars), 1)::float AS stars FROM game_attempts t JOIN game_activities g ON g.id = t.activity_id
      WHERE t.created_at > now() - interval '90 days' GROUP BY g.id ORDER BY plays DESC LIMIT 15`);
    return { trend, schools: schools.map((s) => ({ ...s, engagement: pct(s.active7, s.students) })), books, games };
  }
}

@ApiTags('analytics')
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly svc: AnalyticsService) {}
  @Roles('SCHOOL_ADMIN', 'TEACHER') @Get('classes/:id') cls(@Param('id', new ParseUUIDPipe()) id: string) { return this.svc.classInsights(id); }
  @Roles('SCHOOL_ADMIN') @Get('school') school() { return this.svc.school(); }
  @Roles('PUBLISHER_ADMIN', 'PUBLISHER_EDITOR', 'PUBLISHER_SALES') @Get('publisher') publisher() { return this.svc.publisher(); }
}

@Module({ imports: [LmsModule], controllers: [AnalyticsController], providers: [AnalyticsService] })
export class AnalyticsModule {}
