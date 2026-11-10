import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createApp, login, ownerPool, PDF } from './helpers';
import { cleanItem, mark } from '../src/lms/lms.service';

type Agent = Awaited<ReturnType<typeof login>>;

describe('marking rules (unit)', () => {
  it('auto-marks MCQ, true/false and fill-in-the-blank; leaves short answers to the teacher', () => {
    expect(mark({ type: 'MCQ', answer: [1], points: 2, options: ['a', 'b'] }, 1)).toEqual({ correct: true, awarded: 2 });
    expect(mark({ type: 'MCQ', answer: [1], points: 2, options: ['a', 'b'] }, 0)).toEqual({ correct: false, awarded: 0 });
    expect(mark({ type: 'TRUE_FALSE', answer: [false], points: 1, options: [] }, false)).toEqual({ correct: true, awarded: 1 });
    expect(mark({ type: 'FILL_BLANK', answer: ['Cat', 'kitten'], points: 1, options: [] }, '  cat. ')).toEqual({ correct: true, awarded: 1 });
    expect(mark({ type: 'SHORT', answer: [], points: 2, options: [] }, 'ball')).toEqual({ correct: null, awarded: null });
    expect(mark({ type: 'MCQ', answer: [0], points: 1, options: [] }, '')).toEqual({ correct: false, awarded: 0 });
  });
  it('rejects badly built questions with a clear message', () => {
    expect(() => cleanItem({ type: 'MCQ', prompt: 'x', options: ['only one'], answer: [0] }, 3)).toThrow(/Question 3: add at least two choices/);
    expect(() => cleanItem({ type: 'MCQ', prompt: 'x', options: ['a', 'b'], answer: [5] }, 1)).toThrow(/mark the correct choice/);
    expect(() => cleanItem({ type: 'FILL_BLANK', prompt: 'x', answer: [' '] }, 1)).toThrow(/accepted answer/);
  });
});

