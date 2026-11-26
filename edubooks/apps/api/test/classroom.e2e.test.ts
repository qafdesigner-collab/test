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

  it('teachers and the school admin add rewards to the school list; the admin can start goals for any class', async () => {
    expect((await student.post('/api/classroom/rewards').send({ title: 'Free sweets' })).status).toBe(403);
    const r1 = await principal.post('/api/classroom/rewards').send({ emoji: '🍦', title: 'Ice-cream Friday' });
    expect(r1.status).toBe(201);
    const r2 = await teacher.post('/api/classroom/rewards').send({ emoji: '🌳', title: 'Lesson in the garden' });
    expect(r2.status).toBe(201);
    expect((await teacher.post('/api/classroom/rewards').send({ title: 'ice-cream friday' })).status).toBe(400);
    const list = (await teacher.get('/api/classroom/rewards')).body;
    expect(list.map((r: any) => r.title)).toEqual(expect.arrayContaining(['Ice-cream Friday', 'Lesson in the garden']));
    expect(list.find((r: any) => r.title === 'Ice-cream Friday').canDelete).toBe(false);
    expect((await teacher.delete(`/api/classroom/rewards/${r1.body.id}`)).status).toBe(403);
    const g = await principal.post('/api/classroom/goals').send({ classId: kg, reward: 'Ice-cream Friday', emoji: '🍦', target: 40 });
    expect(g.status).toBe(201); expect(g.body).toMatchObject({ reward: 'Ice-cream Friday', emoji: '🍦' });
    expect((await teacher.get('/api/classroom/goals')).body.find((x: any) => x.id === g.body.id)).toBeTruthy();
    expect((await principal.delete(`/api/classroom/goals/${g.body.id}`)).status).toBe(200);
    expect((await teacher.delete(`/api/classroom/rewards/${r2.body.id}`)).status).toBe(200);
    expect((await principal.delete(`/api/classroom/rewards/${r1.body.id}`)).status).toBe(200);
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

  it('a teacher makes a weekly plan by hand: book → part → lesson / pages → resources, per day', async () => {
    const books = (await teacher.get('/api/teacher/books')).body; const ed = books[0].editionId;
    const book = (await teacher.get(`/api/reader/editions/${ed}`)).body;
    const part = book.components.find((c: any) => c.units.some((u: any) => u.lessons.length)) ?? book.components[0];
    const lesson = part.units.flatMap((u: any) => u.lessons)[0];
    const res = book.resources.find((r: any) => !r.componentId || r.componentId === part.id);
    const other = book.components.find((c: any) => c.id !== part.id);
    const body = { classId: kg, weekStart: '2026-12-09', title: 'Week of 7 December', notes: 'Bring crayons on Tuesday',
      entries: [
        { day: 1, editionId: ed, componentId: part.id, lessonId: lesson?.id, pageFrom: 2, pageTo: 4, resourceIds: res ? [res.id] : [], activity: 'Read together, then trace the letters' },
        { day: 2, editionId: ed, componentId: other?.id ?? part.id, pageFrom: 5, homework: 'Colour page 5' },
        { day: 3, title: 'Library visit', activity: 'Choose a book to take home' },
      ] };
    expect((await teacher.post('/api/teacher/weekly-plans').send({ ...body, entries: [{ day: 1 }] })).status).toBe(400);
    expect((await teacher.post('/api/teacher/weekly-plans').send({ ...body, entries: [{ day: 1, editionId: ed, componentId: part.id, pageFrom: 5, pageTo: 2 }] })).status).toBe(400);
    const w = await teacher.post('/api/teacher/weekly-plans').send(body);
    expect(w.status).toBe(201);
    expect(w.body.weekStart).toBe('2026-12-07'); // always the Monday
    expect(w.body.entries[0]).toMatchObject({ day: 1, part: part.title, pageFrom: 2, pageTo: 4 });
    if (lesson) expect(w.body.entries[0].lesson).toContain(lesson.title);
    expect(w.body.entries[2]).toMatchObject({ title: 'Library visit', editionId: null });
    expect((await teacher.get('/api/teacher/weekly-plans')).body[0]).toMatchObject({ id: w.body.id, entries: 3 });
    const up = await teacher.put(`/api/teacher/weekly-plans/${w.body.id}`).send({ ...body, entries: body.entries.slice(0, 2) });
    expect(up.body.entries).toHaveLength(2);
    expect((await student.get(`/api/teacher/weekly-plans/${w.body.id}`)).status).toBe(403);
    expect((await teacher.delete(`/api/teacher/weekly-plans/${w.body.id}`)).status).toBe(200);
  });

  it('a day’s lesson plan goes on that day of the weekly plan (and moves with it)', async () => {
    const books = (await teacher.get('/api/teacher/books')).body; const ed = books[0].editionId;
    const book = (await teacher.get(`/api/reader/editions/${ed}`)).body;
    const lesson = book.components.flatMap((c: any) => c.units.flatMap((u: any) => u.lessons))[0];
    const p = await teacher.post('/api/teacher/lesson-plans').send({ title: 'Letters A and B', classId: kg, editionId: ed, lessonId: lesson?.id ?? null, planDate: '2027-01-13T08:00:00Z', content: { objectives: 'Say A and B' } });
    expect(p.status).toBe(201); expect(p.body.weeklyPlanId).toBeTruthy();
    let w = (await teacher.get(`/api/teacher/weekly-plans/${p.body.weeklyPlanId}`)).body;
    expect(w.weekStart).toBe('2027-01-11');
    expect(w.entries).toEqual([expect.objectContaining({ day: 3, planId: p.body.id, editionId: ed })]);
    // moved to Friday: it moves on the weekly plan too (not added twice)
    await teacher.put(`/api/teacher/lesson-plans/${p.body.id}`).send({ title: 'Letters A and B', classId: kg, editionId: ed, lessonId: lesson?.id ?? null, planDate: '2027-01-15T08:00:00Z' });
    w = (await teacher.get(`/api/teacher/weekly-plans/${p.body.weeklyPlanId}`)).body;
    expect(w.entries.map((e: any) => e.day)).toEqual([5]);
    // a plan without “add to week” stays out of it; deleting the plan takes it off the week
    const q = await teacher.post('/api/teacher/lesson-plans').send({ title: 'Not on the week', classId: kg, planDate: '2027-01-12T08:00:00Z', addToWeek: false });
    expect(q.body.weeklyPlanId).toBeNull();
    await teacher.delete(`/api/teacher/lesson-plans/${p.body.id}`);
    expect((await teacher.get(`/api/teacher/weekly-plans/${w.id}`)).body.entries).toEqual([]);
    await teacher.delete(`/api/teacher/lesson-plans/${q.body.id}`); await teacher.delete(`/api/teacher/weekly-plans/${w.id}`);
  });

  it('the Hall of Fame: the school admin adds students and leaders and decides who sees it', async () => {
    expect((await teacher.post('/api/fame').send({ kind: 'STUDENT', name: 'X Y' })).status).toBe(403);
    const kid = (await principal.get('/api/fame/people?role=STUDENT&q=Sample Student 1')).body[0];
    // choose the class and section first, then a student of that section
    const fc = (await principal.get('/api/fame/classes')).body;
    expect(fc.find((c: any) => c.id === kg)).toMatchObject({ id: kg });
    const inKg = (await principal.get(`/api/fame/people?role=STUDENT&classId=${kg}`)).body.map((x: any) => x.id);
    expect(inKg).toContain(kid.id);
    expect((await principal.get(`/api/fame/people?role=STUDENT&classId=00000000-0000-4000-8000-000000000000`)).body).toEqual([]);
    expect((await principal.get('/api/fame/people?role=STUDENT&classId=nope')).status).toBe(400);
    expect((await teacher.get('/api/fame/classes')).status).toBe(403);
    const a = await principal.post('/api/fame').send({ kind: 'STUDENT', userId: kid.id, name: kid.name, title: 'Reading Champion', achievement: 'Read 40 books this term', year: '2026' });
    const b = await principal.post('/api/fame').send({ kind: 'LEADER', name: 'Mrs. Aisha Khan', title: 'Principal', achievement: 'Leading our school with heart', avatar: 'teacher-woman' });
    expect(a.status).toBe(201); expect(b.status).toBe(201);
    for (const who of [teacher, student, parent]) {
      const f = (await who.get('/api/fame')).body;
      expect(f.visible).toBe(true); expect(f.settings).toBeUndefined();
      expect(f.students.map((x: any) => x.title)).toContain('Reading Champion');
      expect(f.leaders.find((x: any) => x.id === b.body.id)).toMatchObject({ title: 'Principal', picture: '/avatars/teacher-woman.webp' });
    }
    // show it to parents only
    expect((await principal.put('/api/fame/settings').send({ enabled: true, teachers: false, students: false, parents: true })).body).toMatchObject({ parents: true, students: false });
    expect((await student.get('/api/fame')).body).toEqual({ visible: false, admin: false });
    expect((await teacher.get('/api/fame/shown')).body.shown).toBe(false);
    expect((await parent.get('/api/fame')).body.visible).toBe(true);
    // switched off: only the admin still sees it
    await principal.put('/api/fame/settings').send({ enabled: false, teachers: true, students: true, parents: true });
    expect((await parent.get('/api/fame')).body.visible).toBe(false);
    expect((await principal.get('/api/fame')).body).toMatchObject({ visible: true, admin: true, settings: { enabled: false } });
    expect((await teacher.put('/api/fame/settings').send({ enabled: true, teachers: true, students: true, parents: true })).status).toBe(403);
    await principal.put('/api/fame/settings').send({ enabled: true, teachers: true, students: true, parents: true });
    await principal.delete(`/api/fame/${a.body.id}`); await principal.delete(`/api/fame/${b.body.id}`);
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
