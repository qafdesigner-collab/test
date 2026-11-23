import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq, inArray, isNull, or, sql, SQL } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { qc } from '../db/qualify';
import {
  assessmentItems, assessmentStudents, assessments, bookComponents, bookLessons, bookUnits, classes, evaluations, lessonPlans, questionBank, submissions, subjects, users,
} from '../db/schema';
import { AuditService } from '../audit/audit.service';
import { examResultsFor } from '../exams/results';
import { NotificationsService } from '../notifications/notifications.service';
import { AccessService } from './access.service';
import { promises as fsp } from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { config } from '../config';
import { checkItem, gradeNumber } from './integrity';
import { AssessmentDto, LiveFrameDto, ProctorEventDto, EvaluationDto, GradeDto, ItemDto, LessonPlanDto, QuestionDto, SubmitDto, UpdateAssessmentDto } from './lms.dto';

const norm = (s: unknown) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ').replace(/[.!?]+$/, '');

/** Validates & normalises a question; throws a friendly message for the teacher. */
export function cleanItem(i: ItemDto, n: number) {
  const where = `Question ${n}`;
  const options = (i.options ?? []).map((o) => o.trim()).filter(Boolean);
  let answer: (string | number | boolean)[] = i.answer ?? [];
  switch (i.type) {
    case 'MCQ': {
      if (options.length < 2) throw new BadRequestException(`${where}: add at least two choices`);
      const idx = Number(answer[0]);
      if (!Number.isInteger(idx) || idx < 0 || idx >= options.length) throw new BadRequestException(`${where}: mark the correct choice`);
      answer = [idx]; break;
    }
    case 'TRUE_FALSE':
      if (typeof answer[0] !== 'boolean') throw new BadRequestException(`${where}: choose True or False as the answer`);
      answer = [answer[0]]; break;
    case 'FILL_BLANK':
      answer = answer.map((a) => String(a).trim()).filter(Boolean);
      if (!answer.length) throw new BadRequestException(`${where}: give at least one accepted answer`);
      break;
    case 'SHORT':
      answer = answer.map((a) => String(a).trim()).filter(Boolean).slice(0, 1); break;
    case 'READING': // the pupil records themself reading; the teacher listens and marks
      answer = []; break;
  }
  return { type: i.type, prompt: i.prompt.trim(), options: i.type === 'MCQ' ? options : [], answer, points: i.points ?? 1 };
}

/** Auto-marks one response. Returns null for items needing a teacher (SHORT). */
export function mark(item: { type: string; answer: any; points: number; options: any }, response: unknown): { correct: boolean | null; awarded: number | null } {
  const manual = item.type === 'SHORT' || item.type === 'READING';
  if (response === undefined || response === null || response === '') return { correct: manual ? null : false, awarded: manual ? null : 0 };
  if (item.type === 'READING') return { correct: null, awarded: null };
  let correct: boolean | null = null;
  if (item.type === 'MCQ') correct = Number(response) === Number(item.answer[0]);
  else if (item.type === 'TRUE_FALSE') correct = (response === true || response === 'true') === item.answer[0];
  else if (item.type === 'FILL_BLANK') correct = (item.answer as string[]).some((a) => norm(a) === norm(response));
  if (correct === null) return { correct: null, awarded: null };
  return { correct, awarded: correct ? item.points : 0 };
}

@Injectable()
export class LmsService {
  constructor(readonly db: DbService, private readonly audit: AuditService, private readonly access: AccessService, private readonly notifications: NotificationsService) {}

  /** Students (and, where linked, their parents) to tell about a piece of work. */
  async notifyStudents(studentIds: string[], m: { kind: string; title: string; body?: string; link?: string; parentLink?: string }) {
    if (!studentIds.length) return;
    const arr = `{${studentIds.join(',')}}`; // uuids from the database
    const kids = await this.q.execute(sql`SELECT id, phone FROM users WHERE id = ANY(${arr}::uuid[]) AND status = 'ACTIVE'`);
    await this.notifications.notify(kids.rows as any[], m);
    const parents = await this.q.execute(sql`
      SELECT DISTINCT u.id, u.phone FROM parent_students ps JOIN users u ON u.id = ps.parent_id
      WHERE ps.student_id = ANY(${arr}::uuid[]) AND u.status = 'ACTIVE'`);
    if (parents.rows.length) await this.notifications.notify(parents.rows as any[], { ...m, link: m.parentLink ?? '/parent' }, { phone: true });
  }

  private get q() { return this.db.q; }
  private get ctx() { return this.db.ctx; }
  /** Run after a student hands in (e.g. the AI-writing check). They never delay or fail the hand-in. */
  readonly afterSubmit: ((submissionId: string) => Promise<unknown>)[] = [];
  private base() { return { publisherId: this.ctx.publisherId, schoolId: this.ctx.schoolId! }; }

  /** Lesson/unit must belong to the edition, and the edition must be licensed to the teacher. */
  private async checkBookRefs(d: { editionId?: string | null; unitId?: string | null; lessonId?: string | null }) {
    if (!d.editionId) { if (d.lessonId || d.unitId) throw new BadRequestException('Choose the book first'); return { editionId: null, unitId: null, lessonId: null }; }
    await this.access.assertEdition(d.editionId);
    let unitId = d.unitId ?? null;
    if (d.lessonId) {
      const [l] = await this.q.select({ unitId: bookLessons.unitId, editionId: bookComponents.editionId }).from(bookLessons)
        .innerJoin(bookUnits, eq(bookUnits.id, bookLessons.unitId)).innerJoin(bookComponents, eq(bookComponents.id, bookUnits.componentId)).where(eq(bookLessons.id, d.lessonId));
      if (!l || l.editionId !== d.editionId) throw new BadRequestException('That lesson is not in this book');
      unitId = l.unitId;
    } else if (unitId) {
      const [u] = await this.q.select({ editionId: bookComponents.editionId }).from(bookUnits).innerJoin(bookComponents, eq(bookComponents.id, bookUnits.componentId)).where(eq(bookUnits.id, unitId));
      if (!u || u.editionId !== d.editionId) throw new BadRequestException('That unit is not in this book');
    }
    return { editionId: d.editionId, unitId, lessonId: d.lessonId ?? null };
  }

