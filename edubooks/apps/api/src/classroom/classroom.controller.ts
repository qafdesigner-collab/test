import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, HttpCode, Injectable, Logger, Module, NotFoundException, OnModuleDestroy, OnModuleInit, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsDateString, IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { sql } from 'drizzle-orm';
import { Roles } from '../common/decorators';
import { DbService } from '../db/db.service';
import { AuditService } from '../audit/audit.service';
import { AccessService } from '../lms/access.service';
import { LmsModule } from '../lms/lms.module';
import { NotificationsModule } from '../notifications/notifications.controller';
import { NotificationsService } from '../notifications/notifications.service';
import { ExtrasController, FameService, WeeklyPlansService } from './extras.controller';
import { addPlanToWeek } from './week-sync';
import { CompetitionsController, CompetitionsService } from './competitions.controller';

/** Stickers a teacher can give with one tap (the key is stored; the label is shown). */
export const STICKERS: Record<string, string> = {
  GREAT: '⭐ Great!', WELL_DONE: '👏 Well done', SUPER_STAR: '🌟 Super star', NEAT: '✍️ Neat work', READING: '📚 Great reading',
  CLEVER: '🧠 Clever thinking', CREATIVE: '🎨 So creative', IMPROVED: '📈 Big improvement', KIND: '❤️ Kind helper', TRY: '💪 Keep trying',
};
const KINDS = ['SUBMISSION', 'PAGE_WORK'] as const;
type Kind = (typeof KINDS)[number];

class FeedbackDto {
  @IsArray() @ArrayMaxSize(5) @IsIn(Object.keys(STICKERS), { each: true }) stickers!: string[];
  @IsOptional() @IsUUID() voiceId?: string | null;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}
class GoalDto {
  @IsUUID() classId!: string;
  @IsString() @Length(2, 120) reward!: string;
  @IsOptional() @IsString() @MaxLength(16) emoji?: string;
  @Type(() => Number) @IsInt() @Min(10) @Max(10000) target!: number;
}
class RewardDto {
  @IsString() @Length(2, 120) title!: string;
  @IsOptional() @IsString() @MaxLength(16) emoji?: string;
}
class WeekDto {
  @IsUUID() classId!: string;
  @IsUUID() editionId!: string;
  @IsOptional() @IsUUID() fromLessonId?: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/) weekStart!: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(3) perDay?: number;
}
class WeekItem { @Matches(/^\d{4}-\d{2}-\d{2}$/) date!: string; @IsUUID() lessonId!: string; }
class WeekSaveDto extends WeekDto { @IsArray() @ArrayMaxSize(30) @ValidateNested({ each: true }) @Type(() => WeekItem) items!: WeekItem[]; }

const day = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (s: string, n: number) => day(new Date(Date.parse(`${s}T12:00:00Z`) + n * 864e5));
/** Monday of the week that holds `d` (YYYY-MM-DD). */
export const mondayOf = (s: string) => { const d = new Date(`${s}T12:00:00Z`); return addDays(s, -((d.getUTCDay() + 6) % 7)); };

@Injectable()
export class ClassroomService {
  constructor(private readonly db: DbService, private readonly access: AccessService, private readonly notifications: NotificationsService, private readonly audit: AuditService) {}
  private get ctx() { return this.db.ctx; }
  private async rows(q: ReturnType<typeof sql>) { return (await this.db.q.execute(q)).rows as any[]; }
  private is(r: string) { return (this.ctx.roles ?? []).includes(r); }

