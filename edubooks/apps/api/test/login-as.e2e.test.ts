import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createApp, login, ownerPool } from './helpers';

describe('Super admin → Users: school folders and "Log in as"', () => {
  let app: INestApplication; const owner = ownerPool();
  beforeAll(async () => { app = await createApp(); });
  afterAll(async () => { await owner.end(); await app.close(); });

  it('lists schools as folders with counts and their users by role', async () => {
    const a = await login(app, 'admin', 'Admin@12345');
    const schools = (await a.get('/api/admin/users/schools')).body;
    const sun = schools.find((s: any) => s.code === 'SUN01');
    expect(sun).toMatchObject({ name: expect.any(String) });
    expect(sun.teachers).toBeGreaterThan(0); expect(sun.students).toBeGreaterThan(0); expect(sun.admins).toBeGreaterThan(0);
    const teachers = (await a.get(`/api/admin/users?schoolId=${sun.id}&role=TEACHER`)).body;
    expect(teachers.items.some((u: any) => u.username === 'teacher1')).toBe(true);
    const found = (await a.get(`/api/admin/users?schoolId=${sun.id}&role=STUDENT&search=student1`)).body;
    expect(found.items[0].username).toBe('student1');
  });

  it('only the super admin may use it', async () => {
    const editor = await login(app, 'editor', 'Admin@12345');
    expect((await editor.get('/api/admin/users/schools')).status).toBe(403);
    const principal = await login(app, 'principal', 'School@12345', 'SUN01');
    expect((await principal.get('/api/admin/users/schools')).status).toBe(403);
    const { rows: [t] } = await owner.query(`SELECT u.id FROM users u JOIN schools s ON s.id = u.school_id WHERE s.code = 'SUN01' AND u.username = 'teacher1'`);
    expect((await principal.post(`/api/admin/users/${t.id}/login-as`)).status).toBe(403);
  });

  it('signs in as a teacher, a student and a school admin, and comes back', async () => {
    const agent = request.agent(app.getHttpServer());
    expect((await agent.post('/api/auth/login').send({ username: 'admin', password: 'Admin@12345' })).status).toBe(200);
    const ids = async (u: string) => (await owner.query(`SELECT u.id FROM users u JOIN schools s ON s.id = u.school_id WHERE s.code = 'SUN01' AND u.username = $1`, [u])).rows[0].id;
    for (const [username, home, area] of [['teacher1', '/teacher', '/api/teacher/assessments'], ['student1', '/learn', '/api/student/attendance'], ['principal', '/school', '/api/school/overview']] as const) {
      const r = await agent.post(`/api/admin/users/${await ids(username)}/login-as`);
      expect(r.status).toBe(200); expect(r.body.home).toBe(home);
      const me = (await agent.get('/api/auth/me')).body;
      expect(me.username).toBe(username);
      expect(me.impersonatedBy).toMatchObject({ name: expect.any(String) });
      expect((await agent.get(area)).status).toBe(200);
      // the publisher area is closed while signed in as them, and so is their password
      expect((await agent.get('/api/admin/users/schools')).status).toBe(403);
      expect((await agent.post('/api/auth/change-password').send({ currentPassword: 'x', newPassword: 'Something-new-1' })).status).toBe(403);
      const back = await agent.post('/api/auth/return');
      expect(back.status).toBe(200); expect(back.body.home).toBe('/admin/users');
      const again = (await agent.get('/api/auth/me')).body;
      expect(again.username).toBe('admin'); expect(again.impersonatedBy).toBeNull();
    }
    // every "log in as" is in the audit log
    const { rows } = await owner.query(`SELECT summary FROM audit_logs WHERE action = 'auth.login_as' ORDER BY created_at DESC LIMIT 3`);
    expect(rows.map((r: any) => r.summary).join(' | ')).toMatch(/Signed in as .*teacher/i);
    // the temporary sessions are closed
    const { rows: open } = await owner.query(`SELECT count(*)::int n FROM sessions WHERE impersonator_id IS NOT NULL AND revoked_at IS NULL`);
    expect(open[0].n).toBe(0);
  });

  it('refuses suspended accounts and publisher staff accounts', async () => {
    const a = await login(app, 'admin', 'Admin@12345');
    const { rows: [ed] } = await owner.query(`SELECT id FROM users WHERE username = 'editor' AND school_id IS NULL`);
    expect((await a.post(`/api/admin/users/${ed.id}/login-as`)).status).toBe(404);
    const principal = await login(app, 'principal', 'School@12345', 'SUN01');
    const [o] = (await principal.post('/api/school/users').send({ role: 'TEACHER', users: [{ displayName: 'Suspended Loginas' }] })).body;
    await owner.query(`UPDATE users SET status = 'SUSPENDED' WHERE id = $1`, [o.id]);
    try { expect((await a.post(`/api/admin/users/${o.id}/login-as`)).status).toBe(400); }
    finally { await owner.query(`UPDATE users SET status = 'ACTIVE' WHERE id = $1`, [o.id]); }
  });
});
