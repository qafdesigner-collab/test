import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createApp, login, ownerPool } from './helpers';

type Agent = Awaited<ReturnType<typeof login>>;

describe('Phase 7 — security hardening', () => {
  let app: INestApplication; const owner = ownerPool();
  beforeAll(async () => { app = await createApp(); });
  afterAll(async () => { await owner.end(); await app.close(); });
  const http = () => request(app.getHttpServer());

  it('locks an account after 5 wrong passwords (even the right one is refused) until an admin resets it', async () => {
    for (let i = 0; i < 4; i++) expect((await http().post('/api/auth/login').send({ schoolCode: 'GVS02', username: 'student2', password: 'nope' })).status).toBe(401);
    const fifth = await http().post('/api/auth/login').send({ schoolCode: 'GVS02', username: 'student2', password: 'nope' });
    expect(fifth.status).toBe(429);
    expect(fifth.body.message).toMatch(/locked/);
    expect((await http().post('/api/auth/login').send({ schoolCode: 'GVS02', username: 'student2', password: 'Student@123' })).status).toBe(429);
    const principal = await login(app, 'principal', 'School@12345', 'GVS02');
    const sid = (await principal.get('/api/school/users?role=STUDENT')).body.items.find((u: any) => u.username === 'student2').id;
    const { password } = (await principal.post(`/api/school/users/${sid}/reset-password`)).body;
    expect((await http().post('/api/auth/login').send({ schoolCode: 'GVS02', username: 'student2', password })).status).toBe(200);
  });

  it('a successful login resets the failure counter', async () => {
    for (let i = 0; i < 3; i++) await http().post('/api/auth/login').send({ schoolCode: 'GVS02', username: 'student3', password: 'x' });
    await login(app, 'student3', 'Student@123', 'GVS02');
    const { rows } = await owner.query(`SELECT failed_logins FROM users u JOIN schools s ON s.id = u.school_id WHERE s.code = 'GVS02' AND username = 'student3'`);
    expect(rows[0].failed_logins).toBe(0);
  });

  it('sessions expire after inactivity', async () => {
    const a = await login(app, 'teacher1', 'Teacher@12345', 'GVS02');
    expect((await a.get('/api/auth/me')).status).toBe(200);
    await owner.query(`UPDATE sessions SET last_seen_at = now() - interval '13 hours' WHERE user_id = (SELECT u.id FROM users u JOIN schools s ON s.id = u.school_id WHERE s.code='GVS02' AND username='teacher1')`);
    expect((await a.get('/api/auth/me')).status).toBe(401);
  });

  it('sends security headers, rejects oversized bodies, and exposes health checks', async () => {
    const h = await http().get('/api/health');
    expect(h.body.status).toBe('ok');
    expect(h.headers).toMatchObject({ 'x-content-type-options': 'nosniff', 'x-frame-options': 'DENY', 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' });
    expect(h.headers['x-powered-by']).toBeUndefined();
    const ready = await http().get('/api/health/ready');
    expect(ready.body).toEqual({ status: 'ready', checks: { database: 'ok', migrations: 'ok', storage: 'ok' } });
    const big = await http().post('/api/auth/login').set('Content-Type', 'application/json').send(JSON.stringify({ username: 'x'.repeat(3 * 1024 * 1024), password: 'y' }));
    expect(big.status).toBe(413);
  });

  it('every protected route refuses anonymous callers', async () => {
    const routes = ['/api/auth/me', '/api/publishing/packages', '/api/commerce/products', '/api/schools', '/api/licensing/pools', '/api/school/overview', '/api/classes',
      '/api/teacher/assessments', '/api/teacher/games', '/api/student/home', '/api/library', '/api/ai/status', '/api/audit', '/api/catalog/grades'];
    for (const r of routes) expect([r, (await http().get(r)).status]).toEqual([r, 401]);
  });

  it('roles cannot reach other roles\' areas', async () => {
    const kid = await login(app, 'student1', 'Student@123', 'SUN01');
    const teacher = await login(app, 'teacher1', 'Teacher@12345', 'SUN01');
    const principal = await login(app, 'principal', 'School@12345', 'SUN01');
    const sales = await login(app, 'sales', 'Admin@12345');
    const deny: [Agent, string][] = [
      [kid, '/api/teacher/assessments'], [kid, '/api/school/users'], [kid, '/api/publishing/packages'], [kid, '/api/licensing/pools'], [kid, '/api/ai/usage'],
      [teacher, '/api/school/users'], [teacher, '/api/publishing/packages'], [teacher, '/api/licensing/pools'], [teacher, '/api/schools'],
      [principal, '/api/publishing/packages'], [principal, '/api/licensing/pools'], [principal, '/api/commerce/orders'],
      [sales, '/api/publishing/packages'], [sales, '/api/school/overview'],
    ];
    for (const [a, r] of deny) expect([r, (await a.get(r)).status]).toEqual([r, 403]);
    expect((await sales.post('/api/commerce/orders/00000000-0000-0000-0000-000000000000/fulfil')).status).toBe(403);
  });

  it('no endpoint leaks another school\'s data (tenant sweep)', async () => {
    const { rows } = await owner.query(`SELECT s.id::text AS id FROM schools s WHERE s.code = 'SUN01'
      UNION SELECT u.id::text FROM users u JOIN schools s ON s.id = u.school_id WHERE s.code = 'SUN01'
      UNION SELECT c.id::text FROM classes c JOIN schools s ON s.id = c.school_id WHERE s.code = 'SUN01'
      UNION SELECT a.id::text FROM assessments a JOIN schools s ON s.id = a.school_id WHERE s.code = 'SUN01'
      UNION SELECT p.id::text FROM license_pools p JOIN schools s ON s.id = p.school_id WHERE s.code = 'SUN01'`);
    const secrets = rows.map((r: any) => r.id);
    expect(secrets.length).toBeGreaterThanOrEqual(8);
    const [p, t, k] = await Promise.all([login(app, 'principal', 'School@12345', 'GVS02'), login(app, 'teacher1', 'Teacher@12345', 'GVS02'), login(app, 'student1', 'Student@123', 'GVS02')]);
    const sweep: [Agent, string[]][] = [
      [p, ['/api/school/overview', '/api/school/users?pageSize=100', '/api/school/pools', '/api/school/transfers', '/api/classes', '/api/audit?pageSize=100', '/api/ai/usage', '/api/library']],
      [t, ['/api/classes?mine=true', '/api/teacher/assessments', '/api/teacher/books', '/api/teacher/question-bank', '/api/teacher/lesson-plans', '/api/teacher/games', '/api/ai/generations']],
      [k, ['/api/student/home', '/api/student/homework', '/api/student/games', '/api/student/achievements', '/api/student/report', '/api/library']],
    ];
    for (const [agent, routes] of sweep) for (const r of routes) {
      const res = await agent.get(r);
      expect([r, res.status]).toEqual([r, 200]);
      const body = JSON.stringify(res.body);
      for (const s of secrets) expect([r, body.includes(s)]).toEqual([r, false]);
    }
  });

  it('Updates (self-update) are super-admin only and refused where the program cannot replace itself', async () => {
    const admin = await login(app, 'admin', 'Admin@12345');
    const editor = await login(app, 'editor', 'Admin@12345');
    const principal = await login(app, 'principal', 'School@12345', 'SUN01');
    expect((await editor.get('/api/system/updates')).status).toBe(403);
    expect((await principal.get('/api/system/updates')).status).toBe(403);
    expect((await http().get('/api/system/updates')).status).toBe(401);
    expect((await admin.get('/api/system/updates')).body).toEqual({ supported: false });
    const apply = await admin.post('/api/system/updates/apply').send({ password: 'Admin@12345' });
    expect(apply.status).toBe(403);
    expect(apply.body.message).toMatch(/cPanel/);
  });
});