  // =========================== feedback: stickers + a voice note ===========================
  /** The student a piece of work belongs to, and a short name for it. */
  private async target(kind: Kind, id: string) {
    const [t] = kind === 'SUBMISSION'
      ? await this.rows(sql`SELECT s.student_id, a.title AS what, a.id AS ref FROM submissions s JOIN assessments a ON a.id = s.assessment_id WHERE s.id = ${id}`)
      : await this.rows(sql`SELECT w.student_id, 'Book page ' || w.page AS what, w.id AS ref FROM page_work w WHERE w.id = ${id}`);
    if (!t) throw new NotFoundException('Work not found');
    return t as { student_id: string; what: string; ref: string };
  }
  /** Teachers of one of the student's classes, or the school admin. */
  private async assertTeachesStudent(studentId: string) {
    if (this.is('SCHOOL_ADMIN')) return;
    const mine = await this.access.teacherClassIds();
    const [e] = mine.length ? await this.rows(sql`SELECT 1 FROM enrolments WHERE student_id = ${studentId} AND class_id IN ${mine}`) : [];
    if (!e) throw new ForbiddenException('You do not teach this student');
  }
  /** The student, their parents, and their teachers may see it. */
  private async assertCanSee(studentId: string) {
    if (this.ctx.userId === studentId) return;
    if (this.is('PARENT')) { const [p] = await this.rows(sql`SELECT 1 FROM parent_students WHERE parent_id = ${this.ctx.userId} AND student_id = ${studentId}`); if (p) return; throw new ForbiddenException(); }
    if (this.is('TEACHER') || this.is('SCHOOL_ADMIN')) return this.assertTeachesStudent(studentId);
    throw new ForbiddenException();
  }
  private shape(f: any) {
    return f ? { id: f.id, stickers: (f.stickers as string[]).map((k) => ({ key: k, label: STICKERS[k] ?? k })), voiceId: f.voice_id, note: f.note, teacher: f.teacher ?? null, updatedAt: f.updated_at, seen: !!f.seen_at } : null;
  }
  async getFeedback(kind: Kind, id: string) {
    const t = await this.target(kind, id); await this.assertCanSee(t.student_id);
    const [f] = await this.rows(sql`SELECT f.*, u.display_name AS teacher FROM work_feedback f LEFT JOIN users u ON u.id = f.teacher_id WHERE f.target_kind = ${kind} AND f.target_id = ${id}`);
    if (f && this.ctx.userId === t.student_id && !f.seen_at) await this.rows(sql`UPDATE work_feedback SET seen_at = now() WHERE id = ${f.id}`);
    return this.shape(f);
  }
  async setFeedback(kind: Kind, id: string, d: FeedbackDto) {
    const t = await this.target(kind, id); await this.assertTeachesStudent(t.student_id);
    const stickers = [...new Set(d.stickers)]; const note = (d.note ?? '').trim(); const voice = d.voiceId ?? null;
    if (voice) {
      const [c] = await this.rows(sql`SELECT 1 FROM audio_clips WHERE id = ${voice} AND owner_id = ${this.ctx.userId} AND kind = 'FEEDBACK'`);
      if (!c) throw new BadRequestException('Record the voice note again');
    }
    const [old] = await this.rows(sql`SELECT * FROM work_feedback WHERE target_kind = ${kind} AND target_id = ${id}`);
    if (!stickers.length && !voice && !note) {
      if (old) await this.rows(sql`DELETE FROM work_feedback WHERE id = ${old.id}`);
      return null;
    }
    const [f] = await this.rows(sql`INSERT INTO work_feedback (publisher_id, school_id, student_id, teacher_id, target_kind, target_id, stickers, voice_id, note)
      VALUES (${this.ctx.publisherId}, ${this.ctx.schoolId}, ${t.student_id}, ${this.ctx.userId}, ${kind}, ${id}, ${`{${stickers.join(',')}}`}::text[], ${voice}, ${note})
      ON CONFLICT (target_kind, target_id) DO UPDATE SET stickers = EXCLUDED.stickers, voice_id = EXCLUDED.voice_id, note = EXCLUDED.note, teacher_id = EXCLUDED.teacher_id, updated_at = now(), seen_at = NULL
      RETURNING *`);
    // tell the child and the parents when something new was added
    const fresh = stickers.some((s) => !(old?.stickers ?? []).includes(s)) || (voice && voice !== old?.voice_id);
    if (fresh) {
      const [me] = await this.rows(sql`SELECT display_name FROM users WHERE id = ${this.ctx.userId}`);
      const what = [...stickers.map((s) => STICKERS[s]), voice ? '🎤 a voice note' : ''].filter(Boolean).join(' · ');
      const title = `${what} from ${me.display_name}`.slice(0, 200);
      await this.notifications.notify([{ id: t.student_id }], { kind: 'FEEDBACK', title, body: t.what, link: kind === 'SUBMISSION' ? `/homework/${t.ref}` : '/learn' });
      const parents = await this.rows(sql`SELECT parent_id AS id FROM parent_students WHERE student_id = ${t.student_id}`);
      await this.notifications.notify(parents, { kind: 'FEEDBACK', title, body: t.what, link: '/parent' });
    }
    return this.shape({ ...f, teacher: null });
  }
  /** The newest feedback for a child (the child, a parent or a teacher), for "From my teacher" walls. */
  async recent(studentId: string, limit = 12) {
    await this.assertCanSee(studentId);
    const list = await this.rows(sql`SELECT f.*, u.display_name AS teacher,
        CASE f.target_kind WHEN 'SUBMISSION' THEN (SELECT a.title FROM submissions s JOIN assessments a ON a.id = s.assessment_id WHERE s.id = f.target_id)
          ELSE (SELECT 'Book page ' || w.page FROM page_work w WHERE w.id = f.target_id) END AS what,
        CASE f.target_kind WHEN 'SUBMISSION' THEN (SELECT s.assessment_id FROM submissions s WHERE s.id = f.target_id) END AS "assessmentId"
      FROM work_feedback f LEFT JOIN users u ON u.id = f.teacher_id WHERE f.student_id = ${studentId} ORDER BY f.updated_at DESC LIMIT ${Math.min(limit, 50)}`);
    return list.map((f) => ({ ...this.shape(f), kind: f.target_kind, targetId: f.target_id, what: f.what, assessmentId: f.assessmentId }));
  }

