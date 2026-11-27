import { createApp, login, ownerPool } from './helpers';

describe('Assessments: timer, start and hand-in times, up to 3 tries', () => {
  let app: any; let teacher: any; let student: any; let classId: string; const made: string[] = [];
  beforeAll(async () => {
    app = await createApp(); teacher = await login(app, 'teacher1', 'Teacher@12345', 'SUN01'); student = await login(app, 'student1', 'Student@123', 'SUN01');
    classId = (await teacher.get('/api/classes?mine=true')).body[0].id;
  });
  afterAll(async () => { const o = ownerPool(); await o.query(`DELETE FROM assessments WHERE id = ANY($1::uuid[])`, [made]); await o.end(); await app.close(); });
  const make = async (extra: any) => {
    const r = await teacher.post('/api/teacher/assessments').send({ classId, kind: 'QUIZ', title: `Timed ${Date.now()}`, ...extra,
      items: [{ type: 'MCQ', prompt: '2 + 2 = ?', options: ['3', '4'], answer: [1], points: 1 }, { type: 'TRUE_FALSE', prompt: 'The sun is hot', answer: [true], points: 1 }] });
    expect(r.status).toBe(201); made.push(r.body.id);
    expect((await teacher.post(`/api/teacher/assessments/${r.body.id}/publish`)).status).toBe(201);
    return r.body.id as string;
  };
  const answer = async (id: string, right: boolean) => {
    const v = (await student.get(`/api/student/homework/${id}`)).body;
    return student.post(`/api/student/homework/${id}/submit`).send({ answers: [{ itemId: v.items[0].id, response: right ? 1 : 0 }, { itemId: v.items[1].id, response: right }] });
  };

  it('checks the settings', async () => {
    expect((await teacher.post('/api/teacher/assessments').send({ classId, kind: 'QUIZ', title: 'Too many', maxAttempts: 4 })).status).toBe(400);
    expect((await teacher.post('/api/teacher/assessments').send({ classId, kind: 'QUIZ', title: 'Too long', timeLimitMin: 601 })).status).toBe(400);
  });

  it('starts the clock, keeps the start time, and shows the time limit', async () => {
    const id = await make({ timeLimitMin: 20 });
    let v = (await student.get(`/api/student/homework/${id}`)).body;
    expect(v).toMatchObject({ timeLimitMin: 20, maxAttempts: 1, attemptsUsed: 0, triesLeft: 1, current: null });
    const s = (await student.post(`/api/student/homework/${id}/start`)).body;
    expect(s.attempt).toBe(1); expect(new Date(s.endsAt).getTime() - new Date(s.startedAt).getTime()).toBe(20 * 60_000);
    // opening again goes on with the same try (the clock does not restart)
    const again = (await student.post(`/api/student/homework/${id}/start`)).body; expect(again.startedAt).toBe(s.startedAt);
    v = (await student.get(`/api/student/homework/${id}`)).body; expect(v.current.startedAt).toBe(s.startedAt);
    expect((await answer(id, true)).body).toMatchObject({ status: 'GRADED', score: 2, attempt: 1, triesLeft: 0 });
    expect((await student.post(`/api/student/homework/${id}/start`)).status).toBe(409);
    expect((await answer(id, true)).status).toBe(409);
    const t = (await teacher.get(`/api/teacher/assessments/${id}`)).body.students.find((x: any) => x.submission);
    expect(t.attempts).toHaveLength(1); expect(t.attempts[0]).toMatchObject({ attempt: 1, startedAt: s.startedAt, overTime: false });
    expect(t.attempts[0].seconds).toBeGreaterThanOrEqual(0); expect(t.attempts[0].submittedAt).toBeTruthy();
  });

  it('marks work handed in long after the time ran out', async () => {
    const id = await make({ timeLimitMin: 1 });
    await student.post(`/api/student/homework/${id}/start`);
    const o = ownerPool(); await o.query(`UPDATE assessment_attempts SET started_at = now() - interval '10 minutes' WHERE assessment_id = $1`, [id]); await o.end();
    expect((await answer(id, true)).status).toBe(201);
    const t = (await teacher.get(`/api/teacher/assessments/${id}`)).body.students.find((x: any) => x.submission);
    expect(t.attempts[0].overTime).toBe(true); expect(t.attempts[0].seconds).toBeGreaterThanOrEqual(600);
  });

  it('allows up to 3 tries: answers stay hidden until the last try; the teacher sees every try', async () => {
    const id = await make({ maxAttempts: 3 });
    expect((await answer(id, false)).body).toMatchObject({ score: 0, attempt: 1, triesLeft: 2 }); // handed in without pressing Start (old app): still timed
    let v = (await student.get(`/api/student/homework/${id}`)).body;
    expect(v).toMatchObject({ attemptsUsed: 1, triesLeft: 2 }); expect(v.submission.score).toBe(0);
    expect(v.items.every((i: any) => i.answer === undefined)).toBe(true);
    expect(v.submission.answers.every((a: any) => a.correct === undefined)).toBe(true);
    await student.post(`/api/student/homework/${id}/start`);
    expect((await answer(id, false)).body).toMatchObject({ attempt: 2, triesLeft: 1 });
    await student.post(`/api/student/homework/${id}/start`);
    expect((await answer(id, true)).body).toMatchObject({ score: 2, attempt: 3, triesLeft: 0 });
    v = (await student.get(`/api/student/homework/${id}`)).body;
    expect(v.triesLeft).toBe(0); expect(v.items[0].answer).toEqual([1]);
    expect((await student.post(`/api/student/homework/${id}/start`)).status).toBe(409);
    const t = (await teacher.get(`/api/teacher/assessments/${id}`)).body.students.find((x: any) => x.submission);
    expect(t.submission).toMatchObject({ attempt: 3, score: 2 });
    expect(t.submission.history.map((h: any) => [h.attempt, h.score])).toEqual([[1, 0], [2, 0]]);
    expect(t.attempts.map((x: any) => x.attempt)).toEqual([1, 2, 3]);
    expect(t.attempts.every((x: any) => x.submittedAt)).toBe(true);
  });
});
