import { createApp, login, ownerPool } from './helpers';

const WEBM = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(2000, 1)]);

describe('Stickers and voice feedback, class goals, plan my week, the parents’ weekly summary', () => {
  let app: any; let teacher: any; let student: any; let parent: any; let principal: any; let other: any;
  let kg: string; let aid: string; let sub: string; let me: string; const cleanup: string[] = [];
  beforeAll(async () => {
    app = await createApp();
    teacher = await login(app, 'teacher1', 'Teacher@12345', 'SUN01'); student = await login(app, 'student1', 'Student@123', 'SUN01');
    parent = await login(app, 'parent1', 'Parent@123', 'SUN01'); principal = await login(app, 'principal', 'School@12345', 'SUN01');
    other = await login(app, 'student3', 'Student@123', 'SUN01').catch(() => null);
    kg = (await teacher.get('/api/classes?mine=true')).body[0].id; me = (await student.get('/api/auth/me')).body.id;
    const a = await teacher.post('/api/teacher/assessments').send({ classId: kg, kind: 'HOMEWORK', title: `Feedback check ${Date.now()}`, dueAt: new Date(Date.now() + 2 * 864e5).toISOString(),
      items: [{ type: 'TRUE_FALSE', prompt: 'Fish swim', answer: [true], points: 1 }] });
    aid = a.body.id; await teacher.post(`/api/teacher/assessments/${aid}/publish`);
    const v = (await student.get(`/api/student/homework/${aid}`)).body;
    await student.post(`/api/student/homework/${aid}/start`);
    await student.post(`/api/student/homework/${aid}/submit`).send({ answers: [{ itemId: v.items[0].id, response: true }] });
    const o = ownerPool(); sub = (await o.query('SELECT id FROM submissions WHERE assessment_id = $1', [aid])).rows[0]?.id; await o.end();
  });
  afterAll(async () => {
    const o = ownerPool();
    await o.query('DELETE FROM assessments WHERE id = $1', [aid]);
    await o.query('DELETE FROM class_goals WHERE class_id = $1', [kg]);
    await o.query(`DELETE FROM page_work WHERE image = 'data:image/png;base64,AA'`);
    await o.query('DELETE FROM lesson_plans WHERE id = ANY($1::uuid[])', [cleanup]);
    await o.end(); await app.close();
  });

  it('a teacher gives stickers and a voice note; the child and the parent see and hear it', async () => {
    expect(sub).toBeTruthy();
    // only teachers record feedback voice notes
    expect((await student.post('/api/messages/audio').field('kind', 'FEEDBACK').attach('file', WEBM, 'v.webm')).status).toBe(403);
    const clip = (await teacher.post('/api/messages/audio').field('kind', 'FEEDBACK').field('durationMs', '3000').attach('file', WEBM, 'v.webm')).body;
    expect(clip.id).toBeTruthy();
    expect((await student.put(`/api/feedback/submission/${sub}`).send({ stickers: ['GREAT'] })).status).toBe(403);
    expect((await teacher.put(`/api/feedback/submission/${sub}`).send({ stickers: ['NOPE'] })).status).toBe(400);
    const f = await teacher.put(`/api/feedback/submission/${sub}`).send({ stickers: ['GREAT', 'NEAT'], voiceId: clip.id, note: 'Lovely work!' });
    expect(f.status).toBe(200); expect(f.body.stickers.map((s: any) => s.label)).toEqual(['⭐ Great!', '✍️ Neat work']);
    const seen = (await student.get(`/api/feedback/submission/${sub}`)).body;
    expect(seen).toMatchObject({ voiceId: clip.id, note: 'Lovely work!', teacher: 'Sample Teacher' });
    expect((await student.get(`/api/messages/audio/${clip.id}`)).status).toBe(200);
    expect((await parent.get(`/api/messages/audio/${clip.id}`)).status).toBe(200);
    const pr = await parent.get(`/api/feedback/student/${me}`);
    expect(pr.body[0]).toMatchObject({ kind: 'SUBMISSION', note: 'Lovely work!' });
    if (other) {
      expect([403, 404]).toContain((await other.get(`/api/feedback/submission/${sub}`)).status);
      expect((await other.get(`/api/messages/audio/${clip.id}`)).status).toBe(403);
    }
    expect(JSON.stringify((await student.get('/api/notifications')).body)).toContain('⭐ Great!');
    expect(JSON.stringify((await parent.get('/api/notifications')).body)).toContain('⭐ Great!');
  });

  it('a class goal counts the stars of the whole class and celebrates when reached', async () => {
    expect((await student.post('/api/classroom/goals').send({ classId: kg, reward: 'Party', target: 50 })).status).toBe(403);
    const g = await teacher.post('/api/classroom/goals').send({ classId: kg, reward: 'Class party', emoji: '🎉', target: 10 });
    expect(g.status).toBe(201); expect(g.body).toMatchObject({ status: 'ACTIVE', target: 10 });
    expect((await teacher.post('/api/classroom/goals').send({ classId: kg, reward: 'Again', target: 20 })).status).toBe(400);
    // stickers after the goal started count
    await teacher.put(`/api/feedback/submission/${sub}`).send({ stickers: ['GREAT', 'NEAT', 'CLEVER', 'SUPER_STAR', 'KIND'] });
    let mine = (await student.get('/api/classroom/my-goals')).body;
    expect(mine[0].stars).toBeGreaterThanOrEqual(5);
    // two traced pages with 3 stars each make it 11 ≥ 10
    const o = ownerPool();
    await o.query(`INSERT INTO page_work (publisher_id, school_id, student_id, page, kind, image, stars) SELECT publisher_id, school_id, id, 1, 'TRACE', 'data:image/png;base64,AA', 3 FROM users WHERE id = $1`, [me]);
    await o.query(`INSERT INTO page_work (publisher_id, school_id, student_id, page, kind, image, stars) SELECT publisher_id, school_id, id, 2, 'TRACE', 'data:image/png;base64,AA', 3 FROM users WHERE id = $1`, [me]);
    await o.end();
    mine = (await student.get('/api/classroom/my-goals')).body;
    expect(mine[0]).toMatchObject({ status: 'DONE', stars: 10 });
    expect(JSON.stringify((await parent.get('/api/notifications')).body)).toContain('Our class did it!');
    expect((await teacher.delete(`/api/classroom/goals/${g.body.id}`)).status).toBe(200);
  });

  it('plans the week from the book index, skipping holidays', async () => {
    const books = (await teacher.get('/api/teacher/books')).body; const book = books.find((b: any) => /English/.test(b.title ?? b.packageTitle ?? '')) ?? books[0];
    const editionId = book.editionId;
    // next week's Wednesday is a school holiday
    const next = new Date(); next.setUTCDate(next.getUTCDate() + ((8 - next.getUTCDay()) % 7 || 7)); const monday = next.toISOString().slice(0, 10);
    const wed = new Date(next.getTime() + 2 * 864e5).toISOString().slice(0, 10);
    await principal.post('/api/calendar').send({ title: 'Test holiday', kind: 'HOLIDAY', startsOn: wed, endsOn: wed });
    const p = await teacher.post('/api/teacher/plans/week/preview').send({ classId: kg, editionId, weekStart: monday, perDay: 1 });
    expect(p.status).toBe(200);
    expect(p.body.days).toHaveLength(5);
    const w = p.body.days.find((d: any) => d.date === wed);
    expect(w.holiday).toBe('Test holiday'); expect(w.lessons).toEqual([]);
    const items = p.body.days.flatMap((d: any) => d.lessons.map((l: any) => ({ date: d.date, lessonId: l.lessonId })));
    expect(items.length).toBeGreaterThan(0);
    const s = (await teacher.post('/api/teacher/plans/week').send({ classId: kg, editionId, weekStart: monday, items })).body;
    expect(s.created).toBe(items.length); cleanup.push(...s.plans.map((x: any) => x.id));
    // the next week continues after these lessons
    const after = (await teacher.post('/api/teacher/plans/week/preview').send({ classId: kg, editionId, weekStart: new Date(next.getTime() + 7 * 864e5).toISOString().slice(0, 10) })).body;
    const firstNext = after.days.find((d: any) => d.lessons.length)?.lessons[0]?.lessonId;
    if (firstNext) expect(items.map((i: any) => i.lessonId)).not.toContain(firstNext);
    const o = ownerPool(); await o.query(`DELETE FROM calendar_events WHERE title = 'Test holiday'`); await o.end();
  });

  it('parents get their child’s week; the Friday job sends it once', async () => {
    expect((await parent.get('/api/parent/week/children')).body.map((c: any) => c.id)).toContain(me);
    const w = (await parent.get(`/api/parent/week/${me}`)).body;
    expect(w.child.id).toBe(me);
    expect(w.numbers.homeworkDone).toBeGreaterThanOrEqual(1);
    expect(w.numbers.stickers).toBeGreaterThanOrEqual(1);
    expect(w.learned.join(' ')).toContain('Feedback check');
    if (other) expect((await other.get(`/api/parent/week/${me}`)).status).toBe(403);
    const { WeeklyDigestJob } = await import('../src/classroom/classroom.controller');
    const job = app.get(WeeklyDigestJob);
    expect(await job.send()).toBeGreaterThanOrEqual(1);
    expect(await job.send()).toBe(0);
    expect(JSON.stringify((await parent.get('/api/notifications')).body)).toContain('’s week'.replace('’', "'"));
    const o = ownerPool(); await o.query('DELETE FROM weekly_digests'); await o.end();
  });
});
