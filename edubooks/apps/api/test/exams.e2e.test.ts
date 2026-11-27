import { INestApplication } from '@nestjs/common';
import { createApp, login } from './helpers';

describe('Exams and question papers', () => {
  let app: INestApplication; let teacher: any; let principal: any; let classId: string; let examId: string; let roster: any[];
  beforeAll(async () => {
    app = await createApp();
    teacher = await login(app, 'teacher1', 'Teacher@12345', 'SUN01');
    principal = await login(app, 'principal', 'School@12345', 'SUN01');
    classId = (await teacher.get('/api/classes?mine=true')).body[0].id;
  });
  afterAll(async () => { await app.close(); });

  it('builds a paper by hand and from the question bank', async () => {
    const e = await teacher.post('/api/exams').send({ classId, title: 'Mid-term English', term: 'Term 1', examDate: '2026-12-01', durationMin: 90 });
    expect(e.status).toBe(201); examId = e.body.id;
    expect((await teacher.put(`/api/exams/${examId}/items`).send({ items: [{ type: 'MCQ', prompt: 'Pick', options: ['a', 'b'], answer: [5], marks: 1 }] })).status).toBe(400);
    const p = await teacher.put(`/api/exams/${examId}/items`).send({ items: [
      { section: 'A', type: 'MCQ', prompt: 'Which is a fruit?', options: ['Apple', 'Chair'], answer: [0], marks: 2 },
      { section: 'A', type: 'TRUE_FALSE', prompt: 'The sun is hot.', answer: [true], marks: 1 },
      { section: 'B', type: 'LONG', prompt: 'Write about your family.', marks: 10 },
    ] });
    expect(p.status).toBe(200);
    expect(p.body.total).toBe(13);
    expect(p.body.items.find((i: any) => i.type === 'LONG').lines).toBe(8);
    await teacher.post('/api/teacher/question-bank').send({ type: 'SHORT', prompt: 'Name a colour.', answer: ['red'] });
    await teacher.post('/api/teacher/question-bank').send({ type: 'SHORT', prompt: 'Name an animal.', answer: ['cat'] });
    const g = await teacher.post(`/api/exams/${examId}/generate`).send({ parts: [{ type: 'SHORT', count: 2, marks: 3, section: 'C' }] });
    expect(g.status).toBe(201);
    expect(g.body.total).toBe(19);
    expect(g.body).toMatchObject({ className: expect.any(String), school: 'Sunrise Grammar School' });
    const list = (await principal.get('/api/exams')).body;
    expect(list.find((x: any) => x.id === examId)).toMatchObject({ questions: 5, total: 19 });
  });

  it('takes marks, publishes results to report cards and parents, and guards the rules', async () => {
    roster = (await teacher.get(`/api/exams/${examId}/marks`)).body.roster;
    const s1 = roster.find((r) => r.username === 'student1');
    expect((await teacher.put(`/api/exams/${examId}/marks`).send({ marks: [{ studentId: s1.id, marks: 25 }] })).status).toBe(400); // over the total
    const m = await teacher.put(`/api/exams/${examId}/marks`).send({ marks: [{ studentId: s1.id, marks: 15.5, remarks: 'Good work' }, { studentId: roster[1].id, absent: true }] });
    expect(m.status).toBe(200);
    expect(m.body.stats).toMatchObject({ count: 1, average: 15.5 });
    const s1Login = await login(app, 'student1', 'Student@123', 'SUN01');
    expect((await s1Login.get('/api/student/report')).body.exams).toHaveLength(0); // not published yet
    expect((await teacher.post(`/api/exams/${examId}/publish`)).status).toBe(201);
    const rep = (await s1Login.get('/api/student/report')).body;
    expect(rep.exams.find((x: any) => x.id === examId)).toMatchObject({ marks: 15.5, total: 19, term: 'Term 1' });
    const parent = await login(app, 'parent1', 'Parent@123', 'SUN01');
    expect((await parent.get(`/api/parent/children/${s1.id}`)).body.exams[0]).toMatchObject({ marks: 15.5 });
    expect(JSON.stringify((await parent.get('/api/notifications')).body)).toContain('Exam results');
    expect((await teacher.put(`/api/exams/${examId}/items`).send({ items: [] })).status).toBe(400); // published: paper locked
    expect((await teacher.delete(`/api/exams/${examId}`)).status).toBe(400);
    expect((await s1Login.get(`/api/exams/${examId}`)).status).toBe(403);
    const other = await login(app, 'principal', 'School@12345', 'GVS02');
    expect((await other.get(`/api/exams/${examId}`)).status).toBe(404);
  });
});