  // =========================== class reward goals ===========================
  /** Stars the class earned since the goal began: games (best per game and day), homework, book work and stickers. */
  private async progress(g: any) {
    const [r] = await this.rows(sql`WITH kids AS (SELECT student_id FROM enrolments WHERE class_id = ${g.class_id})
      SELECT
        coalesce((SELECT sum(best) FROM (SELECT max(stars) AS best FROM game_attempts WHERE student_id IN (SELECT student_id FROM kids) AND created_at >= ${g.starts_at}
          GROUP BY student_id, activity_id, created_at::date) x), 0)::int
      + coalesce((SELECT sum(CASE WHEN score::float / NULLIF(max_score, 0) >= 0.9 THEN 3 WHEN score::float / NULLIF(max_score, 0) >= 0.6 THEN 2 ELSE 1 END)
          FROM submissions WHERE student_id IN (SELECT student_id FROM kids) AND status IN ('GRADED', 'RETURNED') AND coalesce(graded_at, created_at) >= ${g.starts_at}), 0)::int
      + coalesce((SELECT sum(stars) FROM page_work WHERE student_id IN (SELECT student_id FROM kids) AND created_at >= ${g.starts_at}), 0)::int
      + coalesce((SELECT sum(cardinality(stickers)) FROM work_feedback WHERE student_id IN (SELECT student_id FROM kids) AND updated_at >= ${g.starts_at}), 0)::int AS stars,
        (SELECT count(*)::int FROM kids) AS kids`);
    return { stars: r.stars as number, kids: r.kids as number };
  }
  private async withProgress(g: any) {
    const p = await this.progress(g);
    // the goal is reached: celebrate once, with everyone in the class and their parents
    if (g.status === 'ACTIVE' && p.stars >= g.target) {
      const [done] = await this.rows(sql`UPDATE class_goals SET status = 'DONE', reached_at = now() WHERE id = ${g.id} AND status = 'ACTIVE' RETURNING reached_at`);
      if (done) {
        g.status = 'DONE'; g.reached_at = done.reached_at;
        const kids = await this.rows(sql`SELECT student_id AS id FROM enrolments WHERE class_id = ${g.class_id}`);
        const parents = kids.length ? await this.rows(sql`SELECT DISTINCT parent_id AS id FROM parent_students WHERE student_id IN ${kids.map((k) => k.id)}`) : [];
        const title = `${g.emoji} Our class did it! ${g.target} stars — ${g.reward}`;
        await this.notifications.notify(kids, { kind: 'GOAL', title, link: '/learn' });
        await this.notifications.notify(parents, { kind: 'GOAL', title, link: '/parent' });
        if (g.teacher_id && g.teacher_id !== this.ctx.userId) await this.notifications.notify([{ id: g.teacher_id }], { kind: 'GOAL', title, link: '/teacher' });
      }
    }
    return { id: g.id, classId: g.class_id, className: g.class_name, reward: g.reward, emoji: g.emoji, target: g.target, startsAt: g.starts_at, reachedAt: g.reached_at, status: g.status,
      stars: Math.min(p.stars, g.target), earned: p.stars, kids: p.kids };
  }
  private goalSelect = sql`SELECT g.*, c.name || CASE WHEN c.section <> '' THEN ' ' || c.section ELSE '' END AS class_name FROM class_goals g JOIN classes c ON c.id = g.class_id`;
  async teacherGoals(classId?: string) {
    const mine = this.is('SCHOOL_ADMIN') ? null : await this.access.teacherClassIds();
    if (mine && !mine.length) return [];
    const list = await this.rows(sql`${this.goalSelect} WHERE ${mine ? sql`g.class_id IN ${mine}` : sql`TRUE`} ${classId ? sql`AND g.class_id = ${classId}` : sql``}
      AND (g.status = 'ACTIVE' OR g.created_at > now() - interval '60 days') ORDER BY g.status = 'ACTIVE' DESC, g.created_at DESC LIMIT 30`);
    return Promise.all(list.map((g) => this.withProgress(g)));
  }
  async createGoal(d: GoalDto) {
    await this.access.assertTeaches(d.classId);
    const [has] = await this.rows(sql`SELECT 1 FROM class_goals WHERE class_id = ${d.classId} AND status = 'ACTIVE'`);
    if (has) throw new BadRequestException('This class already has a goal. Stop it first to start a new one.');
    const [g] = await this.rows(sql`INSERT INTO class_goals (publisher_id, school_id, class_id, teacher_id, reward, emoji, target)
      VALUES (${this.ctx.publisherId}, ${this.ctx.schoolId}, ${d.classId}, ${this.ctx.userId}, ${d.reward.trim()}, ${(d.emoji || '🎉').slice(0, 16)}, ${d.target}) RETURNING id`);
    const kids = await this.rows(sql`SELECT student_id AS id FROM enrolments WHERE class_id = ${d.classId}`);
    await this.notifications.notify(kids, { kind: 'GOAL', title: `${d.emoji || '🎉'} New class goal: ${d.target} stars → ${d.reward.trim()}`, body: 'Play, read and do your homework — every star counts for the whole class!', link: '/learn' });
    await this.audit.log('classroom.goal', 'class', d.classId, `Started a class goal: ${d.target} stars → ${d.reward}`);
    const [row] = await this.rows(sql`${this.goalSelect} WHERE g.id = ${g.id}`);
    return this.withProgress(row);
  }
  async stopGoal(id: string) {
    const [g] = await this.rows(sql`SELECT * FROM class_goals WHERE id = ${id}`);
    if (!g) throw new NotFoundException('Goal not found');
    await this.access.assertTeaches(g.class_id);
    await this.rows(sql`UPDATE class_goals SET status = 'STOPPED' WHERE id = ${id} AND status = 'ACTIVE'`);
    return { ok: true };
  }
  /** The school's reward list: everyone in the school sees it; teachers and the school admin add to it. */
  async rewards() {
    return this.rows(sql`SELECT r.id, r.emoji, r.title, r.created_by AS "createdBy", u.display_name AS "by",
        (r.created_by = ${this.ctx.userId} OR ${this.is('SCHOOL_ADMIN')}) AS "canDelete"
      FROM school_rewards r LEFT JOIN users u ON u.id = r.created_by ORDER BY r.created_at`);
  }
  async addReward(d: RewardDto) {
    const title = d.title.trim().replace(/\s+/g, ' ');
    const [dup] = await this.rows(sql`SELECT id FROM school_rewards WHERE lower(title) = lower(${title})`);
    if (dup) throw new BadRequestException('This reward is already in the list');
    const [r] = await this.rows(sql`INSERT INTO school_rewards (publisher_id, school_id, emoji, title, created_by)
      VALUES (${this.ctx.publisherId}, ${this.ctx.schoolId}, ${(d.emoji || '🎁').trim().slice(0, 16)}, ${title}, ${this.ctx.userId}) RETURNING id, emoji, title`);
    return r;
  }
  async removeReward(id: string) {
    const [r] = await this.rows(sql`SELECT created_by FROM school_rewards WHERE id = ${id}`);
    if (!r) throw new NotFoundException('Reward not found');
    if (r.created_by !== this.ctx.userId && !this.is('SCHOOL_ADMIN')) throw new ForbiddenException('Only the person who added it, or the school admin, can remove it');
    await this.rows(sql`DELETE FROM school_rewards WHERE id = ${id}`);
    return { ok: true };
  }