  // ======================= lesson plans =======================
  listPlans(f: { classId?: string; lessonId?: string }) {
    const w: SQL[] = [eq(lessonPlans.teacherId, this.ctx.userId)];
    if (f.classId) w.push(eq(lessonPlans.classId, f.classId));
    if (f.lessonId) w.push(eq(lessonPlans.lessonId, f.lessonId));
    return this.q.select({
      id: lessonPlans.id, title: lessonPlans.title, planDate: lessonPlans.planDate, durationMin: lessonPlans.durationMin, status: lessonPlans.status,
      aiGenerated: lessonPlans.aiGenerated, classId: lessonPlans.classId, editionId: lessonPlans.editionId, lessonId: lessonPlans.lessonId, updatedAt: lessonPlans.updatedAt,
      className: sql<string | null>`(SELECT c.name || CASE WHEN c.section <> '' THEN ' ' || c.section ELSE '' END FROM classes c WHERE c.id = ${qc(lessonPlans.classId)})`,
      lessonTitle: sql<string | null>`(SELECT 'Lesson ' || l.number || ': ' || l.title FROM book_lessons l WHERE l.id = ${qc(lessonPlans.lessonId)})`,
      bookTitle: sql<string | null>`(SELECT p.title FROM book_editions e JOIN book_packages p ON p.id = e.package_id WHERE e.id = ${qc(lessonPlans.editionId)})`,
    }).from(lessonPlans).where(and(...w)).orderBy(desc(lessonPlans.updatedAt));
  }
  private async plan(id: string) {
    const [p] = await this.q.select().from(lessonPlans).where(and(eq(lessonPlans.id, id), eq(lessonPlans.teacherId, this.ctx.userId)));
    if (!p) throw new NotFoundException('Lesson plan not found');
    return p;
  }
  getPlan(id: string) { return this.plan(id); }
  async savePlan(id: string | null, d: LessonPlanDto) {
    const refs = await this.checkBookRefs(d);
    if (d.classId) await this.access.assertTeaches(d.classId);
    const values = { title: d.title.trim(), classId: d.classId ?? null, editionId: refs.editionId, lessonId: refs.lessonId, planDate: d.planDate ? new Date(d.planDate) : null,
      durationMin: d.durationMin ?? 40, content: d.content ?? {}, status: d.status ?? 'DRAFT', aiGenerated: d.aiGenerated ?? false };
    if (id) {
      await this.plan(id);
      const [row] = await this.q.update(lessonPlans).set({ ...values, updatedAt: new Date() }).where(eq(lessonPlans.id, id)).returning();
      return row;
    }
    const [row] = await this.q.insert(lessonPlans).values({ ...this.base(), teacherId: this.ctx.userId, ...values }).returning();
    await this.audit.log('lms.plan.create', 'lesson_plan', row.id, `Created lesson plan “${row.title}”`);
    return row;
  }
  async duplicatePlan(id: string) {
    const p = await this.plan(id);
    const { id: _id, createdAt, updatedAt, ...rest } = p;
    const [row] = await this.q.insert(lessonPlans).values({ ...rest, title: `${p.title} (copy)`, status: 'DRAFT' }).returning();
    return row;
  }
  async deletePlan(id: string) { await this.plan(id); await this.q.delete(lessonPlans).where(eq(lessonPlans.id, id)); return { ok: true }; }

  // ======================= question bank =======================
  listQuestions(f: { editionId?: string; lessonId?: string; type?: string }) {
    const w: SQL[] = [or(eq(questionBank.shared, true), eq(questionBank.ownerId, this.ctx.userId))!];
    if (f.editionId) w.push(eq(questionBank.editionId, f.editionId));
    if (f.lessonId) w.push(eq(questionBank.lessonId, f.lessonId));
    if (f.type) w.push(eq(questionBank.type, f.type as any));
    return this.q.select({ q: questionBank, owner: users.displayName }).from(questionBank).innerJoin(users, eq(users.id, questionBank.ownerId))
      .where(and(...w)).orderBy(desc(questionBank.createdAt)).limit(500)
      .then((rows) => rows.map((r) => ({ ...r.q, owner: r.owner, mine: r.q.ownerId === this.ctx.userId })));
  }
  async addQuestion(d: QuestionDto) {
    const item = cleanItem(d, 1);
    const refs = await this.checkBookRefs(d);
    const [row] = await this.q.insert(questionBank).values({ ...this.base(), ownerId: this.ctx.userId, editionId: refs.editionId, lessonId: refs.lessonId,
      type: item.type, prompt: item.prompt, options: item.options, answer: item.answer, difficulty: d.difficulty ?? 1, shared: d.shared ?? true }).returning();
    return row;
  }
  async deleteQuestion(id: string) {
    const [r] = await this.q.delete(questionBank).where(and(eq(questionBank.id, id), eq(questionBank.ownerId, this.ctx.userId))).returning();
    if (!r) throw new NotFoundException('Only the author can delete a question');
    return { ok: true };
  }

  // ======================= assessments (teacher) =======================
  async listAssessments(f: { classId?: string; status?: string }) {
    const classIds = this.access.is('SCHOOL_ADMIN') ? null : await this.access.teacherClassIds();
    if (classIds && !classIds.length) return [];
    const w: SQL[] = [];
    if (classIds) w.push(inArray(assessments.classId, classIds));
    if (f.classId) w.push(eq(assessments.classId, f.classId));
    if (f.status) w.push(eq(assessments.status, f.status as any));
    return this.q.select({
      id: assessments.id, title: assessments.title, kind: assessments.kind, status: assessments.status, dueAt: assessments.dueAt, classId: assessments.classId,
      publishedAt: assessments.publishedAt, createdAt: assessments.createdAt,
      className: sql<string>`(SELECT c.name || CASE WHEN c.section <> '' THEN ' ' || c.section ELSE '' END FROM classes c WHERE c.id = ${qc(assessments.classId)})`,
      bookTitle: sql<string | null>`(SELECT p.title FROM book_editions e JOIN book_packages p ON p.id = e.package_id WHERE e.id = ${qc(assessments.editionId)})`,
      items: sql<number>`(SELECT count(*)::int FROM assessment_items i WHERE i.assessment_id = ${qc(assessments.id)})`,
      maxScore: sql<number>`(SELECT coalesce(sum(points),0)::int FROM assessment_items i WHERE i.assessment_id = ${qc(assessments.id)})`,
      assigned: sql<number>`(CASE WHEN EXISTS (SELECT 1 FROM assessment_students s WHERE s.assessment_id = ${qc(assessments.id)})
        THEN (SELECT count(*)::int FROM assessment_students s WHERE s.assessment_id = ${qc(assessments.id)})
        ELSE (SELECT count(*)::int FROM enrolments e WHERE e.class_id = ${qc(assessments.classId)}) END)`,
      submitted: sql<number>`(SELECT count(*)::int FROM submissions s WHERE s.assessment_id = ${qc(assessments.id)})`,
      toGrade: sql<number>`(SELECT count(*)::int FROM submissions s WHERE s.assessment_id = ${qc(assessments.id)} AND s.status = 'SUBMITTED')`,
    }).from(assessments).where(w.length ? and(...w) : undefined).orderBy(desc(assessments.createdAt)).limit(300);
  }

  private async assessment(id: string) {
    const [a] = await this.q.select().from(assessments).where(eq(assessments.id, id));
    if (!a) throw new NotFoundException('Assessment not found');
    await this.access.assertTeaches(a.classId);
    return a;
  }

  private async targets(classId: string, studentIds?: string[]) {
    if (!studentIds?.length) return [];
    const roster = await this.access.studentIdsOf(classId);
    if (studentIds.some((s) => !roster.includes(s))) throw new BadRequestException('Only students of this class can be assigned');
    return [...new Set(studentIds)];
  }

  private async writeItems(a: { id: string }, items: ItemDto[]) {
    const clean = items.map((i, n) => cleanItem(i, n + 1));
    await this.q.delete(assessmentItems).where(eq(assessmentItems.assessmentId, a.id));
    if (clean.length) await this.q.insert(assessmentItems).values(clean.map((c, position) => ({ ...this.base(), assessmentId: a.id, position, ...c })));
  }

