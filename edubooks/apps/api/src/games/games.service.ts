import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq, inArray, isNotNull, isNull, or, sql, SQL } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { qc } from '../db/qualify';
import { bookEditions, bookPackages, gameActivities, gameAssignments, gameAttempts, studentBadges, users } from '../db/schema';
import { AuditService } from '../audit/audit.service';
import { AccessService } from '../lms/access.service';
import { BADGES, Engine, starsFor, validateContent } from './engines';

export interface GameInput {
  engine: Engine; title: string; instructions?: string; difficulty?: number; editionId?: string | null; lessonId?: string | null; content: unknown; published?: boolean;
}

@Injectable()
export class GamesService {
  constructor(private readonly db: DbService, private readonly audit: AuditService, private readonly access: AccessService) {}
  private get q() { return this.db.q; }
  private get ctx() { return this.db.ctx; }

  private listSelect() {
    return {
      id: gameActivities.id, engine: gameActivities.engine, title: gameActivities.title, instructions: gameActivities.instructions, difficulty: gameActivities.difficulty,
      editionId: gameActivities.editionId, lessonId: gameActivities.lessonId, published: gameActivities.published, schoolId: gameActivities.schoolId, updatedAt: gameActivities.updatedAt,
      bookTitle: sql<string | null>`(SELECT p.title FROM book_editions e JOIN book_packages p ON p.id = e.package_id WHERE e.id = ${qc(gameActivities.editionId)})`,
      coverColor: sql<string | null>`(SELECT p.cover_color FROM book_editions e JOIN book_packages p ON p.id = e.package_id WHERE e.id = ${qc(gameActivities.editionId)})`,
      lesson: sql<string | null>`(SELECT 'Unit ' || u.number || ' · Lesson ' || l.number || ': ' || l.title FROM book_lessons l JOIN book_units u ON u.id = l.unit_id WHERE l.id = ${qc(gameActivities.lessonId)})`,
    };
  }

  /** Lesson must belong to the edition. */
  private async refs(editionId?: string | null, lessonId?: string | null) {
    if (!editionId) { if (lessonId) throw new BadRequestException('Choose the book first'); return { editionId: null, lessonId: null }; }
    if (lessonId) {
      const { rows } = await this.q.execute(sql`SELECT c.edition_id FROM book_lessons l JOIN book_units u ON u.id = l.unit_id JOIN book_components c ON c.id = u.component_id WHERE l.id = ${lessonId}`);
      if ((rows[0] as any)?.edition_id !== editionId) throw new BadRequestException('That lesson is not in this book');
    }
    return { editionId, lessonId: lessonId ?? null };
  }

  // ===================== publisher library =====================
  libraryList(f: { editionId?: string; engine?: string }) {
    const w: SQL[] = [isNull(gameActivities.schoolId)];
    if (f.editionId) w.push(eq(gameActivities.editionId, f.editionId));
    if (f.engine) w.push(eq(gameActivities.engine, f.engine as Engine));
    return this.q.select(this.listSelect()).from(gameActivities).where(and(...w)).orderBy(desc(gameActivities.updatedAt)).limit(500);
  }
  async get(id: string) {
    const [g] = await this.q.select().from(gameActivities).where(eq(gameActivities.id, id));
    if (!g) throw new NotFoundException('Game not found');
    return g;
  }
  async create(d: GameInput, schoolId: string | null) {
    const { content } = validateContent(d.engine, d.content);
    const refs = await this.refs(d.editionId, d.lessonId);
    if (schoolId && refs.editionId) await this.access.assertEdition(refs.editionId);
    const [g] = await this.q.insert(gameActivities).values({ publisherId: this.ctx.publisherId, schoolId, ...refs, engine: d.engine, title: d.title.trim(), instructions: d.instructions ?? '',
      difficulty: d.difficulty ?? 1, content, published: d.published ?? !!schoolId, createdBy: this.ctx.userId }).returning();
    await this.audit.log('games.create', 'game', g.id, `Created game “${g.title}” (${g.engine.toLowerCase().replace('_', ' ')})`);
    return g;
  }
  async update(id: string, d: Partial<GameInput>, schoolId: string | null) {
    const g = await this.get(id);
    if ((g.schoolId ?? null) !== schoolId) throw new ForbiddenException('You can only edit your own games');
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (d.title !== undefined) patch.title = d.title.trim();
    if (d.instructions !== undefined) patch.instructions = d.instructions;
    if (d.difficulty !== undefined) patch.difficulty = d.difficulty;
    if (d.published !== undefined) patch.published = d.published;
    if (d.content !== undefined) patch.content = validateContent((d.engine ?? g.engine) as Engine, d.content).content;
    if (d.editionId !== undefined || d.lessonId !== undefined) Object.assign(patch, await this.refs(d.editionId ?? g.editionId, d.lessonId === undefined ? g.lessonId : d.lessonId));
    const [row] = await this.q.update(gameActivities).set(patch).where(eq(gameActivities.id, id)).returning();
    return row;
  }
  async remove(id: string, schoolId: string | null) {
    const g = await this.get(id);
    if ((g.schoolId ?? null) !== schoolId) throw new ForbiddenException('You can only delete your own games');
    await this.q.delete(gameActivities).where(eq(gameActivities.id, id));
    await this.audit.log('games.delete', 'game', id, `Deleted game “${g.title}”`);
    return { ok: true };
  }