  /** A student's class goals (active, or reached in the last week), with what they themselves added. */
  async myGoals() {
    const classes = await this.access.studentClassIds();
    if (!classes.length) return [];
    const list = await this.rows(sql`${this.goalSelect} WHERE g.class_id IN ${classes} AND (g.status = 'ACTIVE' OR (g.status = 'DONE' AND g.reached_at > now() - interval '7 days')) ORDER BY g.created_at DESC`);
    return Promise.all(list.map((g) => this.withProgress(g)));
  }

  // =========================== plan my week ===========================
  /** Lessons of a book in order. */
  private async lessons(editionId: string) {
    return this.rows(sql`SELECT l.id, l.title, l.number, u.number AS unit, u.title AS "unitTitle"
      FROM book_lessons l JOIN book_units u ON u.id = l.unit_id JOIN book_components c ON c.id = u.component_id
      WHERE c.edition_id = ${editionId} ORDER BY c.sort, u.sort, u.number, l.sort, l.number`);
  }
  async weekPreview(d: WeekDto) {
    await this.access.assertTeaches(d.classId); await this.access.assertEdition(d.editionId);
    const monday = mondayOf(d.weekStart); const days = [0, 1, 2, 3, 4].map((i) => addDays(monday, i));
    const all = await this.lessons(d.editionId);
    if (!all.length) throw new BadRequestException('This book has no lessons in its index yet');
    // start after the last lesson already planned for this class (or where the teacher chose)
    let start = 0;
    if (d.fromLessonId) start = Math.max(0, all.findIndex((l) => l.id === d.fromLessonId));
    else {
      const done = new Set((await this.rows(sql`SELECT lesson_id FROM lesson_plans WHERE class_id = ${d.classId} AND edition_id = ${d.editionId} AND lesson_id IS NOT NULL AND (plan_date IS NULL OR plan_date < ${monday}::date)`)).map((r) => r.lesson_id));
      const last = all.reduce((m, l, i) => (done.has(l.id) ? i : m), -1); start = last + 1;
    }
    // holidays from the school's calendar (and the publisher's calendar for its curriculum)
    const [sc] = await this.rows(sql`SELECT curriculum_id FROM schools WHERE id = ${this.ctx.schoolId}`);
    const hol = await this.rows(sql`SELECT title, starts_on::text AS a, ends_on::text AS b FROM calendar_events
      WHERE kind = 'HOLIDAY' AND starts_on <= ${days[4]}::date AND ends_on >= ${days[0]}::date
        AND (school_id = ${this.ctx.schoolId} OR (school_id IS NULL AND ${sc?.curriculum_id ? sql`(curriculum_id IS NULL OR curriculum_id = ${sc.curriculum_id})` : sql`curriculum_id IS NULL`}))`);
    // the class timetable: on days with this book's subject, one lesson per period
    const slots = await this.rows(sql`SELECT t.weekday, count(*)::int AS n FROM timetable_slots t
      WHERE t.class_id = ${d.classId} AND t.subject_id = (SELECT p.subject_id FROM book_editions e JOIN book_packages p ON p.id = e.package_id WHERE e.id = ${d.editionId}) GROUP BY t.weekday`);
    const perDay = (wd: number) => (slots.length ? slots.find((s) => s.weekday === wd)?.n ?? 0 : d.perDay ?? 1);
    let i = start;
    const out = days.map((date, k) => {
      const h = hol.find((x) => x.a <= date && x.b >= date);
      const n = h ? 0 : Math.min(3, perDay(k + 1));
      const lessons = []; for (let j = 0; j < n && i < all.length; j++, i++) lessons.push({ lessonId: all[i].id, title: `Unit ${all[i].unit} · Lesson ${all[i].number}: ${all[i].title}` });
      return { date, weekday: k + 1, holiday: h?.title ?? null, lessons };
    });
    return { weekStart: monday, fromTimetable: slots.length > 0, days: out, left: Math.max(0, all.length - i) };
  }
  async weekSave(d: WeekSaveDto) {
    await this.access.assertTeaches(d.classId); await this.access.assertEdition(d.editionId);
    const all = await this.lessons(d.editionId); const made: any[] = [];
    for (const it of d.items) {
      const l = all.find((x) => x.id === it.lessonId); if (!l) throw new BadRequestException('A lesson is not in this book');
      const title = `Unit ${l.unit} · Lesson ${l.number}: ${l.title}`;
      const [p] = await this.rows(sql`INSERT INTO lesson_plans (publisher_id, school_id, teacher_id, class_id, edition_id, lesson_id, title, plan_date, duration_min, content, status)
        VALUES (${this.ctx.publisherId}, ${this.ctx.schoolId}, ${this.ctx.userId}, ${d.classId}, ${d.editionId}, ${l.id}, ${title}, ${`${it.date}T08:00:00Z`}, 40,
          ${JSON.stringify({ objectives: '', notes: 'Planned with “Plan my week”. Open it and press “Write with AI” to fill in the steps.' })}::jsonb, 'DRAFT') RETURNING id, title, plan_date AS "planDate"`);
      made.push(p);
      await addPlanToWeek((q) => this.db.q.execute(q) as any, this.ctx as any, { id: p.id, classId: d.classId, editionId: d.editionId, lessonId: l.id, planDate: p.planDate, title });
    }
    await this.audit.log('lms.plan.week', 'class', d.classId, `Planned the week of ${mondayOf(d.weekStart)}: ${made.length} lessons`);
    return { created: made.length, plans: made };
  }

