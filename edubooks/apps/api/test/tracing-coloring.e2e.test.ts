import { createApp, login, ownerPool } from './helpers';

const PNG = 'data:image/png;base64,' + Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082', 'hex').toString('base64');

describe('Handwriting tracing and colouring activities', () => {
  let app: any; let teacher: any; let kid: any; let admin: any; let classId: string; const made: string[] = [];
  beforeAll(async () => {
    app = await createApp(); teacher = await login(app, 'teacher1', 'Teacher@12345', 'SUN01'); kid = await login(app, 'student1', 'Student@123', 'SUN01'); admin = await login(app, 'admin', 'Admin@12345');
    classId = (await teacher.get('/api/classes?mine=true')).body[0].id;
  });
  afterAll(async () => { const o = ownerPool(); if (made.length) await o.query(`DELETE FROM game_activities WHERE id = ANY($1::uuid[])`, [made]); await o.end(); await app.close(); });

  it('a teacher makes a tracing activity (English and Arabic), sets it for the class, and the child earns stars', async () => {
    expect((await teacher.post('/api/teacher/games').send({ engine: 'TRACING', title: 'Bad', content: { items: [] } })).status).toBe(400);
    const g = (await teacher.post('/api/teacher/games').send({ engine: 'TRACING', title: 'Letters A and ب', content: { items: ['A', 'a', 'ب'], repeats: 9, guide: 'DOTTED', font: 'CURSIVE' } })).body;
    made.push(g.id);
    expect(g.content).toEqual({ items: ['A', 'a', 'ب'], repeats: 4, guide: 'DOTTED', lines: true, font: 'CURSIVE' });
    expect((await teacher.post(`/api/teacher/games/${g.id}/assign`).send({ classId })).status).toBe(201);
    expect((await kid.get('/api/student/games')).body.some((x: any) => x.id === g.id)).toBe(true);
    const r = (await kid.post(`/api/student/games/${g.id}/attempts`).send({ score: 3, durationMs: 60000 })).body;
    expect(r.stars).toBe(3);
  });

  it('a colouring picture is checked (a real picture, not too big)', async () => {
    expect((await teacher.post('/api/teacher/games').send({ engine: 'COLORING', title: 'x', content: { image: 'https://example.com/a.png' } })).status).toBe(400);
    expect((await teacher.post('/api/teacher/games').send({ engine: 'COLORING', title: 'x', content: { image: 'data:image/png;base64,' + 'A'.repeat(1_400_000) } })).status).toBeGreaterThanOrEqual(400);
    const g = (await teacher.post('/api/teacher/games').send({ engine: 'COLORING', title: 'Colour the apple', content: { image: PNG, task: 'Colour the apple red' } })).body;
    made.push(g.id); expect(g.content.task).toBe('Colour the apple red');
  });

  it('a tracing area can be placed on a book page', async () => {
    const ed = (await teacher.get('/api/teacher/books')).body.find((b: any) => b.title === 'KG English').editionId;
    const part = (await admin.get(`/api/publishing/editions/${ed}`)).body.components.find((c: any) => c.title === 'Student Book Part 1');
    const h = await admin.post(`/api/reader/components/${part.id}/hotspots`).send({ page: 2, x: 0.1, y: 0.5, w: 0.8, h: 0.2, kind: 'TRACE', body: '' });
    expect(h.status).toBe(201);
    expect((await kid.get(`/api/reader/components/${part.id}/hotspots`)).body.find((x: any) => x.id === h.body.id)).toMatchObject({ kind: 'TRACE' });
    await admin.delete(`/api/reader/hotspots/${h.body.id}`);
  });
});
