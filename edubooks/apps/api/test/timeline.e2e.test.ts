import { createApp, login, ownerPool } from './helpers';

const JPEG = `data:image/jpeg;base64,${Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(400, 9)]).toString('base64')}`;

describe('School timeline, and game collections', () => {
  let app: any; let teacher: any; let principal: any; let student: any; let parent: any; let editor: any;
  let kg: string; let other: string; const made: string[] = []; let gameId: string;
  beforeAll(async () => {
    app = await createApp();
    teacher = await login(app, 'teacher1', 'Teacher@12345', 'SUN01'); principal = await login(app, 'principal', 'School@12345', 'SUN01');
    student = await login(app, 'student1', 'Student@123', 'SUN01'); parent = await login(app, 'parent1', 'Parent@123', 'SUN01');
    editor = await login(app, 'editor', 'Admin@12345');
    kg = (await teacher.get('/api/classes?mine=true')).body[0].id;
    const o = ownerPool();
    const { rows: [c] } = await o.query(`INSERT INTO classes (publisher_id, school_id, academic_year_id, name, section)
      SELECT publisher_id, school_id, academic_year_id, 'Timeline other', 'Z' FROM classes WHERE id = $1 RETURNING id`, [kg]);
    other = c.id; await o.end();
  });
  afterAll(async () => {
    const o = ownerPool();
    await o.query(`DELETE FROM timeline_posts WHERE id = ANY($1::uuid[])`, [made]);
    await o.query(`DELETE FROM classes WHERE id = $1`, [other]);
    if (gameId) await o.query(`DELETE FROM game_activities WHERE id = $1`, [gameId]);
    await o.end(); await app.close();
  });

  it('teachers post to their class, with photos; students and parents of that class see it', async () => {
    const up = await teacher.post('/api/timeline/uploads').send({ image: JPEG });
    expect(up.status).toBe(200);
    expect((await student.post('/api/timeline/uploads').send({ image: JPEG })).status).toBe(403);
    const p = await teacher.post('/api/timeline').send({ classId: kg, body: 'We planted seeds today 🌱', images: [up.body.key] });
    expect(p.status).toBe(201); made.push(p.body.id);
    // a picture someone else uploaded cannot be attached
    expect((await principal.post('/api/timeline').send({ body: 'x', images: [up.body.key] })).status).toBe(400);
    // a teacher cannot post to a class they do not teach
    expect((await teacher.post('/api/timeline').send({ classId: other, body: 'nope' })).status).toBe(403);
    expect((await teacher.post('/api/timeline').send({})).status).toBe(400);
    for (const who of [student, parent]) {
      const feed = (await who.get('/api/timeline')).body;
      const post = feed.items.find((x: any) => x.id === p.body.id);
      expect(post).toMatchObject({ body: 'We planted seeds today 🌱', className: expect.stringContaining('KG'), authorName: expect.any(String), canEdit: false });
      expect((await who.get(post.images[0])).headers['content-type']).toBe('image/jpeg');
    }
    expect(JSON.stringify((await student.get('/api/notifications')).body)).toContain('We planted seeds today');
    expect(JSON.stringify((await parent.get('/api/notifications')).body)).toContain('We planted seeds today');
  });

  it('the school admin posts events for everyone and posts for other classes; pins; reactions', async () => {
    const ev = await principal.post('/api/timeline').send({ kind: 'EVENT', title: 'Sports Day', body: 'Wear white!', place: 'Playground', eventAt: new Date(Date.now() + 5 * 864e5).toISOString(), pinned: true });
    expect(ev.status).toBe(201); made.push(ev.body.id);
    expect((await principal.post('/api/timeline').send({ kind: 'EVENT', title: 'No date' })).status).toBe(400);
    const hidden = await principal.post('/api/timeline').send({ classId: other, body: 'Only for class Z' });
    made.push(hidden.body.id);
    const feed = (await student.get('/api/timeline')).body.items;
    expect(feed[0]).toMatchObject({ id: ev.body.id, pinned: true, kind: 'EVENT', place: 'Playground' });
    expect(feed.find((x: any) => x.id === hidden.body.id)).toBeUndefined();
    expect((await student.get(`/api/timeline/${hidden.body.id}/images/0`)).status).toBe(404);
    expect((await student.post(`/api/timeline/${hidden.body.id}/react`).send({})).status).toBe(404);
    expect((await parent.get('/api/timeline/events')).body.map((e: any) => e.title)).toContain('Sports Day');
    expect(JSON.stringify((await teacher.get('/api/notifications')).body)).toContain('Sports Day');
    // reactions
    expect((await student.post(`/api/timeline/${ev.body.id}/react`).send({ emoji: '🎉' })).body).toMatchObject({ reactions: { '🎉': 1 }, myReaction: '🎉' });
    expect((await parent.post(`/api/timeline/${ev.body.id}/react`).send({})).body.reactions).toEqual({ '🎉': 1, '❤️': 1 });
    expect((await student.post(`/api/timeline/${ev.body.id}/react`).send({ emoji: '🎉' })).body.myReaction).toBeNull();
    // only the writer or the school admin may change a post; only the admin pins
    expect((await teacher.patch(`/api/timeline/${ev.body.id}`).send({ body: 'hacked' })).status).toBe(403);
    expect((await teacher.patch(`/api/timeline/${made[0]}`).send({ pinned: true })).status).toBe(403);
    expect((await teacher.patch(`/api/timeline/${made[0]}`).send({ body: 'We planted seeds 🌱🌱' })).status).toBe(200);
    expect((await student.delete(`/api/timeline/${made[0]}`)).status).toBe(403);
    expect((await principal.delete(`/api/timeline/${hidden.body.id}`)).status).toBe(200);
  });

  it('parents can use their photo and the welcome window', async () => {
    expect((await parent.get('/api/me/welcome')).status).toBe(200);
    expect((await parent.post('/api/me/photo').send({ image: JPEG })).status).toBe(200);
    const me = (await parent.get('/api/auth/me')).body;
    expect((await parent.get(me.photoUrl)).status).toBe(200);
    expect((await parent.delete('/api/me/photo')).status).toBe(200);
  });

  it('a library game saved again with its type still works, and games in a collection reach every school', async () => {
    const base = { engine: 'SHAPES', title: 'Kick the shapes', content: { shapes: ['circle', 'square'], rounds: 3 } };
    expect((await editor.post('/api/publishing/games').send({ ...base, categories: ['NOPE'] })).status).toBe(400);
    const g = (await editor.post('/api/publishing/games').send({ ...base, categories: ['SPORTS', 'SPORTS'] })).body;
    gameId = g.id;
    expect(g.categories).toEqual(['SPORTS']);
    // the page sends the whole game back, including its type: this used to fail with "property engine should not exist"
    const saved = await editor.patch(`/api/publishing/games/${g.id}`).send({ engine: 'SHAPES', title: 'Kick the shapes!', categories: ['SPORTS', 'GENERAL'], published: true, content: g.content });
    expect(saved.status).toBe(200); expect(saved.body).toMatchObject({ engine: 'SHAPES', categories: ['SPORTS', 'GENERAL'] });
    expect((await editor.get('/api/publishing/games?category=SPORTS')).body.map((x: any) => x.id)).toContain(g.id);
    // no book, but in a collection: teachers and students of every school see it
    expect((await teacher.get('/api/teacher/games')).body.find((x: any) => x.id === g.id)).toMatchObject({ categories: ['SPORTS', 'GENERAL'] });
    expect((await student.get('/api/student/games')).body.map((x: any) => x.id)).toContain(g.id);
    expect((await student.get(`/api/student/games/${g.id}`)).status).toBe(200);
    // out of every collection and with no book: no longer offered
    await editor.patch(`/api/publishing/games/${g.id}`).send({ categories: [] });
    expect((await student.get('/api/student/games')).body.map((x: any) => x.id)).not.toContain(g.id);
  });
});
