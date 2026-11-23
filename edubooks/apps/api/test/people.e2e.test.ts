import { createApp, login, ownerPool } from './helpers';

const JPEG = `data:image/jpeg;base64,${Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(300, 7)]).toString('base64')}`;

describe('Profile photos, the sales team with their own demo accounts, and the welcome window', () => {
  let app: any; let admin: any; let teacher: any; let student: any; let other: any; const uname = `sales${Date.now() % 1e7}`; let staffId: string;
  beforeAll(async () => {
    app = await createApp(); admin = await login(app, 'admin', 'Admin@12345');
    teacher = await login(app, 'teacher1', 'Teacher@12345', 'SUN01'); student = await login(app, 'student1', 'Student@123', 'SUN01');
  });
  afterAll(async () => {
    const o = ownerPool();
    if (staffId) {
      const gone = `(SELECT id FROM schools WHERE demo_owner_id = $1)`;
      for (const t of ['access_entitlements', 'license_assignments', 'license_seats', 'license_transfers', 'license_pools', 'license_adjustments']) await o.query(`DELETE FROM ${t} WHERE school_id IN ${gone}`, [staffId]);
      await o.query(`DELETE FROM schools WHERE demo_owner_id = $1`, [staffId]);
      await o.query(`DELETE FROM audit_logs WHERE actor_user_id = $1`, [staffId]).catch(() => undefined);
      await o.query(`DELETE FROM users WHERE id = $1`, [staffId]);
    }
    await o.query(`UPDATE users SET photo_key = NULL, photo_mime = NULL, photo_at = NULL WHERE username IN ('teacher1', 'student1')`);
    await o.end(); await app.close();
  });

  it('every user can set a profile photo; people in the same school can open it, others cannot', async () => {
    expect((await teacher.post('/api/me/photo').send({ image: 'data:image/jpeg;base64,AAAA' })).status).toBe(400);
    expect((await teacher.post('/api/me/photo').send({ image: `data:image/png;base64,${Buffer.alloc(300, 1).toString('base64')}` })).status).toBe(400); // not really a PNG
    const r = await teacher.post('/api/me/photo').send({ image: JPEG });
    expect(r.status).toBe(200); expect(r.body.photoUrl).toMatch(/^\/api\/users\/.+\/photo\?v=\d+$/);
    expect((await teacher.get('/api/auth/me')).body.photoUrl).toBe(r.body.photoUrl);
    const url = r.body.photoUrl.replace(/\?.*$/, '');
    const seen = await student.get(url); expect(seen.status).toBe(200); expect(seen.headers['content-type']).toBe('image/jpeg');
    expect((await admin.get(url)).status).toBe(200);
    // a student of another school cannot see it
    other = await login(app, 'student1', 'Student@123', 'SUN02').catch(() => null);
    if (other) expect((await other.get(url)).status).toBe(404);
    expect((await student.post('/api/me/photo').send({ image: JPEG })).status).toBe(200);
    expect((await student.delete('/api/me/photo')).body.photoUrl).toBeNull();
  });

  it('the super admin adds a sales person; the sales person gets their own demo school and opens the demo accounts', async () => {
    expect((await teacher.post('/api/admin/team').send({ displayName: 'X', username: 'xyz', role: 'PUBLISHER_SALES' })).status).toBe(403);
    const add = await admin.post('/api/admin/team').send({ displayName: 'Sara Sales', username: uname, role: 'PUBLISHER_SALES' });
    expect(add.status).toBe(201); staffId = add.body.id;
    expect((await admin.post('/api/admin/team').send({ displayName: 'Again', username: uname, role: 'PUBLISHER_SALES' })).status).toBe(409);
    expect((await admin.get('/api/admin/team')).body.find((u: any) => u.id === staffId)).toMatchObject({ username: uname, roles: ['PUBLISHER_SALES'], password: add.body.password });
    const sales = await login(app, uname, add.body.password);
    expect((await sales.get('/api/sales/my-demo')).body).toMatchObject({ school: null, logins: [] });
    const d = (await sales.post('/api/sales/my-demo')).body;
    expect(d.school.code).toMatch(/^DEMO\d+$/);
    expect(d.logins.map((l: any) => l.role)).toEqual(['SCHOOL_ADMIN', 'TEACHER', 'STUDENT', 'STUDENT', 'PARENT']);
    expect(d.logins.every((l: any) => l.password)).toBe(true);
    expect((await sales.post('/api/sales/my-demo')).status).toBe(409);
    // the demo teacher really works, with a class
    const t = d.logins.find((l: any) => l.role === 'TEACHER');
    const demoTeacher = await login(app, t.username, t.password, d.school.code);
    expect((await demoTeacher.get('/api/auth/me')).body.mustChangePassword).toBe(false);
    expect((await demoTeacher.get('/api/classes?mine=true')).body[0].name).toBe('Demo Class');
    // open as the demo student with one click; back to the sales page
    const s = d.logins.find((l: any) => l.role === 'STUDENT');
    const open = await sales.post(`/api/admin/users/${s.id}/login-as`);
    expect(open.status).toBe(200); expect(open.body.home).toBe('/learn');
    expect((await sales.get('/api/auth/me')).body).toMatchObject({ id: s.id, impersonatedBy: { id: staffId } });
    expect((await sales.post('/api/auth/return')).body.home).toBe('/admin/my-demo');
    // a sales person cannot open real school accounts
    const real = (await admin.get('/api/admin/users/schools')).body.find((x: any) => x.code === 'SUN01');
    const kid = (await admin.get(`/api/admin/users?schoolId=${real.id}&role=STUDENT`)).body.items[0];
    expect((await sales.post(`/api/admin/users/${kid.id}/login-as`)).status).toBe(403);
    // new passwords for the demo accounts
    const again = (await sales.post('/api/sales/my-demo/reset-passwords')).body;
    expect(again.logins.find((l: any) => l.id === t.id).password).not.toBe(t.password);
    expect((await sales.post('/api/sales/my-demo/renew')).status).toBe(200);
    // suspended team members cannot sign in
    expect((await admin.post(`/api/admin/team/${staffId}/status`).send({ status: 'SUSPENDED' })).status).toBe(200);
    await expect(login(app, uname, add.body.password)).rejects.toThrow();
  });

  it('the welcome window shows the important things for each person', async () => {
    const w = (await teacher.get('/api/me/welcome')).body;
    expect(w).toHaveProperty('notifications'); expect(typeof w.unread).toBe('number'); expect(Array.isArray(w.todo)).toBe(true);
    expect((await student.get('/api/me/welcome')).status).toBe(200);
    expect((await admin.get('/api/me/welcome')).status).toBe(200);
  });
});