  async createAssessment(d: AssessmentDto) {
    await this.access.assertTeaches(d.classId);
    const refs = await this.checkBookRefs(d);
    const studentIds = await this.targets(d.classId, d.studentIds);
    const [a] = await this.q.insert(assessments).values({ ...this.base(), teacherId: this.ctx.userId, classId: d.classId, kind: d.kind, title: d.title.trim(),
      instructions: d.instructions ?? '', ...refs, ...(await this.pageRef(refs.editionId, d)), dueAt: d.dueAt ? new Date(d.dueAt) : null, allowLate: d.allowLate ?? true,
      maxAttempts: d.maxAttempts ?? 1, timeLimitMin: d.timeLimitMin ?? null, proctor: cleanProctor(d.proctor) }).returning();
    if (d.items?.length) await this.writeItems(a, d.items);
    if (studentIds.length) await this.q.insert(assessmentStudents).values(studentIds.map((studentId) => ({ ...this.base(), assessmentId: a.id, studentId })));
    await this.audit.log('lms.assessment.create', 'assessment', a.id, `Created ${d.kind.toLowerCase()} “${a.title}”`);
    return a;
  }

  /** The book page an assignment is about: the part must belong to the assignment's book. */
  private async pageRef(editionId: string | null, d: { bookComponentId?: string | null; bookPage?: number | null }) {
    if (!d.bookComponentId || !d.bookPage) return { bookComponentId: null, bookPage: null };
    if (!editionId) throw new BadRequestException('Choose the book first');
    const [c] = await this.q.select({ id: bookComponents.id }).from(bookComponents).where(and(eq(bookComponents.id, d.bookComponentId), eq(bookComponents.editionId, editionId)));
    if (!c) throw new BadRequestException('That page is not in this book');
    return { bookComponentId: d.bookComponentId, bookPage: d.bookPage };
  }

  async updateAssessment(id: string, d: UpdateAssessmentDto) {
    const a = await this.assessment(id);
    if (a.status === 'CLOSED') throw new ConflictException('This assessment is closed.');
    if (a.status === 'PUBLISHED' && (d.items || d.studentIds)) {
      const [{ n }] = (await this.q.execute(sql`SELECT count(*)::int AS n FROM submissions WHERE assessment_id = ${id}`)).rows as any[];
      if (n > 0) throw new ConflictException('Students have already answered — questions can no longer change. Create a new assessment instead.');
    }
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (d.title !== undefined) patch.title = d.title.trim();
    if (d.instructions !== undefined) patch.instructions = d.instructions;
    if (d.dueAt !== undefined) patch.dueAt = d.dueAt ? new Date(d.dueAt) : null;
    if (d.allowLate !== undefined) patch.allowLate = d.allowLate;
    if (d.maxAttempts !== undefined) patch.maxAttempts = d.maxAttempts;
    if (d.timeLimitMin !== undefined) patch.timeLimitMin = d.timeLimitMin;
    if (d.proctor !== undefined) patch.proctor = cleanProctor(d.proctor);
    if (d.bookComponentId !== undefined || d.bookPage !== undefined) Object.assign(patch, await this.pageRef(a.editionId, { bookComponentId: d.bookComponentId ?? a.bookComponentId, bookPage: d.bookPage === undefined ? a.bookPage : d.bookPage }));
    await this.q.update(assessments).set(patch).where(eq(assessments.id, id));
    if (d.items) await this.writeItems(a, d.items);
    if (d.studentIds) {
      const ids = await this.targets(a.classId, d.studentIds);
      await this.q.delete(assessmentStudents).where(eq(assessmentStudents.assessmentId, id));
      if (ids.length) await this.q.insert(assessmentStudents).values(ids.map((studentId) => ({ ...this.base(), assessmentId: id, studentId })));
    }
    return { ok: true };
  }

  async publish(id: string) {
    const a = await this.assessment(id);
    if (a.status !== 'DRAFT') throw new ConflictException('Already published.');
    const items = await this.q.select().from(assessmentItems).where(eq(assessmentItems.assessmentId, id));
    if (!items.length) throw new BadRequestException('Add at least one question before publishing.');
    await this.q.update(assessments).set({ status: 'PUBLISHED', publishedAt: new Date() }).where(eq(assessments.id, id));
    await this.audit.log('lms.assessment.publish', 'assessment', id, `Published “${a.title}” to the class`);
    const targeted = (await this.q.select({ id: assessmentStudents.studentId }).from(assessmentStudents).where(eq(assessmentStudents.assessmentId, id))).map((r) => r.id);
    const ids = targeted.length ? targeted : ((await this.q.execute(sql`SELECT student_id AS id FROM enrolments WHERE class_id = ${a.classId}`)).rows as any[]).map((r) => r.id);
    const due = a.dueAt ? ` Due ${new Date(a.dueAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}.` : '';
    await this.notifyStudents(ids, { kind: 'HOMEWORK', title: `New ${String(a.kind).toLowerCase()}: ${a.title}`, body: `Your teacher has set new work.${due}`, link: `/homework/${id}` });
    return { ok: true };
  }
  async close(id: string) {
    const a = await this.assessment(id);
    await this.q.update(assessments).set({ status: 'CLOSED' }).where(eq(assessments.id, id));
    await this.audit.log('lms.assessment.close', 'assessment', id, `Closed “${a.title}”`);
    return { ok: true };
  }
  async deleteAssessment(id: string) {
    const a = await this.assessment(id);
    if (a.status !== 'DRAFT') throw new ConflictException('Only drafts can be deleted. Close it instead.');
    await this.q.delete(assessments).where(eq(assessments.id, id));
    return { ok: true };
  }

  async addFromBank(id: string, questionIds: string[]) {
    const a = await this.assessment(id);
    if (a.status !== 'DRAFT') throw new ConflictException('Questions can only be added to drafts.');
    const qs = await this.q.select().from(questionBank).where(and(inArray(questionBank.id, questionIds), or(eq(questionBank.shared, true), eq(questionBank.ownerId, this.ctx.userId))));
    const [{ m }] = (await this.q.execute(sql`SELECT coalesce(max(position), -1)::int AS m FROM assessment_items WHERE assessment_id = ${id}`)).rows as any[];
    if (qs.length) await this.q.insert(assessmentItems).values(qs.map((qq, i) => ({ ...this.base(), assessmentId: id, position: m + 1 + i, type: qq.type, prompt: qq.prompt, options: qq.options, answer: qq.answer, points: 1 })));
    return { added: qs.length };
  }

