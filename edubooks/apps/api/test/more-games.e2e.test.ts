import { createApp, login, ownerPool } from './helpers';

describe('More games, starter pack, 3D avatars, new-post count, sample news', () => {
  let app: any; let editor: any; let admin: any; let teacher: any; let student: any; let parent: any;
  const games: string[] = []; const posts: string[] = []; let staffId = '';
  beforeAll(async () => {
    app = await createApp(); editor = await login(app, 'editor', 'Admin@12345'); admin = await login(app, 'admin', 'Admin@12345');
    teacher = await login(app, 'teacher1', 'Teacher@12345', 'SUN01'); student = await login(app, 'student1', 'Student@123', 'SUN01'); parent = await login(app, 'parent1', 'Parent@123', 'SUN01');
  });
  afterAll(async () => {
    const o = ownerPool();
    await o.query(`DELETE FROM game_activities WHERE id = ANY($1::uuid[])`, [games]);
    await o.query(`DELETE FROM timeline_posts WHERE id = ANY($1::uuid[])`, [posts]);
    await o.query(`UPDATE users SET avatar = NULL, photo_at = NULL, photo_key = NULL WHERE username IN ('teacher1', 'student1')`);
    if (staffId) {
      const gone = `(SELECT id FROM schools WHERE demo_owner_id = $1)`;
      for (const t of ['access_entitlements', 'license_assignments', 'license_seats', 'license_transfers', 'license_pools', 'license_adjustments']) await o.query(`DELETE FROM ${t} WHERE school_id IN ${gone}`, [staffId]);
      await o.query(`DELETE FROM schools WHERE demo_owner_id = $1`, [staffId]);
      await o.query(`DELETE FROM audit_logs WHERE actor_user_id = $1`, [staffId]); await o.query(`DELETE FROM users WHERE id = $1`, [staffId]);
    }
    await o.end(); await app.close();
  });

  it('accepts the three new game types and checks their content', async () => {
    const qs = [{ prompt: '1 + 1', options: ['2', '3'], answer: 0 }];
    const pk = await editor.post('/api/publishing/games').send({ engine: 'PENALTY_KICK', title: 'Kick', content: { questions: qs } });
    expect(pk.status).toBe(201); games.push(pk.body.id);
    const race = await editor.post('/api/publishing/games').send({ engine: 'RUNNING_RACE', title: 'Race', content: { questions: qs, seconds: 99, rival: '🐢' } });
    expect(race.body.content).toMatchObject({ seconds: 30, rival: '🐢' }); games.push(race.body.id);
    const mole = await editor.post('/api/publishing/games').send({ engine: 'WHACK_A_MOLE', title: 'Mole', content: { task: 'Bonk A', targets: ['A'], others: ['B'], goal: 5, seconds: 40 } });
    expect(mole.body.content).toMatchObject({ targets: ['A'], goal: 5 }); games.push(mole.body.id);
    expect((await editor.post('/api/publishing/games').send({ engine: 'WHACK_A_MOLE', title: 'Bad', content: { targets: [] } })).status).toBe(400);
    expect((await editor.post('/api/publishing/games').send({ engine: 'PENALTY_KICK', title: 'Bad', content: { questions: [] } })).status).toBe(400);
  });

  it('adds the ready-made games once; they reach every school in their collections', async () => {
    expect((await teacher.post('/api/publishing/games/starter-pack')).status).toBe(403);
    const r = (await admin.post('/api/publishing/games/starter-pack')).body;
    expect(r.added).toBeGreaterThanOrEqual(15);
    const lib = (await admin.get('/api/publishing/games?category=SPORTS')).body;
    games.push(...(await admin.get('/api/publishing/games')).body.filter((g: any) => g.categories?.length && !games.includes(g.id)).map((g: any) => g.id));
    expect(lib.map((g: any) => g.engine)).toEqual(expect.arrayContaining(['PENALTY_KICK', 'RUNNING_RACE', 'WHACK_A_MOLE']));
    expect((await admin.post('/api/publishing/games/starter-pack')).body.added).toBe(0);
    const mine = (await student.get('/api/student/games')).body.map((g: any) => g.title);
    expect(mine).toEqual(expect.arrayContaining(['Penalty Kick: Add it up', 'Whack-a-Mole: Vowels']));
  });

  it('everyone can choose a 3D avatar instead of a photo; it shows on posts', async () => {
    expect((await student.post('/api/me/avatar').send({ avatar: 'not-a-picture' })).status).toBe(400);
    expect((await student.post('/api/me/avatar').send({ avatar: 'panda' })).body.photoUrl).toBe('/avatars/panda.webp');
    expect((await student.get('/api/auth/me')).body.photoUrl).toBe('/avatars/panda.webp');
    expect((await parent.post('/api/me/avatar').send({ avatar: 'owl' })).status).toBe(200);
    expect((await parent.post('/api/me/avatar').send({ avatar: null })).body.photoUrl).toBeNull();
    await teacher.post('/api/me/avatar').send({ avatar: 'teacher-woman' });
    const p = await teacher.post('/api/timeline').send({ body: 'Avatar check' }); posts.push(p.body.id);
    expect((await student.get('/api/timeline')).body.items.find((x: any) => x.id === p.body.id).authorPhoto).toBe('/avatars/teacher-woman.webp');
  });

  it('the welcome window says how many new posts there are, until the timeline is opened', async () => {
    const kg = (await teacher.get('/api/classes?mine=true')).body[0].id;
    await parent.get('/api/timeline'); // seen everything so far
    for (const b of ['New post one', 'New post two']) posts.push((await teacher.post('/api/timeline').send({ classId: kg, body: b })).body.id);
    expect((await parent.get('/api/me/welcome')).body.todo).toEqual(expect.arrayContaining([{ key: 'posts', n: 2, link: '/parent/timeline' }]));
    await parent.get('/api/timeline');
    expect((await parent.get('/api/me/welcome')).body.todo.find((x: any) => x.key === 'posts')).toBeUndefined();
    // the writer does not count their own posts
    expect((await teacher.get('/api/me/welcome')).body.todo.find((x: any) => x.key === 'posts')).toBeUndefined();
  });

  it('a sales person’s new demo school comes with sample news and pictures', async () => {
    const add = (await admin.post('/api/admin/team').send({ displayName: 'Demo Seller', username: `seller${Date.now() % 1e6}`, role: 'PUBLISHER_SALES' })).body;
    staffId = add.id;
    const sales = await login(app, add.username, add.password);
    const d = (await sales.post('/api/sales/my-demo')).body;
    expect(d.posts).toBe(6);
    expect((await sales.post('/api/sales/my-demo/sample-posts')).status).toBe(409);
    const st = d.logins.find((l: any) => l.role === 'STUDENT');
    const kid = await login(app, st.username, st.password, d.school.code);
    const feed = (await kid.get('/api/timeline')).body.items;
    expect(feed[0]).toMatchObject({ kind: 'EVENT', title: 'Sports Day', pinned: true });
    const pic = await kid.get(feed[0].images[0]);
    expect(pic.status).toBe(200); expect(pic.headers['content-type']).toContain('image/svg+xml');
    expect(pic.headers['content-security-policy']).toContain("default-src 'none'");
  });
});