  // =========================== the parents' weekly summary ===========================
  /** What one child did in the last 7 days, and what is coming next week. */
  async weekSummary(studentId: string) {
    await this.assertCanSee(studentId);
    const [kid] = await this.rows(sql`SELECT id, display_name AS name FROM users WHERE id = ${studentId}`);
    const classes = (await this.rows(sql`SELECT class_id FROM enrolments WHERE student_id = ${studentId}`)).map((r) => r.class_id);
    const inClass = classes.length ? sql`IN ${classes}` : sql`IN (NULL::uuid)`;
    const [n] = await this.rows(sql`SELECT
        (SELECT count(*)::int FROM game_attempts WHERE student_id = ${studentId} AND created_at > now() - interval '7 days') AS games,
        (SELECT coalesce(sum(stars), 0)::int FROM game_attempts WHERE student_id = ${studentId} AND created_at > now() - interval '7 days') AS "gameStars",
        (SELECT count(*)::int FROM submissions WHERE student_id = ${studentId} AND created_at > now() - interval '7 days') AS "homeworkDone",
        (SELECT round(avg(score * 100.0 / NULLIF(max_score, 0)))::int FROM submissions WHERE student_id = ${studentId} AND score IS NOT NULL AND created_at > now() - interval '7 days') AS "avgScore",
        (SELECT count(*)::int FROM page_work WHERE student_id = ${studentId} AND created_at > now() - interval '7 days') AS "bookWork",
        (SELECT coalesce(sum(max_page), 0)::int FROM reader_progress WHERE user_id = ${studentId} AND updated_at > now() - interval '7 days') AS "pagesOpen",
        (SELECT count(*)::int FROM attendance WHERE student_id = ${studentId} AND day > current_date - 7 AND status = 'PRESENT') AS present,
        (SELECT count(*)::int FROM attendance WHERE student_id = ${studentId} AND day > current_date - 7 AND status = 'ABSENT') AS absent,
        (SELECT count(*)::int FROM attendance WHERE student_id = ${studentId} AND day > current_date - 7 AND status = 'LATE') AS late`);
    const missing = await this.rows(sql`SELECT a.id, a.title, a.due_at AS "dueAt" FROM assessments a WHERE a.class_id ${inClass} AND a.status = 'PUBLISHED'
      AND a.due_at BETWEEN now() - interval '7 days' AND now() AND NOT EXISTS (SELECT 1 FROM submissions s WHERE s.assessment_id = a.id AND s.student_id = ${studentId}) ORDER BY a.due_at LIMIT 10`);
    const learned = await this.rows(sql`SELECT DISTINCT ON (lp.lesson_id) lp.title FROM lesson_plans lp WHERE lp.class_id ${inClass} AND lp.plan_date BETWEEN now() - interval '7 days' AND now() + interval '1 day'
      UNION SELECT DISTINCT a.title FROM assessments a WHERE a.class_id ${inClass} AND a.status = 'PUBLISHED' AND a.created_at > now() - interval '7 days' LIMIT 12`);
    const badges = await this.rows(sql`SELECT badge FROM student_badges WHERE student_id = ${studentId} AND created_at > now() - interval '7 days'`);
    const feedback = await this.rows(sql`SELECT f.stickers, f.voice_id AS "voiceId", f.note, u.display_name AS teacher FROM work_feedback f LEFT JOIN users u ON u.id = f.teacher_id
      WHERE f.student_id = ${studentId} AND f.updated_at > now() - interval '7 days' ORDER BY f.updated_at DESC LIMIT 10`);
    const [sc] = await this.rows(sql`SELECT curriculum_id FROM schools WHERE id = ${this.ctx.schoolId}`);
    const next = [
      ...(await this.rows(sql`SELECT title, starts_on::text AS "on", kind FROM calendar_events WHERE starts_on BETWEEN current_date AND current_date + 9
        AND (school_id = ${this.ctx.schoolId} OR (school_id IS NULL AND ${sc?.curriculum_id ? sql`(curriculum_id IS NULL OR curriculum_id = ${sc.curriculum_id})` : sql`curriculum_id IS NULL`})) ORDER BY starts_on LIMIT 8`)),
      ...(await this.rows(sql`SELECT title, event_at::date::text AS "on", 'EVENT' AS kind FROM timeline_posts WHERE kind = 'EVENT' AND event_at BETWEEN now() AND now() + interval '9 days'
        AND (class_id IS NULL OR class_id ${inClass}) ORDER BY event_at LIMIT 8`)),
      ...(await this.rows(sql`SELECT '📝 ' || title AS title, due_at::date::text AS "on", 'HOMEWORK' AS kind FROM assessments WHERE class_id ${inClass} AND status = 'PUBLISHED' AND due_at BETWEEN now() AND now() + interval '9 days'
        AND NOT EXISTS (SELECT 1 FROM submissions s WHERE s.assessment_id = assessments.id AND s.student_id = ${studentId}) ORDER BY due_at LIMIT 8`)),
    ].sort((a, b) => a.on.localeCompare(b.on));
    const goals = classes.length ? await Promise.all((await this.rows(sql`${this.goalSelect} WHERE g.class_id IN ${classes} AND g.status = 'ACTIVE'`)).map((g) => this.withProgress(g))) : [];
    const stickers = feedback.reduce((s, f) => s + (f.stickers as string[]).length, 0);
    return {
      child: kid, from: day(new Date(Date.now() - 6 * 864e5)), to: day(new Date()),
      numbers: { ...n, stickers, stars: n.gameStars + stickers },
      learned: learned.map((l) => l.title), missing, badges: badges.map((b) => b.badge),
      feedback: feedback.map((f) => ({ ...f, stickers: (f.stickers as string[]).map((k) => STICKERS[k] ?? k) })),
      next, goals,
    };
  }
  /** The children a parent may choose from. */
  async myChildren() {
    return this.rows(sql`SELECT u.id, u.display_name AS name FROM parent_students ps JOIN users u ON u.id = ps.student_id WHERE ps.parent_id = ${this.ctx.userId} ORDER BY u.display_name`);
  }
}