  async getAssessment(id: string) {
    const a = await this.assessment(id);
    const items = await this.q.select().from(assessmentItems).where(eq(assessmentItems.assessmentId, id)).orderBy(asc(assessmentItems.position));
    const targeted = (await this.q.select({ id: assessmentStudents.studentId }).from(assessmentStudents).where(eq(assessmentStudents.assessmentId, id))).map((r) => r.id);
    const roster = await this.q.execute(sql`SELECT u.id, u.display_name AS "displayName", u.username FROM enrolments e JOIN users u ON u.id = e.student_id WHERE e.class_id = ${a.classId} ORDER BY u.display_name`);
    const subs = await this.q.select().from(submissions).where(eq(submissions.assessmentId, id));
    const tries = (await this.q.execute(sql`SELECT student_id AS "studentId", attempt, started_at AS "startedAt", submitted_at AS "submittedAt", over_time AS "overTime",
        CASE WHEN submitted_at IS NOT NULL THEN extract(epoch FROM submitted_at - started_at)::int END AS seconds
      FROM assessment_attempts WHERE assessment_id = ${id} ORDER BY attempt`)).rows as any[];
    const watch = (await this.q.execute(sql`SELECT student_id AS "studentId", count(*) FILTER (WHERE kind IN ('ROOM','CAMERA'))::int AS photos, count(*) FILTER (WHERE kind = 'SCREEN')::int AS screens,
        count(*) FILTER (WHERE kind = 'AWAY')::int AS away, coalesce(sum((detail->>'seconds')::int) FILTER (WHERE kind = 'AWAY'), 0)::int AS "awaySeconds",
        count(*) FILTER (WHERE kind IN ('SCREEN_OFF','CAMERA_OFF','SCREEN_PART','NO_SCREEN','NO_CAMERA','FULLSCREEN_OFF'))::int AS warnings
      FROM proctor_events WHERE assessment_id = ${id} GROUP BY student_id`)).rows as any[];
    const students = (roster.rows as any[]).filter((s) => !targeted.length || targeted.includes(s.id))
      .map((s) => ({ ...s, submission: subs.find((x) => x.studentId === s.id) ?? null, attempts: tries.filter((t) => t.studentId === s.id), watch: watch.find((w) => w.studentId === s.id) ?? null }));
    const maxScore = items.reduce((n, i) => n + i.points, 0);
    const graded = subs.filter((s) => s.score !== null);
    const itemStats = items.map((it) => {
      const answered = subs.map((s) => (s.answers as any[]).find((x) => x.itemId === it.id)).filter(Boolean);
      const right = answered.filter((x: any) => x.correct === true).length;
      return { itemId: it.id, answered: answered.length, correctRate: answered.length ? right / answered.length : null };
    });
    return { ...a, items, targeted, students, maxScore, itemStats,
      stats: { submitted: subs.length, assigned: students.length, average: graded.length ? graded.reduce((n, s) => n + (s.score ?? 0), 0) / graded.length : null } };
  }

  async grade(submissionId: string, d: GradeDto) {
    const [s] = await this.q.select().from(submissions).where(eq(submissions.id, submissionId));
    if (!s) throw new NotFoundException('Submission not found');
    const a = await this.assessment(s.assessmentId);
    const items = await this.q.select().from(assessmentItems).where(eq(assessmentItems.assessmentId, a.id));
    const answers = (s.answers as any[]).map((x) => {
      const override = d.itemScores?.find((o) => o.itemId === x.itemId);
      if (!override) return x;
      const it = items.find((i) => i.id === x.itemId)!;
      if (override.awarded > it.points) throw new BadRequestException(`At most ${it.points} point(s) for that question`);
      return { ...x, awarded: override.awarded, correct: override.awarded === it.points ? true : override.awarded === 0 ? false : x.correct ?? null };
    });
    const pending = answers.some((x) => x.awarded === null || x.awarded === undefined);
    const score = answers.reduce((n, x) => n + (x.awarded ?? 0), 0);
    const status = pending ? 'SUBMITTED' : d.returnToStudent ? 'RETURNED' : 'GRADED';
    if (d.returnToStudent && pending) throw new BadRequestException('Mark every written answer before returning it to the student.');
    await this.q.update(submissions).set({ answers, score: pending ? null : score, status, feedback: d.feedback ?? s.feedback, gradedAt: pending ? null : new Date(), gradedBy: this.ctx.userId })
      .where(eq(submissions.id, submissionId));
    await this.audit.log('lms.submission.grade', 'assessment', a.id, `Marked a submission for “${a.title}” (${pending ? 'partly' : `${score}/${s.maxScore}`})`);
    if (!pending && (status === 'RETURNED' || !['GRADED', 'RETURNED'].includes(s.status))) {
      await this.notifyStudents([s.studentId], { kind: 'RESULT', title: `Marked: ${a.title}`, body: `Score ${score} / ${s.maxScore}.${d.feedback ? ` Teacher: ${d.feedback.slice(0, 200)}` : ''}`, link: `/homework/${a.id}` });
    }
    return { ok: true, score: pending ? null : score, status };
  }

  // ======================= student side =======================
  private async visibleToStudent(a: typeof assessments.$inferSelect) {
    const classIds = await this.access.studentClassIds();
    if (!classIds.includes(a.classId) || a.status === 'DRAFT') return false;
    const targeted = await this.q.select({ id: assessmentStudents.studentId }).from(assessmentStudents).where(eq(assessmentStudents.assessmentId, a.id));
    return !targeted.length || targeted.some((t) => t.id === this.ctx.userId);
  }

  async studentList() {
    const classIds = await this.access.studentClassIds();
    if (!classIds.length) return [];
    const me = this.ctx.userId;
    return this.q.select({
      id: assessments.id, title: assessments.title, kind: assessments.kind, status: assessments.status, dueAt: assessments.dueAt, editionId: assessments.editionId,
      bookTitle: sql<string | null>`(SELECT p.title FROM book_editions e JOIN book_packages p ON p.id = e.package_id WHERE e.id = ${qc(assessments.editionId)})`,
      coverColor: sql<string | null>`(SELECT p.cover_color FROM book_editions e JOIN book_packages p ON p.id = e.package_id WHERE e.id = ${qc(assessments.editionId)})`,
      items: sql<number>`(SELECT count(*)::int FROM assessment_items i WHERE i.assessment_id = ${qc(assessments.id)})`,
      submission: sql<any>`(SELECT json_build_object('status', s.status, 'score', CASE WHEN s.status IN ('GRADED','RETURNED') THEN s.score END, 'maxScore', s.max_score, 'submittedAt', s.created_at)
        FROM submissions s WHERE s.assessment_id = ${qc(assessments.id)} AND s.student_id = ${me})`,
    }).from(assessments).where(and(inArray(assessments.classId, classIds), sql`${assessments.status} <> 'DRAFT'`,
      sql`(NOT EXISTS (SELECT 1 FROM assessment_students t WHERE t.assessment_id = ${qc(assessments.id)}) OR EXISTS (SELECT 1 FROM assessment_students t WHERE t.assessment_id = ${qc(assessments.id)} AND t.student_id = ${me}))`))
      .orderBy(sql`${assessments.dueAt} NULLS LAST`, desc(assessments.publishedAt));
  }

