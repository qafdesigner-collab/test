import { createApp, login, ownerPool } from './helpers';

const JPEG = `data:image/jpeg;base64,${Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(400, 5)]).toString('base64')}`;
const WEBM = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(2000, 1)]);

describe('Competitions: the school admin runs them, students enter, students and teachers vote, results', () => {
  let app: any; let principal: any; let teacher: any; let s1: any; let s2: any; let parent: any; let kg: string; let id: string;
  beforeAll(async () => {
    app = await createApp();
    principal = await login(app, 'principal', 'School@12345', 'SUN01'); teacher = await login(app, 'teacher1', 'Teacher@12345', 'SUN01');
    s1 = await login(app, 'student1', 'Student@123', 'SUN01'); s2 = await login(app, 'student2', 'Student@123', 'SUN01'); parent = await login(app, 'parent1', 'Parent@123', 'SUN01');
    kg = (await teacher.get('/api/classes?mine=true')).body[0].id;
  });
  afterAll(async () => {
    const o = ownerPool();
    await o.query(`DELETE FROM competitions WHERE title LIKE 'Test %'`);
    await o.query(`DELETE FROM timeline_posts WHERE title LIKE '%Test singing%'`);
    await o.query(`DELETE FROM hall_of_fame WHERE title LIKE 'Winner: Test %'`);
    await o.end(); await app.close();
  });

  it('only the school admin starts a competition; students, parents and teachers see it', async () => {
    expect((await teacher.post('/api/competitions').send({ title: 'Test x', category: 'ART', entryKind: 'ANY' })).status).toBe(403);
    const c = await principal.post('/api/competitions').send({ title: 'Test singing', category: 'SINGING', emoji: '🎤', entryKind: 'AUDIO', description: 'Sing your favourite song!', classIds: [kg] });
    expect(c.status).toBe(201); id = c.body.id;
    for (const who of [s1, parent, teacher]) expect((await who.get('/api/competitions')).body.map((x: any) => x.id)).toContain(id);
    expect(JSON.stringify((await s1.get('/api/notifications')).body)).toContain('New competition: Test singing');
  });

  it('students enter (a voice recording here); the teacher sees who has entered', async () => {
    expect((await s1.post(`/api/competitions/${id}/entry`).send({ title: 'My song', description: 'no audio' })).status).toBe(400);
    const a1 = (await s1.post('/api/messages/audio').field('kind', 'ENTRY').field('durationMs', '5000').attach('file', WEBM, 'a.webm')).body;
    const a2 = (await s2.post('/api/messages/audio').field('kind', 'ENTRY').field('durationMs', '5000').attach('file', WEBM, 'b.webm')).body;
    expect((await teacher.post('/api/messages/audio').field('kind', 'ENTRY').attach('file', WEBM, 'c.webm')).status).toBe(403);
    expect((await s1.post(`/api/competitions/${id}/entry`).send({ title: 'Twinkle twinkle', audioId: a1.id })).status).toBe(201);
    expect((await s2.post(`/api/competitions/${id}/entry`).send({ title: 'Baby shark', audioId: a2.id })).status).toBe(201);
    expect((await s2.post(`/api/competitions/${id}/entry`).send({ title: 'Stolen', audioId: a1.id })).status).toBe(400);
    const d = (await teacher.get(`/api/competitions/${id}`)).body;
    expect(d.entries).toHaveLength(2);
    expect(d.roster.filter((r: any) => r.entered).length).toBe(2);
    expect(d.roster.some((r: any) => !r.entered)).toBe(true);
    // voting is not open yet
    expect((await s1.post(`/api/competitions/${id}/vote`).send({ entryId: d.entries[1].id })).status).toBe(403);
    // another student can listen to the entries
    expect((await s2.get(`/api/messages/audio/${a1.id}`)).status).toBe(200);
  });

  it('a photo competition takes a picture', async () => {
    const c = (await principal.post('/api/competitions').send({ title: 'Test art', category: 'ART', entryKind: 'PHOTO' })).body;
    const up = (await s1.post('/api/competitions/uploads').send({ image: JPEG })).body;
    expect((await s1.post(`/api/competitions/${c.id}/entry`).send({ title: 'My cat' })).status).toBe(400);
    expect((await s1.post(`/api/competitions/${c.id}/entry`).send({ title: 'My cat', imageKey: up.key })).status).toBe(201);
    const e = (await s2.get(`/api/competitions/${c.id}`)).body.entries[0];
    expect((await s2.get(e.image)).headers['content-type']).toBe('image/jpeg');
    await principal.delete(`/api/competitions/${c.id}`);
  });

  it('students and teachers vote once (never for themselves); the admin announces the results', async () => {
    expect((await principal.post(`/api/competitions/${id}/status`).send({ status: 'VOTING' })).body.status).toBe('VOTING');
    expect((await s1.post(`/api/competitions/${id}/entry`).send({ title: 'late', audioId: null })).status).toBe(400);
    const d = (await s1.get(`/api/competitions/${id}`)).body;
    expect(d.canVote).toBe(true); expect(d.entries.every((e: any) => e.votes === null)).toBe(true); // counts hidden from students
    const mine = d.entries.find((e: any) => e.mine); const theirs = d.entries.find((e: any) => !e.mine);
    expect((await s1.post(`/api/competitions/${id}/vote`).send({ entryId: mine.id })).status).toBe(400);
    expect((await s1.post(`/api/competitions/${id}/vote`).send({ entryId: theirs.id })).body.myVote).toBe(theirs.id);
    expect((await s2.post(`/api/competitions/${id}/vote`).send({ entryId: mine.id })).status).toBe(200);
    expect((await teacher.post(`/api/competitions/${id}/vote`).send({ entryId: mine.id })).status).toBe(200);
    expect((await teacher.post(`/api/competitions/${id}/vote`).send({ entryId: mine.id })).status).toBe(200); // changing / repeating keeps one vote
    expect((await parent.post(`/api/competitions/${id}/vote`).send({ entryId: mine.id })).status).toBe(403);
    const t = (await teacher.get(`/api/competitions/${id}`)).body;
    expect(t.entries.find((e: any) => e.id === mine.id).votes).toBe(2);
    expect((await teacher.post(`/api/competitions/${id}/results`).send({ places: [{ entryId: mine.id, place: 1 }] })).status).toBe(403);
    const r = await principal.post(`/api/competitions/${id}/results`).send({ places: [{ entryId: mine.id, place: 1 }, { entryId: theirs.id, place: 2 }], note: 'Wonderful voices!', toTimeline: true, toFame: true });
    expect(r.status).toBe(200);
    const done = (await parent.get(`/api/competitions/${id}`)).body;
    expect(done.status).toBe('RESULTS'); expect(done.entries[0]).toMatchObject({ place: 1, votes: 2 });
    expect(JSON.stringify((await parent.get('/api/notifications')).body)).toContain('Results: Test singing');
    expect((await s2.get('/api/timeline')).body.items.some((p: any) => p.title.includes('Test singing'))).toBe(true);
    expect((await s2.get('/api/fame')).body.students.some((f: any) => f.title === 'Winner: Test singing')).toBe(true);
    expect((await s1.post(`/api/competitions/${id}/vote`).send({ entryId: theirs.id })).status).toBe(403);
  });
});