/** Fridays (14:00 in the school's time zone, Asia/Dubai unless DIGEST_TZ says otherwise): every parent gets their child's week. */
@Injectable()
export class WeeklyDigestJob implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('WeeklyDigest'); private timer?: NodeJS.Timeout;
  constructor(private readonly db: DbService, private readonly svc: ClassroomService, private readonly notifications: NotificationsService) {}
  onModuleInit() {
    if (process.env.NODE_ENV === 'test' || process.env.DISABLE_JOBS === '1') return;
    const run = () => { if (this.due()) this.send().catch((e) => this.log.error(`weekly summary failed: ${e.message}`)); };
    setTimeout(run, 90_000).unref(); this.timer = setInterval(run, 3600_000); this.timer.unref();
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }
  private local(d = new Date()) {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: process.env.DIGEST_TZ || 'Asia/Dubai', weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false })
      .formatToParts(d).map((x) => [x.type, x.value]));
    return { weekday: p.weekday, date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) };
  }
  due() { const l = this.local(); return l.weekday === (process.env.DIGEST_DAY || 'Fri') && l.hour >= 14; }
  /** Sends the summaries not sent yet this week. Returns how many went out. */
  async send() {
    const week = mondayOf(this.local().date); let n = 0;
    const { rows } = await this.db.root.execute(sql`SELECT * FROM weekly_digest_due(${week}::date)`);
    for (const r of rows as any[]) {
      const ctx = { userId: r.parent_id, publisherId: r.publisher_id, schoolId: r.school_id, roles: ['PARENT'], staff: false };
      try {
        await this.db.detached(ctx as any, async () => {
          const s = await this.svc.weekSummary(r.student_id);
          const first = String(s.child.name).split(/\s+/)[0];
          const bits = [`⭐ ${s.numbers.stars}`, `📝 ${s.numbers.homeworkDone} homework`, `🎮 ${s.numbers.games} games`, s.numbers.stickers ? `🏅 ${s.numbers.stickers} stickers` : '', s.missing.length ? `⚠️ ${s.missing.length} not handed in` : ''].filter(Boolean).join(' · ');
          await this.notifications.notify([{ id: r.parent_id }], { kind: 'WEEKLY', title: `📅 ${first}'s week · ${bits}`.slice(0, 200),
            body: [s.learned.length ? `Learned: ${s.learned.slice(0, 4).join(', ')}` : '', s.next.length ? `Next week: ${s.next.slice(0, 3).map((x: any) => x.title).join(', ')}` : ''].filter(Boolean).join('\n'),
            link: `/parent/week?student=${r.student_id}` });
          await this.db.q.execute(sql`INSERT INTO weekly_digests (parent_id, student_id, week_start, publisher_id, school_id) VALUES (${r.parent_id}, ${r.student_id}, ${week}::date, ${r.publisher_id}, ${r.school_id}) ON CONFLICT DO NOTHING`);
        });
        n++;
      } catch (e: any) { this.log.warn(`summary for a parent failed: ${e.message}`); }
    }
    if (n) this.log.log(`sent ${n} weekly summaries`);
    return n;
  }
}