  async studentGet(id: string) {
    const [a] = await this.q.select().from(assessments).where(eq(assessments.id, id));
    if (!a || !(await this.visibleToStudent(a))) throw new NotFoundException('Homework not found');
    const items = await this.q.select().from(assessmentItems).where(eq(assessmentItems.assessmentId, id)).orderBy(asc(assessmentItems.position));
    const [sub] = await this.q.select().from(submissions).where(and(eq(submissions.assessmentId, id), eq(submissions.studentId, this.ctx.userId)));
    const used = sub?.attempt ?? 0; const triesLeft = Math.max(0, a.maxAttempts - used);
    // answers are shown only when no tries are left (or the work is closed) — otherwise the next try would be easy
    const reveal = sub && ['GRADED', 'RETURNED'].includes(sub.status) && (triesLeft === 0 || a.status === 'CLOSED');
    const open = await this.openAttempt(id);
    return {
      id: a.id, title: a.title, kind: a.kind, instructions: a.instructions, dueAt: a.dueAt, status: a.status, allowLate: a.allowLate,
      maxAttempts: a.maxAttempts, timeLimitMin: a.timeLimitMin, proctor: a.proctor, attemptsUsed: used, triesLeft: a.status === 'PUBLISHED' ? triesLeft : 0,
      current: open ? { attempt: open.attempt, startedAt: open.startedAt, endsAt: a.timeLimitMin ? new Date(new Date(open.startedAt).getTime() + a.timeLimitMin * 60_000) : null } : null,
      editionId: a.editionId, bookComponentId: a.bookComponentId, bookPage: a.bookPage,
      // Answers are NEVER sent before the work is marked.
      items: items.map((i) => ({ id: i.id, type: i.type, prompt: i.prompt, options: i.options, points: i.points, ...(reveal && i.type !== 'SHORT' && i.type !== 'READING' ? { answer: i.answer } : {}) })),
      submission: sub ? { status: sub.status, submittedAt: sub.submittedAt, answers: reveal ? sub.answers : (sub.answers as any[]).map((x) => ({ itemId: x.itemId, response: x.response })),
        score: reveal || (sub.status === 'GRADED' || sub.status === 'RETURNED') ? sub.score : null, maxScore: sub.maxScore, feedback: reveal ? sub.feedback : '', attempt: sub.attempt } : null,
    };
  }