  // ===================== teacher =====================
  /** Games a teacher can use: published library games of their licensed books + their school's games. */
  async teacherList(f: { editionId?: string; lessonId?: string }) {
    const eds = await this.access.editions();
    const lib = eds === 'ALL' ? sql`TRUE` : eds.length ? inArray(gameActivities.editionId, eds) : sql`FALSE`;
    const w: SQL[] = [or(and(isNull(gameActivities.schoolId), eq(gameActivities.published, true), lib), eq(gameActivities.schoolId, this.ctx.schoolId!))!];
    if (f.editionId) w.push(eq(gameActivities.editionId, f.editionId));
    if (f.lessonId) w.push(eq(gameActivities.lessonId, f.lessonId));
    const games = await this.q.select(this.listSelect()).from(gameActivities).where(and(...w)).orderBy(asc(gameActivities.title));
    const classIds = await this.access.teacherClassIds();
    const assigns = games.length && classIds.length ? await this.q.select({ id: gameAssignments.id, activityId: gameAssignments.activityId, classId: gameAssignments.classId, dueAt: gameAssignments.dueAt })
      .from(gameAssignments).where(and(inArray(gameAssignments.classId, classIds), inArray(gameAssignments.activityId, games.map((g) => g.id)))) : [];
    return games.map((g) => ({ ...g, own: g.schoolId === this.ctx.schoolId, assignments: assigns.filter((a) => a.activityId === g.id) }));
  }
  /** Full game for previewing (teachers) — same visibility rules. */
  async teacherGet(id: string) {
    const g = await this.get(id);
    if (g.schoolId ? g.schoolId !== this.ctx.schoolId : !g.published) throw new NotFoundException('Game not found');
    if (!g.schoolId && g.editionId) await this.access.assertEdition(g.editionId);
    return g;
  }
  async assign(id: string, classId: string, dueAt?: string | null) {
    const g = await this.teacherGet(id);
    await this.access.assertTeaches(classId);
    const [a] = await this.q.insert(gameAssignments).values({ publisherId: this.ctx.publisherId, schoolId: this.ctx.schoolId!, activityId: g.id, classId, teacherId: this.ctx.userId,
      dueAt: dueAt ? new Date(dueAt) : null }).onConflictDoUpdate({ target: [gameAssignments.activityId, gameAssignments.classId], set: { dueAt: dueAt ? new Date(dueAt) : null } }).returning();
    await this.audit.log('games.assign', 'game', g.id, `Assigned game “${g.title}” to a class`);
    return a;
  }
  async unassign(assignmentId: string) {
    const [a] = await this.q.select().from(gameAssignments).where(eq(gameAssignments.id, assignmentId));
    if (!a) throw new NotFoundException();
    await this.access.assertTeaches(a.classId);
    await this.q.delete(gameAssignments).where(eq(gameAssignments.id, assignmentId));
    return { ok: true };
  }
  /** Class game report: students × assigned games (best stars, attempts). */
  async classReport(classId: string) {
    await this.access.assertTeaches(classId);
    const games = await this.q.select({ assignmentId: gameAssignments.id, activityId: gameActivities.id, title: gameActivities.title, engine: gameActivities.engine, dueAt: gameAssignments.dueAt })
      .from(gameAssignments).innerJoin(gameActivities, eq(gameActivities.id, gameAssignments.activityId)).where(eq(gameAssignments.classId, classId)).orderBy(asc(gameAssignments.createdAt));
    const roster = (await this.q.execute(sql`SELECT u.id, u.display_name AS "displayName" FROM enrolments e JOIN users u ON u.id = e.student_id WHERE e.class_id = ${classId} ORDER BY u.display_name`)).rows as any[];
    const att = games.length && roster.length ? (await this.q.execute(sql`SELECT student_id, activity_id, max(stars)::int AS best, count(*)::int AS plays
      FROM game_attempts WHERE activity_id IN ${games.map((g) => g.activityId)} AND student_id IN ${roster.map((r) => r.id)} GROUP BY 1, 2`)).rows as any[] : [];
    return { games, students: roster.map((s) => ({ ...s, cells: games.map((g) => { const a = att.find((x) => x.student_id === s.id && x.activity_id === g.activityId); return a ? { best: a.best, plays: a.plays } : null; }) })) };
  }