@ApiTags('classroom')
@Controller()
export class ClassroomController {
  constructor(private readonly svc: ClassroomService) {}
  // feedback (under /feedback; parents may read it)
  @Roles('TEACHER', 'SCHOOL_ADMIN', 'STUDENT', 'PARENT') @Get('feedback/student/:studentId') recent(@Param('studentId', ParseUUIDPipe) s: string) { return this.svc.recent(s); }
  @Roles('TEACHER', 'SCHOOL_ADMIN', 'STUDENT', 'PARENT') @Get('feedback/:kind/:id') get(@Param('kind') kind: string, @Param('id', ParseUUIDPipe) id: string) { return this.svc.getFeedback(this.kind(kind), id); }
  @Roles('TEACHER', 'SCHOOL_ADMIN') @Put('feedback/:kind/:id') set(@Param('kind') kind: string, @Param('id', ParseUUIDPipe) id: string, @Body() d: FeedbackDto) { return this.svc.setFeedback(this.kind(kind), id, d); }
  @Roles('TEACHER', 'SCHOOL_ADMIN', 'STUDENT', 'PARENT') @Get('feedback-stickers') stickers() { return STICKERS; }
  // class goals
  @Roles('TEACHER', 'SCHOOL_ADMIN') @Get('classroom/goals') goals(@Query('classId') classId?: string) { return this.svc.teacherGoals(classId); }
  @Roles('TEACHER', 'SCHOOL_ADMIN') @Post('classroom/goals') createGoal(@Body() d: GoalDto) { return this.svc.createGoal(d); }
  @Roles('TEACHER', 'SCHOOL_ADMIN') @Delete('classroom/goals/:id') stopGoal(@Param('id', ParseUUIDPipe) id: string) { return this.svc.stopGoal(id); }
  @Roles('TEACHER', 'SCHOOL_ADMIN') @Get('classroom/rewards') rewards() { return this.svc.rewards(); }
  @Roles('TEACHER', 'SCHOOL_ADMIN') @Post('classroom/rewards') addReward(@Body() d: RewardDto) { return this.svc.addReward(d); }
  @Roles('TEACHER', 'SCHOOL_ADMIN') @Delete('classroom/rewards/:id') removeReward(@Param('id', ParseUUIDPipe) id: string) { return this.svc.removeReward(id); }
  @Roles('STUDENT') @Get('classroom/my-goals') myGoals() { return this.svc.myGoals(); }
  // plan my week
  @Roles('TEACHER', 'SCHOOL_ADMIN') @Post('teacher/plans/week/preview') @HttpCode(200) preview(@Body() d: WeekDto) { return this.svc.weekPreview(d); }
  @Roles('TEACHER', 'SCHOOL_ADMIN') @Post('teacher/plans/week') saveWeek(@Body() d: WeekSaveDto) { return this.svc.weekSave(d); }
  // the weekly summary (parents; teachers can look too)
  @Roles('PARENT') @Get('parent/week/children') children() { return this.svc.myChildren(); }
  @Roles('PARENT', 'TEACHER', 'SCHOOL_ADMIN') @Get('parent/week/:studentId') week(@Param('studentId', ParseUUIDPipe) s: string) { return this.svc.weekSummary(s); }
  private kind(k: string): Kind { const u = k.toUpperCase().replace('-', '_'); if (!(KINDS as readonly string[]).includes(u)) throw new BadRequestException('Unknown kind of work'); return u as Kind; }
}

@Module({ imports: [LmsModule, NotificationsModule], controllers: [ClassroomController, ExtrasController, CompetitionsController], providers: [ClassroomService, WeeklyDigestJob, WeeklyPlansService, FameService, CompetitionsService], exports: [ClassroomService, WeeklyDigestJob] })
export class ClassroomModule {}
