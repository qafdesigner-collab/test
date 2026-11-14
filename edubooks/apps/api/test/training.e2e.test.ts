import { INestApplication } from '@nestjs/common';
import { createApp, login } from './helpers';

describe('Teacher training', () => {
  let app: INestApplication; let admin: any; let teacher: any; let courseId: string; let quizId: string; let videoId: string;
  beforeAll(async () => {
    app = await createApp();
    admin = await login(app, 'admin', 'Admin@12345');
    teacher = await login(app, 'teacher1', 'Teacher@12345', 'SUN01');
  });
  afterAll(async () => { await app.close(); });

  it('lets the publisher build and publish a course; drafts stay hidden', async () => {
    const c = await admin.post('/api/training/admin/courses').send({ title: 'Teaching with digital books', description: 'Get started in 20 minutes' });
    expect(c.status).toBe(201); courseId = c.body.id;
    expect((await admin.patch(`/api/training/admin/courses/${courseId}`).send({ status: 'PUBLISHED' })).status).toBe(400); // no lessons yet
    expect((await admin.post(`/api/training/admin/courses/${courseId}/lessons`).send({ title: 'Intro', kind: 'VIDEO', url: 'https://evil.example/x.mp4' })).status).toBe(400);
    expect((await admin.post(`/api/training/admin/courses/${courseId}/lessons`).send({ title: 'Intro', kind: 'LINK', url: 'http://plain.example' })).status).toBe(400);
    videoId = (await admin.post(`/api/training/admin/courses/${courseId}/lessons`).send({ title: 'Intro', kind: 'VIDEO', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', minutes: 4 })).body.id;
    await admin.post(`/api/training/admin/courses/${courseId}/lessons`).send({ title: 'Reading', kind: 'TEXT', body: 'Open a book from My books.' });
    expect((await admin.post(`/api/training/admin/courses/${courseId}/lessons`).send({ title: 'Check', kind: 'QUIZ', quiz: [{ q: 'Q1', options: ['a', 'b'], answer: 2 }] })).status).toBe(400);
    quizId = (await admin.post(`/api/training/admin/courses/${courseId}/lessons`).send({ title: 'Check', kind: 'QUIZ',
      quiz: [{ q: 'Where are your books?', options: ['My books', 'Games'], answer: 0 }, { q: 'Can students see drafts?', options: ['Yes', 'No'], answer: 1 }] })).body.id;
    expect((await teacher.get('/api/training/courses')).body.find((x: any) => x.id === courseId)).toBeUndefined();
    expect((await teacher.get(`/api/training/courses/${courseId}`)).status).toBe(404);
    expect((await teacher.post('/api/training/admin/courses').send({ title: 'Nope' })).status).toBe(403);
    expect((await admin.patch(`/api/training/admin/courses/${courseId}`).send({ status: 'PUBLISHED' })).status).toBe(200);
  });

  it('teachers learn, quizzes are marked on the server, and progress is reported', async () => {
    const list = (await teacher.get('/api/training/courses')).body;
    expect(list.find((x: any) => x.id === courseId)).toMatchObject({ lessons: 3, done: 0 });
    const c = (await teacher.get(`/api/training/courses/${courseId}`)).body;
    const quiz = c.lessons.find((l: any) => l.id === quizId).quiz;
    expect(quiz[0]).toEqual({ q: 'Where are your books?', options: ['My books', 'Games'] }); // no answer key
    expect((await teacher.post(`/api/training/lessons/${quizId}/complete`).send({ answers: [0] })).status).toBe(400);
    const fail = (await teacher.post(`/api/training/lessons/${quizId}/complete`).send({ answers: [1, 1] })).body;
    expect(fail).toMatchObject({ passed: false, score: 50, correct: [false, true] });
    expect((await teacher.post(`/api/training/lessons/${quizId}/complete`).send({ answers: [0, 1] })).body).toMatchObject({ passed: true, score: 100 });
    for (const l of c.lessons.filter((x: any) => x.kind !== 'QUIZ')) await teacher.post(`/api/training/lessons/${l.id}/complete`).send({});
    const after = (await teacher.get(`/api/training/courses/${courseId}`)).body;
    expect(after.completedAt).toBeTruthy();

    const principal = await login(app, 'principal', 'School@12345', 'SUN01');
    const sch = (await principal.get('/api/training/school')).body;
    expect(sch.teachers.find((t: any) => t.displayName === 'Sample Teacher').progress[courseId]).toBe(3);
    const rep = (await admin.get('/api/training/admin/report')).body;
    expect(rep.learners.find((l: any) => l.courseId === courseId)).toMatchObject({ done: 3, total: 3 });
    expect(rep.schools.find((s: any) => s.name === 'Sunrise Grammar School').completed).toBeGreaterThanOrEqual(1);
    expect((await admin.get('/api/training/admin/courses')).body.find((x: any) => x.id === courseId)).toMatchObject({ learners: 1, completed: 1 });
    expect((await admin.delete(`/api/training/admin/courses/${courseId}`)).status).toBe(409);
    const student = await login(app, 'student1', 'Student@123', 'SUN01');
    expect((await student.get('/api/training/courses')).status).toBe(403);
    expect((await admin.delete(`/api/training/admin/lessons/${videoId}`)).status).toBe(200);
  });
});
