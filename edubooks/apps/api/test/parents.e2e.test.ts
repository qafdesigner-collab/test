import { INestApplication } from '@nestjs/common';
import { createApp, login } from './helpers';

describe('Parent portal', () => {
  let app: INestApplication; let principal: any; let teacher: any; let kid1: string; let kid3: string; let parent: any; let creds: any;
  beforeAll(async () => {
    app = await createApp();
    principal = await login(app, 'principal', 'School@12345', 'SUN01');
    teacher = await login(app, 'teacher1', 'Teacher@12345', 'SUN01');
    const kids = (await principal.get('/api/school/users?role=STUDENT')).body.items;
    kid1 = kids.find((k: any) => k.username === 'student1').id; kid3 = kids.find((k: any) => k.username === 'student3').id;
  });
  afterAll(async () => { await app.close(); });

  it('school admin creates a parent for a child and links the same parent to a sibling', async () => {
    const r = await principal.post(`/api/school/students/${kid1}/parents`).send({ displayName: 'Ayesha Khan', phone: '0300 1112223', relation: 'Mother' });
    expect(r.status).toBe(201);
    creds = r.body.credentials;
    expect(creds).toMatchObject({ displayName: 'Ayesha Khan' });
    expect((await principal.post(`/api/school/students/${kid3}/parents`).send({ parentId: r.body.parentId, relation: 'Mother' })).status).toBe(201);
    const list = (await principal.get('/api/school/parents')).body;
    expect(list.find((p: any) => p.id === r.body.parentId).children).toHaveLength(2);
    expect((await teacher.post(`/api/school/students/${kid1}/parents`).send({ displayName: 'x' })).status).toBe(403);
    const other = await login(app, 'principal', 'School@12345', 'GVS02');
    expect((await other.post(`/api/school/students/${kid1}/parents`).send({ displayName: 'x' })).status).toBe(404); // not their student
  });

  it('a parent sees only their own children, with marked results but never unmarked scores', async () => {
    parent = await login(app, creds.username, creds.password, 'SUN01');
    expect((await parent.get('/api/auth/me')).body.roles).toEqual(['PARENT']);
    const c = (await parent.get('/api/parent/children')).body;
    expect(c.children.map((k: any) => k.id).sort()).toEqual([kid1, kid3].sort());
    const sr = await parent.get(`/api/parent/children/${kid1}`); if (sr.status !== 200) console.log('SUMMARY', sr.status, JSON.stringify(sr.body)); const summary = sr.body;
    expect(summary.student.id).toBe(kid1);
    expect(Array.isArray(summary.work)).toBe(true);
    expect(summary.work.every((w: any) => ['GRADED', 'RETURNED'].includes(w.status) || w.score === null)).toBe(true);
    const kids = (await principal.get('/api/school/users?role=STUDENT')).body.items;
    const notMine = kids.find((k: any) => ![kid1, kid3].includes(k.id)).id;
    expect((await parent.get(`/api/parent/children/${notMine}`)).status).toBe(403);
  });

  it('parent accounts are default-deny outside their portal', async () => {
    for (const p of ['/api/student/home', '/api/library', '/api/teacher/assessments', '/api/school/users', '/api/classes', '/api/reader/editions/00000000-0000-0000-0000-000000000000',
      '/api/catalog/grades', '/api/student/report', '/api/ai/status'])
      expect([p, (await parent.get(p)).status]).toEqual([p, 403]);
    expect((await parent.get('/api/calendar?from=2026-01-01&to=2027-12-31')).status).toBe(200);
    expect((await parent.get('/api/notifications/count')).status).toBe(200);
    expect((await parent.post('/api/calendar').send({ title: 'x', kind: 'EVENT', startsOn: '2026-12-01', endsOn: '2026-12-01' })).status).toBe(403);
  });

  it('parents are told about new homework and results (in the app and by phone)', async () => {
    const classId = (await principal.get('/api/classes')).body[0].id;
    const a = (await teacher.post('/api/teacher/assessments').send({ classId, kind: 'HOMEWORK', title: 'Parents see this', items: [{ type: 'TRUE_FALSE', prompt: 'ok', answer: [true] }] })).body;
    await teacher.post(`/api/teacher/assessments/${a.id}/publish`);
    const n = (await parent.get('/api/notifications')).body;
    expect(n.some((x: any) => x.title === 'New homework: Parents see this' && x.link === '/parent')).toBe(true);
    const out = (await principal.get('/api/notifications/outbox')).body;
    expect(out.some((m: any) => m.toAddress === '0300 1112223' && m.kind === 'HOMEWORK')).toBe(true);
  });

  it('unlinking removes access', async () => {
    expect((await principal.delete(`/api/school/students/${kid3}/parents/${(await principal.get(`/api/school/students/${kid3}/parents`)).body[0].id}`)).status).toBe(200);
    expect((await parent.get(`/api/parent/children/${kid3}`)).status).toBe(403);
  });
});