  // ===================== student =====================
  /** Games a student may play: assigned to their class, or published library games of their licensed books. */
  async studentAvailable() {
    const me = this.ctx.userId;
    const classIds = await this.access.studentClassIds();
    const eds = await this.access.editions();
    const edList = eds === 'ALL' ? [] : eds;
    const assigned = classIds.length ? await this.q.select({ activityId: gameAssignments.activityId, assignmentId: gameAssignments.id, dueAt: gameAssignments.dueAt })
      .from(gameAssignments).where(inArray(gameAssignments.classId, classIds)) : [];
    const w = [and(isNull(gameActivities.schoolId), eq(gameActivities.published, true), edList.length ? inArray(gameActivities.editionId, edList) : sql`FALSE`)!];
    // Assigned games: a school's own games, or publisher games of a book the student is licensed for (licensing applies to games too).
    if (assigned.length) w.push(and(inArray(gameActivities.id, assigned.map((a) => a.activityId)),
      or(isNotNull(gameActivities.schoolId), isNull(gameActivities.editionId), edList.length ? inArray(gameActivities.editionId, edList) : sql`FALSE`))!);
    const games = await this.q.select({ ...this.listSelect(),
      best: sql<number | null>`(SELECT max(stars)::int FROM game_attempts a WHERE a.activity_id = ${qc(gameActivities.id)} AND a.student_id = ${me})`,
      plays: sql<number>`(SELECT count(*)::int FROM game_attempts a WHERE a.activity_id = ${qc(gameActivities.id)} AND a.student_id = ${me})` })
      .from(gameActivities).where(or(...w)).orderBy(asc(gameActivities.title));
    return games.map((g) => { const a = assigned.find((x) => x.activityId === g.id); return { ...g, assignmentId: a?.assignmentId ?? null, dueAt: a?.dueAt ?? null }; })
      .sort((x, y) => Number(!!y.assignmentId) - Number(!!x.assignmentId));
  }
  async studentGet(id: string) {
    const g = (await this.studentAvailable()).find((x) => x.id === id);
    if (!g) throw new NotFoundException('Game not found');
    const [full] = await this.q.select({ content: gameActivities.content }).from(gameActivities).where(eq(gameActivities.id, id));
    return { ...g, content: full.content };
  }

  /** Records a finished play. The server recomputes the maximum and the stars — the client only reports the score. */
  async recordAttempt(id: string, d: { score: number; durationMs?: number }) {
    const g = await this.studentGet(id);
    const { maxScore } = validateContent(g.engine as Engine, g.content);
    const score = Math.max(0, Math.min(maxScore, Math.round(d.score)));
    const stars = starsFor(score, maxScore);
    const before = await this.totalStars(this.ctx.userId);
    await this.q.insert(gameAttempts).values({ publisherId: this.ctx.publisherId, schoolId: this.ctx.schoolId!, studentId: this.ctx.userId, activityId: id, assignmentId: g.assignmentId,
      score, maxScore, stars, durationMs: Math.max(0, Math.min(3_600_000, Math.round(d.durationMs ?? 0))) });
    const newBadges = await this.awardBadges(this.ctx.userId);
    const totalStars = await this.totalStars(this.ctx.userId);
    return { score, maxScore, stars, best: Math.max(stars, g.best ?? 0), starsGained: totalStars - before, totalStars, newBadges: newBadges.map((b) => ({ key: b, ...BADGES[b] })) };
  }

  /** Stars = best stars per game + stars for marked homework (≥90% → 3, ≥60% → 2, else 1). */
  async totalStars(studentId: string) {
    const { rows } = await this.q.execute(sql`SELECT
      coalesce((SELECT sum(best) FROM (SELECT max(stars) AS best FROM game_attempts WHERE student_id = ${studentId} GROUP BY activity_id) x), 0)::int
      + coalesce((SELECT sum(CASE WHEN score::float / NULLIF(max_score, 0) >= 0.9 THEN 3 WHEN score::float / NULLIF(max_score, 0) >= 0.6 THEN 2 ELSE 1 END)
          FROM submissions WHERE student_id = ${studentId} AND status IN ('GRADED','RETURNED')), 0)::int AS stars`);
    return (rows[0] as any).stars as number;
  }