  // ---------- online exam safety ----------
  /** Saves what the student's device reports during a try: photos, screen pictures, leaving the page. The student was told before starting. */
  async proctorEvent(id: string, d: ProctorEventDto) {
    const [a] = await this.q.select().from(assessments).where(eq(assessments.id, id));
    if (!a || !(await this.visibleToStudent(a))) throw new NotFoundException('Homework not found');
    const p = (a.proctor ?? {}) as { camera?: boolean; roomScan?: boolean; screen?: boolean };
    if (!p.camera && !p.roomScan && !p.screen) throw new BadRequestException('This work is not watched');
    const open = await this.openAttempt(id);
    if (!open) throw new ConflictException('Press Start first');
    const LIMIT: Record<string, number> = { ROOM: 12, CAMERA: 150, SCREEN: 150 };
    const { rows: [n] } = await this.q.execute(sql`SELECT count(*)::int AS all, count(*) FILTER (WHERE kind = ${d.kind})::int AS same FROM proctor_events
      WHERE assessment_id = ${id} AND student_id = ${this.ctx.userId} AND attempt = ${open.attempt}`) as any;
    if (n.all >= 800 || n.same >= (LIMIT[d.kind] ?? 300)) return { ok: true, skipped: true };
    let file: string | null = null;
    if (['ROOM', 'CAMERA', 'SCREEN'].includes(d.kind)) {
      const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(d.image ?? '');
      if (!m) throw new BadRequestException('The picture could not be sent');
      const bytes = Buffer.from(m[1], 'base64');
      if (bytes.length > 600_000 || bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new BadRequestException('The picture could not be sent');
      file = path.join('proctor', a.id, `${randomUUID()}.jpg`);
      await fsp.mkdir(path.join(config.storageDir, 'proctor', a.id), { recursive: true });
      await fsp.writeFile(path.join(config.storageDir, file), bytes);
    }
    await this.q.execute(sql`INSERT INTO proctor_events (publisher_id, school_id, assessment_id, student_id, attempt, kind, file, detail)
      VALUES (${this.ctx.publisherId}, ${this.ctx.schoolId}, ${id}, ${this.ctx.userId}, ${open.attempt}, ${d.kind}, ${file}, ${JSON.stringify(d.seconds !== undefined ? { seconds: d.seconds } : {})}::jsonb)`);
    return { ok: true };
  }
  /** Everything recorded for one student (teacher). */
  async proctorLog(id: string, studentId: string) {
    await this.assessment(id);
    const { rows } = await this.q.execute(sql`SELECT id, attempt, kind, detail, created_at AS "createdAt", file IS NOT NULL AS "hasImage" FROM proctor_events
      WHERE assessment_id = ${id} AND student_id = ${studentId} ORDER BY created_at`);
    return rows;
  }
  async proctorImage(eventId: string) {
    const { rows: [e] } = await this.q.execute(sql`SELECT assessment_id AS "assessmentId", file FROM proctor_events WHERE id = ${eventId}`) as any;
    if (!e?.file) throw new NotFoundException('Not found');
    await this.assessment(e.assessmentId);
    try { return await fsp.readFile(path.join(config.storageDir, e.file)); } catch { throw new NotFoundException('This picture was removed'); }
  }
  // ---------- live view: the newest camera and screen picture of each student, every few seconds ----------
  // Kept only as the latest picture on disk (overwritten each time, removed when the student hands in) — the record of the test is the random photos above.
  private liveDir(id: string) { return path.join(config.storageDir, 'live', id); }
  async liveFrame(id: string, d: LiveFrameDto) {
    const [a] = await this.q.select().from(assessments).where(eq(assessments.id, id));
    if (!a || !(await this.visibleToStudent(a))) throw new NotFoundException('Homework not found');
    const p = (a.proctor ?? {}) as { camera?: boolean; screen?: boolean };
    if (!p.camera && !p.screen) throw new BadRequestException('This work is not watched');
    const open = await this.openAttempt(id);
    if (!open) throw new ConflictException('Press Start first');
    const dir = this.liveDir(id); await fsp.mkdir(dir, { recursive: true });
    const me = this.ctx.userId;
    const save = async (kind: 'cam' | 'screen', img?: string) => {
      if (!img) return false;
      const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(img); if (!m) throw new BadRequestException('The picture could not be sent');
      const b = Buffer.from(m[1], 'base64'); if (b[0] !== 0xff || b[1] !== 0xd8 || b.length > 500_000) throw new BadRequestException('The picture could not be sent');
      const tmp = path.join(dir, `${me}-${kind}.${randomUUID()}.tmp`); await fsp.writeFile(tmp, b); await fsp.rename(tmp, path.join(dir, `${me}-${kind}.jpg`)); return true;
    };
    const cam = p.camera ? await save('cam', d.cam) : false; const screen = p.screen ? await save('screen', d.screen) : false;
    let meta: any = {}; try { meta = JSON.parse(await fsp.readFile(path.join(dir, `${me}.json`), 'utf8')); } catch { /* first one */ }
    meta = { ...meta, at: new Date().toISOString(), attempt: open.attempt, q: d.q ?? meta.q ?? null, answered: d.answered ?? meta.answered ?? null, ...(cam ? { camAt: new Date().toISOString() } : {}), ...(screen ? { screenAt: new Date().toISOString() } : {}) };
    await fsp.writeFile(path.join(dir, `${me}.json`), JSON.stringify(meta));
    return { ok: true };
  }
  /** Every student of a watched assessment: live or not, which question, answered, warnings so far. */
  async liveList(id: string) {
    const a = await this.assessment(id);
    const targeted = (await this.q.select({ id: assessmentStudents.studentId }).from(assessmentStudents).where(eq(assessmentStudents.assessmentId, id))).map((r) => r.id);
    const roster = (await this.q.execute(sql`SELECT u.id, u.display_name AS "displayName" FROM enrolments e JOIN users u ON u.id = e.student_id WHERE e.class_id = ${a.classId} ORDER BY u.display_name`)).rows as any[];
    const tries = (await this.q.execute(sql`SELECT DISTINCT ON (student_id) student_id AS "studentId", attempt, started_at AS "startedAt", submitted_at AS "submittedAt" FROM assessment_attempts WHERE assessment_id = ${id} ORDER BY student_id, attempt DESC`)).rows as any[];
    const ev = (await this.q.execute(sql`SELECT student_id AS "studentId", count(*) FILTER (WHERE kind = 'AWAY')::int AS away, coalesce(sum((detail->>'seconds')::int) FILTER (WHERE kind = 'AWAY'), 0)::int AS "awaySeconds",
        count(*) FILTER (WHERE kind IN ('SCREEN_OFF','CAMERA_OFF','SCREEN_PART','NO_SCREEN','NO_CAMERA','FULLSCREEN_OFF'))::int AS warnings, max(created_at) FILTER (WHERE kind <> 'CAMERA' AND kind <> 'SCREEN' AND kind <> 'ROOM') AS "lastEvent"
      FROM proctor_events WHERE assessment_id = ${id} GROUP BY student_id`)).rows as any[];
    const dir = this.liveDir(id);
    const out = [];
    for (const s of roster.filter((x) => !targeted.length || targeted.includes(x.id))) {
      let meta: any = null; try { meta = JSON.parse(await fsp.readFile(path.join(dir, `${s.id}.json`), 'utf8')); } catch { /* not live */ }
      const t = tries.find((x) => x.studentId === s.id); const e = ev.find((x) => x.studentId === s.id);
      const fresh = meta && Date.now() - new Date(meta.at).getTime() < 30_000 && t && !t.submittedAt;
      out.push({ id: s.id, name: s.displayName, state: !t ? 'NOT_STARTED' : t.submittedAt ? 'HANDED_IN' : fresh ? 'LIVE' : 'STARTED', startedAt: t?.startedAt ?? null, submittedAt: t?.submittedAt ?? null,
        attempt: t?.attempt ?? null, at: meta?.at ?? null, q: meta?.q ?? null, answered: meta?.answered ?? null, cam: !!(fresh && meta.camAt), screen: !!(fresh && meta.screenAt),
        away: e?.away ?? 0, awaySeconds: e?.awaySeconds ?? 0, warnings: e?.warnings ?? 0 });
    }
    return { proctor: a.proctor, total: a.timeLimitMin, students: out };
  }
  async liveImage(id: string, studentId: string, kind: string) {
    await this.assessment(id);
    if (kind !== 'cam' && kind !== 'screen') throw new NotFoundException('Not found');
    try { return await fsp.readFile(path.join(this.liveDir(id), `${studentId}-${kind}.jpg`)); } catch { throw new NotFoundException('No picture yet'); }
  }
  private async liveEnd(id: string, studentId: string) {
    const dir = this.liveDir(id);
    await Promise.all([`${studentId}-cam.jpg`, `${studentId}-screen.jpg`, `${studentId}.json`].map((f) => fsp.rm(path.join(dir, f), { force: true })));
  }

  /** Removes all photos and records of an assessment (e.g. after the results are final). */
  async proctorClear(id: string) {
    const a = await this.assessment(id);
    const { rows } = await this.q.execute(sql`DELETE FROM proctor_events WHERE assessment_id = ${id} RETURNING file`);
    await fsp.rm(path.join(config.storageDir, 'proctor', a.id), { recursive: true, force: true });
    await fsp.rm(this.liveDir(a.id), { recursive: true, force: true });
    await this.audit.log('lms.proctor.clear', 'assessment', id, `Deleted the exam photos of “${a.title}”`);
    return { removed: rows.length };
  }

  /** The try the student has started but not handed in yet. */
  private async openAttempt(id: string) {
    const { rows: [r] } = await this.q.execute(sql`SELECT attempt, started_at AS "startedAt" FROM assessment_attempts WHERE assessment_id = ${id} AND student_id = ${this.ctx.userId} AND submitted_at IS NULL ORDER BY attempt DESC LIMIT 1`) as any;
    return r as { attempt: number; startedAt: string } | undefined;
  }

  /** The student starts (or goes on with) a try: the timer starts now and the start time is kept for the teacher. */
  async startAttempt(id: string) {
    const [a] = await this.q.select().from(assessments).where(eq(assessments.id, id));
    if (!a || !(await this.visibleToStudent(a))) throw new NotFoundException('Homework not found');
    if (a.status !== 'PUBLISHED') throw new ConflictException('This homework is closed.');
    const open = await this.openAttempt(id);
    let attempt = open?.attempt; let startedAt = open?.startedAt;
    if (!open) {
      const [sub] = await this.q.select({ attempt: submissions.attempt }).from(submissions).where(and(eq(submissions.assessmentId, id), eq(submissions.studentId, this.ctx.userId)));
      attempt = (sub?.attempt ?? 0) + 1;
      if (attempt > a.maxAttempts) throw new ConflictException(a.maxAttempts > 1 ? 'You have used all your tries.' : 'You have already handed this in.');
      const { rows: [r] } = await this.q.execute(sql`INSERT INTO assessment_attempts (publisher_id, school_id, assessment_id, student_id, attempt)
        VALUES (${this.ctx.publisherId}, ${this.ctx.schoolId}, ${id}, ${this.ctx.userId}, ${attempt})
        ON CONFLICT (assessment_id, student_id, attempt) DO UPDATE SET attempt = EXCLUDED.attempt RETURNING started_at AS "startedAt"`) as any;
      startedAt = r.startedAt;
    }
    return { attempt, startedAt, endsAt: a.timeLimitMin ? new Date(new Date(startedAt!).getTime() + a.timeLimitMin * 60_000) : null, timeLimitMin: a.timeLimitMin, serverNow: new Date() };
  }

  async submit(id: string, d: SubmitDto) {
    const [a] = await this.q.select().from(assessments).where(eq(assessments.id, id));
    if (!a || !(await this.visibleToStudent(a))) throw new NotFoundException('Homework not found');
    if (a.status !== 'PUBLISHED') throw new ConflictException('This homework is closed.');
    const late = !!a.dueAt && a.dueAt < new Date();
    if (late && !a.allowLate) throw new ConflictException('The due date has passed.');
    const items = await this.q.select().from(assessmentItems).where(eq(assessmentItems.assessmentId, id));
    // Read-aloud answers are recordings: they must be this student's own reading clips.
    const clipIds = items.filter((it) => it.type === 'READING').map((it) => d.answers.find((x) => x.itemId === it.id)?.response).filter((v): v is string => typeof v === 'string' && /^[0-9a-f-]{36}$/.test(v));
    const okClips = new Set(clipIds.length ? ((await this.q.execute(sql`SELECT id FROM audio_clips WHERE owner_id = ${this.ctx.userId} AND kind = 'READING' AND id = ANY(${`{${clipIds.join(',')}}`}::uuid[])`)).rows as any[]).map((r) => r.id) : []);
    const answers = items.map((it) => {
      let response = d.answers.find((x) => x.itemId === it.id)?.response ?? null;
      if (it.type === 'READING' && !(typeof response === 'string' && okClips.has(response))) response = null;
      const typed = typeof response === 'string' ? response.slice(0, 4000) : response;
      return { itemId: it.id, response: typed, ...mark(it, typed) };
    });
    const pending = answers.some((x) => x.awarded === null);
    const maxScore = items.reduce((n, i) => n + i.points, 0);
    // how written answers were made — for the teacher only
    const { rows: [g] } = await this.q.execute(sql`SELECT gr.name FROM classes c LEFT JOIN grades gr ON gr.id = c.grade_id WHERE c.id = ${a.classId}`) as any;
    const grade = gradeNumber(g?.name);
    const checks: Record<string, unknown> = {};
    for (const it of items) {
      if (it.type !== 'SHORT' && it.type !== 'FILL_BLANK') continue;
      const text = answers.find((x) => x.itemId === it.id)?.response;
      if (typeof text !== 'string' || !text.trim()) continue;
      checks[it.id] = checkItem(text, d.signals?.find((x) => x.itemId === it.id), grade);
    }
    const integrity = { items: checks, grade, checkedAt: new Date().toISOString() };
    const score = pending ? null : answers.reduce((n, x) => n + (x.awarded ?? 0), 0);
    const [prev] = await this.q.select().from(submissions).where(and(eq(submissions.assessmentId, id), eq(submissions.studentId, this.ctx.userId)));
    const attempt = (prev?.attempt ?? 0) + 1;
    if (prev && attempt > a.maxAttempts) throw new ConflictException(a.maxAttempts > 1 ? 'You have used all your tries.' : 'You have already handed this in.');
    const now = new Date(); const status = pending ? 'SUBMITTED' as const : 'GRADED' as const;
    if (!prev) {
      try {
        await this.q.insert(submissions).values({ ...this.base(), assessmentId: id, studentId: this.ctx.userId, answers, maxScore, score, late, status, gradedAt: pending ? null : now, attempt: 1, integrity });
      } catch (e: any) {
        if ((e?.cause ?? e)?.code === '23505') throw new ConflictException('You have already handed this in.');
        throw e;
      }
    } else {
      // another try: the earlier one is kept (for the teacher), the new one counts
      const before = { attempt: prev.attempt, answers: prev.answers, score: prev.score, maxScore: prev.maxScore, status: prev.status, late: prev.late, feedback: prev.feedback, submittedAt: prev.submittedAt, integrity: prev.integrity };
      const [u] = await this.q.update(submissions).set({ answers, maxScore, score, late, status, gradedAt: pending ? null : now, gradedBy: null, feedback: '', submittedAt: now, attempt, integrity,
        history: sql`${submissions.history} || ${JSON.stringify([before])}::jsonb` }).where(and(eq(submissions.id, prev.id), eq(submissions.attempt, prev.attempt))).returning({ id: submissions.id });
      if (!u) throw new ConflictException('This was already handed in — please reload.');
    }
    // the timer: when this try was started and handed in
    const { rows: done } = await this.q.execute(sql`UPDATE assessment_attempts SET submitted_at = now(),
        over_time = ${a.timeLimitMin ? sql`now() > started_at + make_interval(mins => ${a.timeLimitMin}) + interval '2 minutes'` : sql`false`}
      WHERE assessment_id = ${id} AND student_id = ${this.ctx.userId} AND attempt = ${attempt} AND submitted_at IS NULL RETURNING attempt`);
    if (!done.length) await this.q.execute(sql`INSERT INTO assessment_attempts (publisher_id, school_id, assessment_id, student_id, attempt, submitted_at)
      VALUES (${this.ctx.publisherId}, ${this.ctx.schoolId}, ${id}, ${this.ctx.userId}, ${attempt}, now()) ON CONFLICT DO NOTHING`);
    await this.liveEnd(id, this.ctx.userId).catch(() => undefined);
    if (Object.keys(checks).length) {
      const [row] = await this.q.select({ id: submissions.id }).from(submissions).where(and(eq(submissions.assessmentId, id), eq(submissions.studentId, this.ctx.userId)));
      for (const h of this.afterSubmit) h(row.id).catch(() => undefined);
    }
    return { ok: true, status, score, maxScore, attempt, triesLeft: Math.max(0, a.maxAttempts - attempt) };
  }

  // ======================= evaluations & reports =======================
  async addEvaluation(d: EvaluationDto) {
    const classIds = this.access.is('SCHOOL_ADMIN') ? null : await this.access.teacherClassIds();
    if (classIds) {
      const mine = await this.q.execute(sql`SELECT 1 FROM enrolments WHERE student_id = ${d.studentId} AND class_id IN ${classIds.length ? classIds : ['00000000-0000-0000-0000-000000000000']}`);
      if (!mine.rows.length) throw new ForbiddenException('You can only evaluate students in your classes');
    }
    const [row] = await this.q.insert(evaluations).values({ ...this.base(), teacherId: this.ctx.userId, studentId: d.studentId, classId: d.classId ?? null, subjectId: d.subjectId ?? null,
      term: d.term ?? '', skill: d.skill.trim(), rating: d.rating, remarks: d.remarks ?? '' }).returning();
    return row;
  }
  async deleteEvaluation(id: string) {
    const [r] = await this.q.delete(evaluations).where(and(eq(evaluations.id, id), eq(evaluations.teacherId, this.ctx.userId))).returning();
    if (!r) throw new NotFoundException('Only the author can delete an evaluation');
    return { ok: true };
  }

  /** Student report card: assessments (by subject/unit/lesson) + evaluations. Teachers see their classes; admins all; students themselves. */
  async studentReport(studentId: string) {
    const isParent = this.access.is('PARENT') && studentId !== this.ctx.userId;
    if (isParent) {
      const linked = (await this.q.execute(sql`SELECT 1 FROM parent_students WHERE parent_id = ${this.ctx.userId} AND student_id = ${studentId}`)).rows.length;
      if (!linked) throw new ForbiddenException('Not your child');
    }
    const isSelf = studentId === this.ctx.userId || isParent; // parents see what the child sees (no unmarked scores)
    if (!isSelf && !this.access.is('SCHOOL_ADMIN')) {
      const classIds = await this.access.teacherClassIds();
      const ok = classIds.length && (await this.q.execute(sql`SELECT 1 FROM enrolments WHERE student_id = ${studentId} AND class_id IN ${classIds}`)).rows.length;
      if (!ok) throw new ForbiddenException('Not your student');
    }
    const [student] = await this.q.select({ id: users.id, displayName: users.displayName, username: users.username }).from(users).where(eq(users.id, studentId));
    if (!student) throw new NotFoundException('Student not found');
    const work = await this.q.execute(sql`SELECT a.id, a.title, a.kind, a.due_at AS "dueAt", s.status, s.score, s.max_score AS "maxScore", s.late, s.created_at AS "submittedAt",
        p.title AS book, sub.name AS subject, u.number AS "unitNumber", u.title AS unit, l.number AS "lessonNumber", l.title AS lesson
      FROM assessments a JOIN enrolments e ON e.class_id = a.class_id AND e.student_id = ${studentId}
      LEFT JOIN submissions s ON s.assessment_id = a.id AND s.student_id = ${studentId}
      LEFT JOIN book_editions be ON be.id = a.edition_id LEFT JOIN book_packages p ON p.id = be.package_id LEFT JOIN subjects sub ON sub.id = p.subject_id
      LEFT JOIN book_units u ON u.id = a.unit_id LEFT JOIN book_lessons l ON l.id = a.lesson_id
      WHERE a.status <> 'DRAFT' AND (NOT EXISTS (SELECT 1 FROM assessment_students t WHERE t.assessment_id = a.id) OR EXISTS (SELECT 1 FROM assessment_students t WHERE t.assessment_id = a.id AND t.student_id = ${studentId}))
      ORDER BY a.published_at DESC`);
    const evals = await this.q.select({ id: evaluations.id, term: evaluations.term, skill: evaluations.skill, rating: evaluations.rating, remarks: evaluations.remarks,
      createdAt: evaluations.createdAt, subject: subjects.name, teacher: users.displayName, mine: sql<boolean>`${evaluations.teacherId} = ${this.ctx.userId}` })
      .from(evaluations).leftJoin(subjects, eq(subjects.id, evaluations.subjectId)).innerJoin(users, eq(users.id, evaluations.teacherId))
      .where(eq(evaluations.studentId, studentId)).orderBy(desc(evaluations.createdAt));
    const rows = (work.rows as any[]).map((r) => (isSelf && !['GRADED', 'RETURNED'].includes(r.status) ? { ...r, score: null } : r));
    const bySubject: Record<string, { earned: number; max: number }> = {};
    for (const r of rows) if (r.score !== null && r.score !== undefined) { const k = r.subject ?? 'General'; (bySubject[k] ??= { earned: 0, max: 0 }); bySubject[k].earned += r.score; bySubject[k].max += r.maxScore; }
    const extra = await this.reportExtras(studentId);
    return { student, ...extra, work: rows, evaluations: evals, bySubject: Object.entries(bySubject).map(([subject, v]) => ({ subject, percent: v.max ? Math.round((v.earned / v.max) * 100) : null })) };
  }

  /** Header and summary details for a printed report card. */
  private async reportExtras(studentId: string) {
    const one = async (q: ReturnType<typeof sql>) => ((await this.q.execute(q)).rows[0] ?? {}) as any;
    const school = await one(sql`SELECT s.name, s.code FROM users u JOIN schools s ON s.id = u.school_id WHERE u.id = ${studentId}`);
    const cls = await one(sql`SELECT c.name, c.section, ay.name AS "academicYear", g.name AS grade,
        (SELECT string_agg(DISTINCT t.display_name, ', ') FROM class_teachers ct JOIN users t ON t.id = ct.user_id WHERE ct.class_id = c.id) AS teachers
      FROM enrolments e JOIN classes c ON c.id = e.class_id JOIN academic_years ay ON ay.id = c.academic_year_id LEFT JOIN grades g ON g.id = c.grade_id
      WHERE e.student_id = ${studentId} ORDER BY ay.starts_on DESC LIMIT 1`);
    const games = await one(sql`SELECT coalesce(sum(best), 0)::int AS stars FROM (SELECT max(stars) AS best FROM game_attempts WHERE student_id = ${studentId} GROUP BY activity_id) t`);
    const badges = await one(sql`SELECT count(*)::int AS n FROM student_badges WHERE student_id = ${studentId}`);
    const pages = await one(sql`SELECT coalesce(sum(max_page), 0)::int AS n FROM reader_progress WHERE user_id = ${studentId}`);
    const hasAtt = (await one(sql`SELECT to_regclass('attendance') IS NOT NULL AS ok`)).ok;
    const attendance = hasAtt ? (await this.q.execute(sql`SELECT status, count(*)::int AS n FROM attendance WHERE student_id = ${studentId} AND day > current_date - 365 GROUP BY status`)).rows : null;
    const exams = await examResultsFor(this.db, studentId);
    return { school: school.name ? { name: school.name, code: school.code } : null, class: cls.name ? cls : null, exams,
      summary: { stars: games.stars ?? 0, badges: badges.n ?? 0, pagesRead: pages.n ?? 0, attendance } };
  }

  /** Class gradebook: students × published assessments (+ per-lesson/unit averages). */
  async gradebook(classId: string) {
    const c = await this.access.assertTeaches(classId);
    const list = await this.q.select({ id: assessments.id, title: assessments.title, kind: assessments.kind, dueAt: assessments.dueAt, unitId: assessments.unitId, lessonId: assessments.lessonId,
      max: sql<number>`(SELECT coalesce(sum(points),0)::int FROM assessment_items i WHERE i.assessment_id = ${qc(assessments.id)})`,
      lesson: sql<string | null>`(SELECT 'U' || u.number || ' · L' || l.number || ' ' || l.title FROM book_lessons l JOIN book_units u ON u.id = l.unit_id WHERE l.id = ${qc(assessments.lessonId)})` })
      .from(assessments).where(and(eq(assessments.classId, classId), sql`${assessments.status} <> 'DRAFT'`)).orderBy(asc(assessments.publishedAt));
    const roster = (await this.q.execute(sql`SELECT u.id, u.display_name AS "displayName", u.username FROM enrolments e JOIN users u ON u.id = e.student_id WHERE e.class_id = ${classId} ORDER BY u.display_name`)).rows as any[];
    const subs = list.length ? await this.q.select({ assessmentId: submissions.assessmentId, studentId: submissions.studentId, score: submissions.score, status: submissions.status, late: submissions.late })
      .from(submissions).where(inArray(submissions.assessmentId, list.map((a) => a.id))) : [];
    const progress = roster.length ? (await this.q.execute(sql`SELECT p.user_id, sum(p.max_page)::int AS pages FROM reader_progress p WHERE p.user_id IN ${roster.map((r) => r.id)} GROUP BY p.user_id`)).rows as any[] : [];
    const students = roster.map((s) => {
      const cells = list.map((a) => subs.find((x) => x.assessmentId === a.id && x.studentId === s.id) ?? null);
      const earned = cells.reduce((n, x, i) => n + (x?.score ?? 0), 0);
      const possible = cells.reduce((n, x, i) => n + (x?.score !== null && x?.score !== undefined ? list[i].max : 0), 0);
      return { ...s, cells, percent: possible ? Math.round((earned / possible) * 100) : null, missing: cells.filter((x) => !x).length, pagesRead: progress.find((p) => p.user_id === s.id)?.pages ?? 0 };
    });
    const columns = list.map((a, i) => {
      const scores = students.map((s) => s.cells[i]?.score).filter((x): x is number => x !== null && x !== undefined);
      return { ...a, average: scores.length && a.max ? Math.round((scores.reduce((n, x) => n + x, 0) / scores.length / a.max) * 100) : null, submitted: students.filter((s) => s.cells[i]).length };
    });
    return { class: { id: c.id, name: c.name, section: c.section }, columns, students };
  }
}

/** Which safety checks are on (only known keys, only true/false). */
function cleanProctor(p?: { camera?: boolean; roomScan?: boolean; screen?: boolean } | null) {
  return { camera: !!p?.camera, roomScan: !!p?.roomScan, screen: !!p?.screen };
}