describe('Phase 4 — classes, reader, assessments, reports', () => {
  let app: INestApplication; const owner = ownerPool();
  let principal: Agent; let teacher: Agent; let s1: Agent; let s3: Agent; let otherTeacher: Agent; let gvsKid: Agent;
  let classId: string; let englishEd: string; let part1: string; let lessonId: string; let hwId: string;

  beforeAll(async () => {
    app = await createApp();
    [principal, teacher, s1, s3, gvsKid] = await Promise.all([
      login(app, 'principal', 'School@12345', 'SUN01'), login(app, 'teacher1', 'Teacher@12345', 'SUN01'),
      login(app, 'student1', 'Student@123', 'SUN01'), login(app, 'student3', 'Student@123', 'SUN01'), login(app, 'student1', 'Student@123', 'GVS02'),
    ]);
    classId = (await principal.get('/api/classes')).body[0].id;
    const lib = (await teacher.get('/api/teacher/books')).body;
    englishEd = lib.find((b: any) => b.title === 'KG English').editionId;
    const r = (await teacher.get(`/api/reader/editions/${englishEd}`)).body;
    part1 = r.components[0].id; lessonId = r.components[0].units[0].lessons[0].id;
    hwId = (await owner.query(`SELECT id FROM assessments LIMIT 1`)).rows[0].id;
    const created = (await principal.post('/api/school/users').send({ role: 'TEACHER', users: [{ displayName: 'Other Teacher', username: 'other', password: 'Other@1234' }] })).body;
    expect(created).toHaveLength(1);
    otherTeacher = await login(app, 'other', 'Other@1234', 'SUN01');
  });
  afterAll(async () => { await owner.end(); await app.close(); });

  describe('classes', () => {
    it('school admin manages classes; one class per student per academic year', async () => {
      const cls = (await principal.get(`/api/classes/${classId}`)).body;
      expect(cls.roster.map((r: any) => r.username)).toEqual(['student1', 'student2', 'student3']);
      const ay = cls.academicYearId;
      const b = (await principal.post('/api/classes').send({ academicYearId: ay, name: 'KG', section: 'Tulip' })).body;
      const s1Id = cls.roster[0].id;
      const r = await principal.post(`/api/classes/${b.id}/students`).send({ studentIds: [s1Id] });
      expect(r.status).toBe(409);
      expect(r.body.message).toMatch(/one class per academic year/);
      expect((await teacher.post('/api/classes').send({ academicYearId: ay, name: 'X' })).status).toBe(403);
    });
    it('teachers see only the classes they teach', async () => {
      expect((await teacher.get('/api/classes?mine=true')).body).toHaveLength(1);
      expect((await otherTeacher.get('/api/classes?mine=true')).body).toHaveLength(0);
      expect((await otherTeacher.get(`/api/classes/${classId}`)).status).toBe(403);
    });
  });

  describe('digital reader', () => {
    it('opens licensed books with table of contents, progress and bookmarks', async () => {
      const r = (await s1.get(`/api/reader/editions/${englishEd}`)).body;
      expect(r.components[0]).toMatchObject({ title: 'Student Book Part 1', hasPdf: true, pageCount: 26 });
      expect(r.components[0].units[0].lessons[0]).toHaveProperty('pageStart');
      expect(r.assessments.map((a: any) => a.title)).toContain('Sample homework (placeholder questions)');
      const link = (await s1.get(`/api/reader/components/${part1}/pdf`)).body;
      const f = await request(app.getHttpServer()).get(link.url).buffer(true);
      expect(f.status).toBe(200); expect(f.headers['content-type']).toMatch(/pdf/);
      await s1.put('/api/reader/progress').send({ componentId: part1, page: 7 });
      await s1.put('/api/reader/progress').send({ componentId: part1, page: 3 });
      await s1.post('/api/reader/bookmarks').send({ componentId: part1, page: 5, note: 'Letter B' });
      const again = (await s1.get(`/api/reader/editions/${englishEd}`)).body.components[0];
      expect(again.progress).toMatchObject({ lastPage: 3, maxPage: 7 });
      expect(again.bookmarks.map((b: any) => b.page)).toEqual([5]);
      expect((await s1.put('/api/reader/progress').send({ componentId: part1, page: 999 })).status).toBe(400);
    });
    it('students only see student resources; unlicensed users cannot open the book', async () => {
      const kid = (await s1.get(`/api/reader/editions/${englishEd}`)).body.resources;
      const tch = (await teacher.get(`/api/reader/editions/${englishEd}`)).body.resources;
      expect(kid.every((r: any) => r.audience !== 'TEACHER')).toBe(true);
      expect(tch.some((r: any) => r.audience === 'TEACHER')).toBe(true);
      expect((await s3.get(`/api/reader/editions/${englishEd}`)).status).toBe(403); // student3 holds no seat
      expect((await s3.get(`/api/reader/components/${part1}/pdf`)).status).toBe(403);
    });
    it('bookmarks are private even inside the school (RLS)', async () => {
      const { rows } = await owner.query(`SELECT count(*)::int AS n FROM bookmarks`);
      expect(rows[0].n).toBe(1);
      const t = (await teacher.get(`/api/reader/editions/${englishEd}`)).body.components[0];
      expect(t.bookmarks).toEqual([]);
    });
    it('publishers attach the book PDF once; published editions cannot replace it', async () => {
      const admin = await login(app, 'admin', 'Admin@12345');
      expect((await admin.post(`/api/publishing/components/${part1}/book-pdf`).attach('file', PDF, 'new.pdf')).status).toBe(409);
      const part2 = (await admin.get(`/api/publishing/editions/${englishEd}`)).body.components[1];
      const r = await admin.post(`/api/publishing/components/${part2.id}/book-pdf`).attach('file', PDF, 'part2.pdf');
      expect(r.status).toBe(201);
    });
  });

  describe('assessments', () => {
    let quizId: string;
    it('teacher builds a quiz linked to a lesson, assigns to the class and publishes', async () => {
      const bad = await teacher.post('/api/teacher/assessments').send({ classId, kind: 'QUIZ', title: 'Bad', items: [{ type: 'MCQ', prompt: 'x', options: ['a'], answer: [0] }] });
      expect(bad.status).toBe(400);
      const r = await teacher.post('/api/teacher/assessments').send({
        classId, kind: 'QUIZ', title: 'Letter A quiz', editionId: englishEd, lessonId, dueAt: new Date(Date.now() + 864e5).toISOString(), items: [
          { type: 'MCQ', prompt: 'A is for…', options: ['Ball', 'Apple'], answer: [1], points: 2 },
          { type: 'FILL_BLANK', prompt: '__ is the first letter', answer: ['A', 'a'] },
        ] });
      expect(r.status).toBe(201); quizId = r.body.id;
      expect((await s1.get(`/api/student/homework/${quizId}`)).status).toBe(404); // draft is invisible
      expect((await otherTeacher.post('/api/teacher/assessments').send({ classId, kind: 'QUIZ', title: 'Not mine' })).status).toBe(403);
      expect((await teacher.post(`/api/teacher/assessments/${quizId}/publish`)).status).toBe(201);
    });

    it('students never receive answers before marking; objective work is marked instantly', async () => {
      const view = (await s1.get(`/api/student/homework/${quizId}`)).body;
      expect(view.items.every((i: any) => i.answer === undefined)).toBe(true);
      const items = view.items;
      const r = await s1.post(`/api/student/homework/${quizId}/submit`).send({ answers: [{ itemId: items[0].id, response: 1 }, { itemId: items[1].id, response: ' a ' }] });
      expect(r.body).toMatchObject({ status: 'GRADED', score: 3, maxScore: 3 });
      expect((await s1.post(`/api/student/homework/${quizId}/submit`).send({ answers: [] })).status).toBe(409);
      const after = (await s1.get(`/api/student/homework/${quizId}`)).body;
      expect(after.items[0].answer).toEqual([1]);
    });

    it('written answers wait for the teacher; partial marks; returned with feedback', async () => {
      const hw = (await s1.get(`/api/student/homework/${hwId}`)).body;
      const ans = hw.items.map((i: any) => ({ itemId: i.id, response: i.type === 'MCQ' ? 1 : i.type === 'TRUE_FALSE' ? true : i.type === 'FILL_BLANK' ? 'Cat' : 'ball' }));
      const sub = (await s1.post(`/api/student/homework/${hwId}/submit`).send({ answers: ans })).body;
      expect(sub).toMatchObject({ status: 'SUBMITTED', score: null });
      expect((await s1.get(`/api/student/homework/${hwId}`)).body.submission.score).toBeNull();
      const t = (await teacher.get(`/api/teacher/assessments/${hwId}`)).body;
      const row = t.students.find((s: any) => s.username === 'student1').submission;
      const shortItem = t.items.find((i: any) => i.type === 'SHORT');
      expect((await teacher.patch(`/api/teacher/submissions/${row.id}`).send({ returnToStudent: true })).status).toBe(400);
      expect((await teacher.patch(`/api/teacher/submissions/${row.id}`).send({ itemScores: [{ itemId: shortItem.id, awarded: 9 }] })).status).toBe(400);
      const g = await teacher.patch(`/api/teacher/submissions/${row.id}`).send({ itemScores: [{ itemId: shortItem.id, awarded: 1 }], feedback: 'Good! Try a longer word.', returnToStudent: true });
      expect(g.body).toMatchObject({ status: 'RETURNED', score: 4 });
      const back = (await s1.get(`/api/student/homework/${hwId}`)).body.submission;
      expect(back).toMatchObject({ status: 'RETURNED', score: 4, maxScore: 5, feedback: 'Good! Try a longer word.' });
    });

    it('targeting specific students hides the work from others; other schools never see it', async () => {
      const roster = (await principal.get(`/api/classes/${classId}`)).body.roster;
      const s3Id = roster.find((r: any) => r.username === 'student3').id;
      const r = (await teacher.post('/api/teacher/assessments').send({ classId, kind: 'HOMEWORK', title: 'Extra practice', studentIds: [s3Id], items: [{ type: 'TRUE_FALSE', prompt: 'B is a vowel', answer: [false] }] })).body;
      await teacher.post(`/api/teacher/assessments/${r.id}/publish`);
      expect((await s3.get('/api/student/homework')).body.map((x: any) => x.title)).toContain('Extra practice');
      expect((await s1.get('/api/student/homework')).body.map((x: any) => x.title)).not.toContain('Extra practice');
      expect((await gvsKid.get(`/api/student/homework/${r.id}`)).status).toBe(404);
      expect((await gvsKid.get('/api/student/homework')).body).toEqual([]);
    });

    it('questions cannot change after students answered; closed work rejects submissions', async () => {
      expect((await teacher.patch(`/api/teacher/assessments/${quizId}`).send({ items: [{ type: 'TRUE_FALSE', prompt: 'x', answer: [true] }] })).status).toBe(409);
      expect((await teacher.patch(`/api/teacher/assessments/${quizId}`).send({ title: 'Letter A quiz (week 1)' })).status).toBe(200);
      await teacher.post(`/api/teacher/assessments/${quizId}/close`);
      const s2 = await login(app, 'student2', 'Student@123', 'SUN01');
      expect((await s2.post(`/api/student/homework/${quizId}/submit`).send({ answers: [] })).status).toBe(409);
    });
  });

  describe('question bank, lesson plans, evaluations, reports', () => {
    it('question bank → assessment', async () => {
      const q = await teacher.post('/api/teacher/question-bank').send({ type: 'FILL_BLANK', prompt: 'D is for ___', answer: ['dog'], editionId: englishEd, lessonId });
      expect(q.status).toBe(201);
      expect((await otherTeacher.get(`/api/teacher/question-bank?editionId=${englishEd}`)).body).toHaveLength(1); // shared within school
      expect((await otherTeacher.delete(`/api/teacher/question-bank/${q.body.id}`)).status).toBe(404);
      const a = (await teacher.post('/api/teacher/assessments').send({ classId, kind: 'TEST', title: 'Bank test' })).body;
      expect((await teacher.post(`/api/teacher/assessments/${a.id}/from-bank`).send({ questionIds: [q.body.id] })).body.added).toBe(1);
    });

    it('lesson plans are private, linked to a licensed lesson, and can be duplicated', async () => {
      const p = await teacher.post('/api/teacher/lesson-plans').send({ title: 'Letter A', classId, editionId: englishEd, lessonId, durationMin: 30,
        content: { objectives: 'Recognise A', steps: [{ title: 'Warm-up song', minutes: 5 }] } });
      expect(p.status).toBe(201);
      expect((await teacher.post(`/api/teacher/lesson-plans/${p.body.id}/duplicate`)).body.title).toBe('Letter A (copy)');
      expect((await otherTeacher.get(`/api/teacher/lesson-plans/${p.body.id}`)).status).toBe(404);
      expect((await otherTeacher.post('/api/teacher/lesson-plans').send({ title: 'No licence plan', editionId: englishEd })).status).toBe(403); // no licence
    });

    it('gradebook, report card and evaluations', async () => {
      const gb = (await teacher.get(`/api/teacher/classes/${classId}/gradebook`)).body;
      const s1row = gb.students.find((s: any) => s.username === 'student1');
      expect(s1row.percent).toBe(88); // (3 + 4) / (3 + 5)
      expect(s1row.pagesRead).toBe(7);
      expect((await otherTeacher.get(`/api/teacher/classes/${classId}/gradebook`)).status).toBe(403);
      const s1Id = s1row.id;
      expect((await teacher.post('/api/teacher/evaluations').send({ studentId: s1Id, classId, skill: 'Speaking', rating: 4, term: 'Term 1' })).status).toBe(201);
      expect((await otherTeacher.post('/api/teacher/evaluations').send({ studentId: s1Id, skill: 'Speaking', rating: 5 })).status).toBe(403);
      const rep = (await s1.get('/api/student/report')).body;
      expect(rep.evaluations[0]).toMatchObject({ skill: 'Speaking', rating: 4 });
      expect(rep.bySubject).toEqual([{ subject: 'English', percent: 88 }]);
      expect((await s1.get(`/api/teacher/students/${s1Id}/report`)).status).toBe(403);
    });
  });
});