  /** Days with learning activity (games, homework, reading), most recent first. */
  private async activeDays(studentId: string): Promise<string[]> {
    const { rows } = await this.q.execute(sql`SELECT DISTINCT d FROM (
      SELECT created_at::date AS d FROM game_attempts WHERE student_id = ${studentId}
      UNION SELECT created_at::date FROM submissions WHERE student_id = ${studentId}
      UNION SELECT updated_at::date FROM reader_progress WHERE user_id = ${studentId}) x ORDER BY d DESC LIMIT 60`);
    return rows.map((r: any) => new Date(r.d).toISOString().slice(0, 10));
  }
  streakFrom(days: string[]) {
    if (!days.length) return 0;
    const today = new Date(); today.setUTCHours(0, 0, 0, 0);
    let cursor = today.getTime(); let n = 0;
    const set = new Set(days);
    if (!set.has(today.toISOString().slice(0, 10))) cursor -= 864e5; // a streak stays alive until the end of today
    while (set.has(new Date(cursor).toISOString().slice(0, 10))) { n++; cursor -= 864e5; }
    return n;
  }

  async awardBadges(studentId: string): Promise<string[]> {
    const { rows: [m] } = await this.q.execute(sql`SELECT
      (SELECT count(*)::int FROM game_attempts WHERE student_id = ${studentId}) AS plays,
      (SELECT count(*)::int FROM game_attempts WHERE student_id = ${studentId} AND stars = 3) AS perfect,
      (SELECT count(*)::int FROM submissions WHERE student_id = ${studentId}) AS homework,
      (SELECT coalesce(sum(max_page), 0)::int FROM reader_progress WHERE user_id = ${studentId}) AS pages`) as any;
    const stars = await this.totalStars(studentId);
    const streak = this.streakFrom(await this.activeDays(studentId));
    const earned = Object.entries({
      FIRST_GAME: m.plays >= 1, PERFECT: m.perfect >= 1, GAMES_10: m.plays >= 10, STARS_25: stars >= 25, STARS_100: stars >= 100,
      HOMEWORK_1: m.homework >= 1, HOMEWORK_5: m.homework >= 5, READER_20: m.pages >= 20, READER_100: m.pages >= 100, STREAK_3: streak >= 3,
    }).filter(([, ok]) => ok).map(([k]) => k);
    if (!earned.length) return [];
    const inserted = await this.q.insert(studentBadges).values(earned.map((badge) => ({ publisherId: this.ctx.publisherId, schoolId: this.ctx.schoolId!, studentId, badge })))
      .onConflictDoNothing().returning({ badge: studentBadges.badge });
    return inserted.map((r) => r.badge);
  }

  /** Everything for the child's "My achievements / My progress" screens. */
  async achievements() {
    const me = this.ctx.userId;
    await this.awardBadges(me);
    const mine = await this.q.select().from(studentBadges).where(eq(studentBadges.studentId, me));
    const days = await this.activeDays(me);
    const eds = await this.access.editions();
    const books = eds === 'ALL' || !eds.length ? [] : (await this.q.execute(sql`SELECT e.id AS "editionId", p.title, CASE WHEN p.cover_version IS NOT NULL THEN '/api/covers/' || p.id || '?v=' || p.cover_version END AS "coverUrl", p.cover_color AS "coverColor",
        (SELECT coalesce(sum(c.page_count), 0)::int FROM book_components c WHERE c.edition_id = e.id AND c.book_asset_id IS NOT NULL) AS pages,
        (SELECT coalesce(sum(rp.max_page), 0)::int FROM reader_progress rp JOIN book_components c ON c.id = rp.component_id WHERE c.edition_id = e.id AND rp.user_id = ${me}) AS "pagesRead",
        (SELECT count(*)::int FROM game_attempts a JOIN game_activities g ON g.id = a.activity_id WHERE g.edition_id = e.id AND a.student_id = ${me}) AS plays,
        (SELECT count(*)::int FROM submissions s JOIN assessments x ON x.id = s.assessment_id WHERE x.edition_id = e.id AND s.student_id = ${me}) AS homework
      FROM book_editions e JOIN book_packages p ON p.id = e.package_id WHERE e.id IN ${eds} ORDER BY p.title`)).rows;
    return {
      stars: await this.totalStars(me), streak: this.streakFrom(days), activeDays: days.slice(0, 14),
      badges: Object.entries(BADGES).map(([key, b]) => ({ key, ...b, earnedAt: mine.find((x) => x.badge === key)?.earnedAt ?? null })),
      books,
    };
  }
}
